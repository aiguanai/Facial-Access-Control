from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import cv2
import numpy as np
import face_recognition
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
from cryptography.fernet import Fernet
import os
from dotenv import load_dotenv
import logging
import requests

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Face Matching Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "faceauth"),
        user=os.getenv("DB_USER", "faceauth"),
        password=os.getenv("DB_PASSWORD", "changeme"),
    )

# Redis connection
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", "6379")),
    decode_responses=True,
)

# Encryption key for embeddings
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", Fernet.generate_key().decode())
cipher = Fernet(ENCRYPTION_KEY.encode())

# Initialize database
def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS face_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR(255) NOT NULL,
            encrypted_embedding BYTEA NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_face_templates_user ON face_templates(user_id);
    """)
    conn.commit()
    cur.close()
    conn.close()
    logger.info("Database initialized")

init_db()

class FaceMatchRequest(BaseModel):
    userId: str
    mediaId: str

class FaceEnrollRequest(BaseModel):
    userId: str
    mediaId: str

class FaceEmbeddingRequest(BaseModel):
    imageUrl: str

def detect_and_align_face(image: np.ndarray):
    """Detect face and align it"""
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Detect face locations
    face_locations = face_recognition.face_locations(rgb_image, model="hog")
    
    if len(face_locations) == 0:
        return None, None
    
    if len(face_locations) > 1:
        raise ValueError("Multiple faces detected")
    
    # Get face encoding
    face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
    
    if len(face_encodings) == 0:
        return None, None
    
    return face_locations[0], face_encodings[0]

def download_image(url: str) -> np.ndarray:
    """Download image from URL"""
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    
    # Convert to numpy array
    nparr = np.frombuffer(response.content, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    return image

def encrypt_embedding(embedding: np.ndarray) -> bytes:
    """Encrypt face embedding using AES-GCM equivalent (Fernet)"""
    embedding_bytes = embedding.tobytes()
    return cipher.encrypt(embedding_bytes)

def decrypt_embedding(encrypted: bytes) -> np.ndarray:
    """Decrypt face embedding"""
    embedding_bytes = cipher.decrypt(encrypted)
    return np.frombuffer(embedding_bytes, dtype=np.float64)

@app.post("/face/embedding")
async def extract_embedding(request: FaceEmbeddingRequest):
    """Extract face embedding from image URL"""
    try:
        image = download_image(request.imageUrl)
        face_location, face_encoding = detect_and_align_face(image)
        
        if face_encoding is None:
            raise HTTPException(status_code=400, detail="No face detected")
        
        return {
            "embedding": face_encoding.tolist(),
            "faceLocation": face_location,
        }
    except Exception as e:
        logger.error(f"Error extracting embedding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/face/enroll")
async def enroll_face(request: FaceEnrollRequest):
    """Enroll a user's face template"""
    try:
        # Get media URL from media service
        media_service_url = os.getenv("MEDIA_SERVICE_URL", "http://localhost:3003")
        media_response = requests.get(f"{media_service_url}/media/{request.mediaId}")
        media_response.raise_for_status()
        media_data = media_response.json()
        
        # Download and process image
        image = download_image(media_data["url"])
        face_location, face_encoding = detect_and_align_face(image)
        
        if face_encoding is None:
            raise HTTPException(status_code=400, detail="No face detected in enrollment image")
        
        # Encrypt embedding
        encrypted_embedding = encrypt_embedding(face_encoding)
        
        # Store in database
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO face_templates (user_id, encrypted_embedding)
            VALUES (%s, %s)
            ON CONFLICT (user_id) 
            DO UPDATE SET encrypted_embedding = EXCLUDED.encrypted_embedding,
                          created_at = NOW()
        """, (request.userId, encrypted_embedding))
        conn.commit()
        cur.close()
        conn.close()
        
        logger.info(f"Face enrolled for user: {request.userId}")
        
        return {"success": True, "userId": request.userId}
    except Exception as e:
        logger.error(f"Error enrolling face: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/face/match")
async def match_face(request: FaceMatchRequest):
    """Match a face against enrolled template"""
    try:
        # Get media URL from media service
        media_service_url = os.getenv("MEDIA_SERVICE_URL", "http://localhost:3003")
        media_response = requests.get(f"{media_service_url}/media/{request.mediaId}")
        media_response.raise_for_status()
        media_data = media_response.json()
        
        # Download and process image
        image = download_image(media_data["url"])
        face_location, face_encoding = detect_and_align_face(image)
        
        if face_encoding is None:
            raise HTTPException(status_code=400, detail="No face detected")
        
        # Get enrolled template
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT encrypted_embedding FROM face_templates WHERE user_id = %s",
            (request.userId,)
        )
        result = cur.fetchone()
        cur.close()
        conn.close()
        
        if not result:
            raise HTTPException(status_code=404, detail="User not enrolled")
        
        # Decrypt and compare
        enrolled_embedding = decrypt_embedding(result["encrypted_embedding"])
        
        # Calculate cosine similarity
        similarity = face_recognition.face_distance([enrolled_embedding], face_encoding)[0]
        match_score = 1 - similarity  # Convert distance to similarity
        
        logger.info(f"Face match for user {request.userId}: {match_score:.4f}")
        
        return {
            "matchScore": float(match_score),
            "matched": match_score >= 0.7,
            "userId": request.userId,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error matching face: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    try:
        conn = get_db_connection()
        conn.close()
        redis_client.ping()
        return {"status": "ok", "service": "face-matching"}
    except Exception as e:
        return {"status": "error", "service": "face-matching", "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3004")))

