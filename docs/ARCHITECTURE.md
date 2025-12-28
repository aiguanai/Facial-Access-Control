# Architecture Documentation

## System Overview

The FaceAuth system is a production-grade, microservices-based authentication framework designed for secure online banking with advanced anti-spoofing capabilities.

## Service Architecture

### 1. API Gateway
- **Port**: 3000
- **Responsibilities**: 
  - TLS termination
  - Rate limiting
  - Request routing
  - Audit logging to Kafka
- **Technology**: Node.js/Express

### 2. Auth Orchestration Service
- **Port**: 3001
- **Responsibilities**:
  - Coordinates authentication flow
  - Manages challenge generation
  - Orchestrates all verification steps
- **Technology**: Node.js/Express

### 3. Media Service
- **Port**: 3003
- **Responsibilities**:
  - Video/image storage (MinIO/S3)
  - Signed URL generation
  - Auto-cleanup of expired media
- **Technology**: Node.js/Express, MinIO

### 4. Face Matching Service
- **Port**: 3004
- **Responsibilities**:
  - Face detection and alignment
  - Embedding extraction
  - Template matching
- **Technology**: Python/FastAPI, PyTorch, face-recognition
- **GPU**: Required

### 5. Liveness & Anti-Spoof Service
- **Port**: 3005
- **Responsibilities**:
  - Blink detection
  - Head pose validation
  - Color flash test
  - Deepfake detection
- **Technology**: Python/FastAPI, MediaPipe, OpenCV
- **GPU**: Required

### 6. Behavioural Biometrics Service
- **Port**: 3006
- **Responsibilities**:
  - Keystroke timing analysis
  - Mouse movement analysis
  - Device fingerprinting
  - Trust score calculation
- **Technology**: Node.js/Express

### 7. Risk Engine
- **Port**: 3007
- **Responsibilities**:
  - Score fusion
  - Policy evaluation
  - Decision making (ALLOW/CHALLENGE/DENY)
- **Technology**: Node.js/Express

### 8. MFA/OTP Service
- **Port**: 3008
- **Responsibilities**:
  - OTP generation
  - Email/SMS delivery
  - OTP verification
- **Technology**: Node.js/Express, Nodemailer, Twilio

### 9. Session Service
- **Port**: 3009
- **Responsibilities**:
  - PASETO token issuance
  - Session management
  - Token revocation
- **Technology**: Node.js/Express, PASETO

### 10. Profile & Enrollment Service
- **Port**: 3002
- **Responsibilities**:
  - Enrollment flow management
  - Enrollment status tracking
- **Technology**: Node.js/Express

### 11. Audit & Compliance Service
- **Port**: 3011
- **Responsibilities**:
  - Immutable audit logging
  - Event storage
  - Compliance reporting
- **Technology**: Node.js/Express, Kafka

### 12. Analytics & Model Training Service
- **Port**: 3012
- **Responsibilities**:
  - Model version management
  - Threshold recommendations
  - Training pipeline coordination
- **Technology**: Node.js/Express

## Data Flow

1. User initiates login → API Gateway
2. API Gateway → Auth Orchestration
3. Auth Orchestration coordinates:
   - Face Matching (via Media Service)
   - Liveness Detection
   - Behavioural Analysis
   - Risk Evaluation
   - MFA (if needed)
4. Final decision → Session Service (token issuance)
5. All events → Audit Service (via Kafka)

## Security Features

- **AES-GCM Encryption**: All biometric embeddings encrypted at rest
- **PASETO Tokens**: Secure token format (no JWT vulnerabilities)
- **TLS 1.3**: End-to-end encryption
- **Anti-Replay**: Per-frame timestamping
- **Multi-Level Deepfake Defense**: 5-feature advanced model

## Infrastructure

- **Kubernetes**: Container orchestration
- **PostgreSQL**: Primary database
- **Redis**: Caching and session storage
- **Kafka**: Event streaming
- **MinIO**: Object storage
- **Prometheus + Grafana**: Monitoring
- **OpenTelemetry**: Distributed tracing

