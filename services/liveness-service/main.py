from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import cv2
import numpy as np
import mediapipe as mp
import requests
import os
from dotenv import load_dotenv
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Liveness & Anti-Spoof Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MediaPipe face detection
mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

class ChallengeResponse(BaseModel):
    blinkDetected: bool
    headTurnCompleted: bool
    colorFlashResponse: Optional[str] = None

class LivenessVerifyRequest(BaseModel):
    mediaId: str
    challengeResponse: ChallengeResponse

def download_image(url: str) -> np.ndarray:
    """Download image from URL"""
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    nparr = np.frombuffer(response.content, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return image

def detect_blinks(images: List[np.ndarray]) -> float:
    """Detect blinks in image sequence using eye aspect ratio (EAR)"""
    if len(images) < 2:
        return 0.0
    
    mp_face_mesh_instance = mp_face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5
    )
    
    blink_count = 0
    total_frames = len(images)
    
    for image in images:
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = mp_face_mesh_instance.process(rgb_image)
        
        if results.multi_face_landmarks:
            face_landmarks = results.multi_face_landmarks[0]
            
            # Get eye landmarks (left and right)
            # MediaPipe face mesh has specific indices for eyes
            left_eye_top = face_landmarks.landmark[159]
            left_eye_bottom = face_landmarks.landmark[145]
            right_eye_top = face_landmarks.landmark[386]
            right_eye_bottom = face_landmarks.landmark[374]
            
            # Calculate eye aspect ratio
            left_ear = abs(left_eye_top.y - left_eye_bottom.y)
            right_ear = abs(right_eye_top.y - right_eye_bottom.y)
            avg_ear = (left_ear + right_ear) / 2.0
            
            # EAR threshold for blink detection
            if avg_ear < 0.02:  # Eye is closed
                blink_count += 1
    
    return blink_count / total_frames if total_frames > 0 else 0.0

def detect_head_pose(image: np.ndarray) -> dict:
    """Detect head pose (yaw, pitch, roll)"""
    mp_face_mesh_instance = mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5
    )
    
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = mp_face_mesh_instance.process(rgb_image)
    
    if not results.multi_face_landmarks:
        return {"yaw": 0, "pitch": 0, "roll": 0, "detected": False}
    
    face_landmarks = results.multi_face_landmarks[0]
    
    # Get key facial points for pose estimation
    # Using nose tip, chin, left/right face edge points
    h, w, _ = image.shape
    
    nose_tip = face_landmarks.landmark[4]
    chin = face_landmarks.landmark[175]
    left_face = face_landmarks.landmark[234]
    right_face = face_landmarks.landmark[454]
    
    # Convert to pixel coordinates
    nose = np.array([nose_tip.x * w, nose_tip.y * h])
    chin_point = np.array([chin.x * w, chin.y * h])
    left = np.array([left_face.x * w, left_face.y * h])
    right = np.array([right_face.x * w, right_face.y * h])
    
    # Calculate yaw (left-right rotation)
    face_width = np.linalg.norm(right - left)
    nose_offset = nose[0] - (left[0] + right[0]) / 2
    yaw = np.arctan2(nose_offset, face_width / 2) * 180 / np.pi
    
    # Calculate pitch (up-down rotation)
    face_center_y = (left[1] + right[1]) / 2
    pitch = np.arctan2(nose[1] - face_center_y, face_width / 2) * 180 / np.pi
    
    return {
        "yaw": float(yaw),
        "pitch": float(pitch),
        "roll": 0.0,  # Simplified
        "detected": True
    }

def color_flash_test(image: np.ndarray, expected_color: str) -> float:
    """Test color flash reflection on face"""
    # Convert to HSV for better color detection
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    
    # Define color ranges
    color_ranges = {
        "red": [(0, 50, 50), (10, 255, 255)],
        "green": [(50, 50, 50), (70, 255, 255)],
        "blue": [(100, 50, 50), (130, 255, 255)],
    }
    
    if expected_color not in color_ranges:
        return 0.0
    
    lower, upper = color_ranges[expected_color]
    mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
    
    # Check if color is present in face region
    # This is simplified - in production, you'd detect face first
    color_pixels = np.sum(mask > 0)
    total_pixels = mask.shape[0] * mask.shape[1]
    
    return color_pixels / total_pixels if total_pixels > 0 else 0.0

def deepfake_detection(image: np.ndarray) -> float:
    """Deepfake detection using heuristics"""
    # This is a simplified version
    # In production, you'd use a trained CNN/Transformer model
    
    # Check for artifacts
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Laplacian variance (blur detection)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    
    # Edge consistency check
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / (edges.shape[0] * edges.shape[1])
    
    # Simple heuristic score (higher = more likely real)
    # In production, use a trained model
    score = min(1.0, (laplacian_var / 100.0) * edge_density * 10)
    
    return score

@app.post("/liveness/verify")
async def verify_liveness(request: LivenessVerifyRequest):
    """Verify liveness using 5-feature advanced model"""
    try:
        # Get media URL from media service
        media_service_url = os.getenv("MEDIA_SERVICE_URL", "http://localhost:3003")
        media_response = requests.get(f"{media_service_url}/media/{request.mediaId}")
        media_response.raise_for_status()
        media_data = media_response.json()
        
        # Download image
        image = download_image(media_data["url"])
        
        scores = {
            "blink": 0.0,
            "headPose": 0.0,
            "colorFlash": 0.0,
            "deepfake": 0.0,
        }
        
        # Feature 1: Blink Detection
        if request.challengeResponse.blinkDetected:
            # In production, analyze video sequence
            # For now, use single image heuristic
            blink_score = 0.8 if request.challengeResponse.blinkDetected else 0.0
            scores["blink"] = blink_score
        else:
            scores["blink"] = 0.0
        
        # Feature 2: Head Pose Validation
        head_pose = detect_head_pose(image)
        if head_pose["detected"]:
            # Check if head turn was completed
            if request.challengeResponse.headTurnCompleted:
                # Validate actual head pose matches challenge
                yaw_abs = abs(head_pose["yaw"])
                head_pose_score = 1.0 if yaw_abs > 10 else 0.5
                scores["headPose"] = head_pose_score
            else:
                scores["headPose"] = 0.0
        else:
            scores["headPose"] = 0.0
        
        # Feature 3: Color Flash Test
        if request.challengeResponse.colorFlashResponse:
            color_score = color_flash_test(image, request.challengeResponse.colorFlashResponse)
            scores["colorFlash"] = color_score
        else:
            scores["colorFlash"] = 0.0
        
        # Feature 4: Deepfake Detection
        deepfake_score = deepfake_detection(image)
        scores["deepfake"] = deepfake_score
        
        # Feature 5: Motion Field Analysis (simplified)
        # In production, analyze video frames for motion consistency
        motion_score = 0.85  # Placeholder
        
        # Weighted fusion
        weights = {
            "blink": 0.25,
            "headPose": 0.25,
            "colorFlash": 0.20,
            "deepfake": 0.20,
            "motion": 0.10,
        }
        
        liveness_score = (
            scores["blink"] * weights["blink"] +
            scores["headPose"] * weights["headPose"] +
            scores["colorFlash"] * weights["colorFlash"] +
            scores["deepfake"] * weights["deepfake"] +
            motion_score * weights["motion"]
        )
        
        logger.info(f"Liveness verification: {liveness_score:.4f}")
        
        return {
            "livenessScore": float(liveness_score),
            "scores": scores,
            "passed": liveness_score >= 0.8,
        }
    except Exception as e:
        logger.error(f"Error in liveness verification: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "service": "liveness-service"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3005")))

