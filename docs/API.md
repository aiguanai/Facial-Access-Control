# API Documentation

## Base URL

Production: `https://faceauth.example.com/api`
Development: `http://localhost:3000/api`

## Authentication Flow

### 1. Start Login

```http
POST /auth/login/start
Content-Type: application/json

{
  "userId": "user123",
  "deviceId": "device-fingerprint"
}
```

**Response:**
```json
{
  "sessionId": "session_1234567890_abc",
  "challengeScript": {
    "type": "random",
    "challenges": [
      { "type": "blink", "duration": 2000 },
      { "type": "headTurn", "direction": "left" },
      { "type": "colorFlash", "color": "red" }
    ]
  },
  "nextStep": "capture_face"
}
```

### 2. Verify Login

```http
POST /auth/login/verify
Content-Type: application/json

{
  "sessionId": "session_1234567890_abc",
  "mediaId": "media-uuid",
  "challengeResponse": {
    "blinkDetected": true,
    "headTurnCompleted": true,
    "colorFlashResponse": "red"
  },
  "behaviouralData": {
    "keystrokeTimings": [100, 150, 120, ...],
    "mouseMovements": [
      { "x": 100, "y": 200, "timestamp": 1234567890 }
    ],
    "deviceFingerprint": "fingerprint-hash"
  }
}
```

**Response (ALLOW):**
```json
{
  "sessionId": "session_1234567890_abc",
  "decision": "ALLOW",
  "token": "paseto-token",
  "scores": {
    "face": 0.93,
    "liveness": 0.89,
    "behaviour": 0.81,
    "risk": "low"
  },
  "explanation": "All biometric checks passed"
}
```

**Response (CHALLENGE):**
```json
{
  "sessionId": "session_1234567890_abc",
  "decision": "CHALLENGE",
  "nextStep": "otp_verification",
  "scores": { ... },
  "explanation": "Additional verification required"
}
```

### 3. Complete OTP Verification

```http
POST /auth/login/otp-complete
Content-Type: application/json

{
  "sessionId": "session_1234567890_abc",
  "otpCode": "123456"
}
```

## Media Service

### Upload Media

```http
POST /media/upload
Content-Type: multipart/form-data

file: <binary>
owner_id: user123
```

**Response:**
```json
{
  "mediaId": "media-uuid",
  "url": "/media/media-uuid",
  "expiresAt": "2024-01-01T00:00:00Z"
}
```

## Enrollment

### Start Face Enrollment

```http
POST /enrollment/face/start
Content-Type: application/json

{
  "userId": "user123"
}
```

### Complete Face Enrollment

```http
POST /enrollment/face/complete
Content-Type: application/json

{
  "userId": "user123",
  "mediaId": "media-uuid"
}
```

### Submit Behavioural Enrollment

```http
POST /enrollment/behaviour/submit
Content-Type: application/json

{
  "userId": "user123",
  "behaviouralData": {
    "keystrokeTimings": [...],
    "mouseMovements": [...],
    "deviceFingerprint": "..."
  }
}
```

## Session Management

### Verify Token

```http
POST /session/verify
Content-Type: application/json

{
  "token": "paseto-token"
}
```

### Revoke Token

```http
POST /session/revoke
Content-Type: application/json

{
  "tokenId": "token-uuid"
}
```

## Audit

### Get Audit Events

```http
GET /audit/events?userId=user123&limit=100&offset=0
```

### Get User Audit Trail

```http
GET /audit/user/:userId
```

## Health Checks

All services expose a health endpoint:

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "service-name"
}
```

