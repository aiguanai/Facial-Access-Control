# Deepfake-Resistant Facial Authentication Framework

Production-grade microservices architecture for secure online banking authentication with advanced anti-spoofing and behavioral biometrics.

## Architecture Overview

This system implements a zero-trust, microservices-based authentication framework with:
- **13 Microservices** for complete authentication orchestration
- **GPU-optimized ML inference** for face matching and liveness detection
- **Behavioral biometrics** for continuous authentication
- **Multi-level deepfake defense** with 5-feature advanced model
- **Kubernetes-native** deployment with auto-scaling
- **End-to-end observability** with OpenTelemetry, Prometheus, and Grafana

## Services

1. **API Gateway** - Edge service with TLS, rate limiting, routing
2. **Auth Orchestration** - Core login flow coordinator
3. **Media Service** - S3/MinIO storage for videos/images
4. **Face Matching Service** - PyTorch-based face detection and matching
5. **Liveness & Anti-Spoof Service** - Advanced 5-feature liveness detection
6. **Behavioural Biometrics Service** - Typing/mouse/device fingerprint analysis
7. **Risk Engine** - Score fusion and policy evaluation
8. **MFA/OTP Service** - Multi-factor authentication
9. **Token/Session Service** - PASETO token management
10. **Profile & Enrollment Service** - User enrollment management
11. **Audit & Compliance Service** - Immutable audit logging
12. **Analytics & Model Training** - Offline model training
13. **Admin Console** - Policy management and monitoring

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Kubernetes cluster (or minikube/kind)
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+
- Redis 7+

### Development Setup

#### Option 1: Windows PowerShell

```powershell
# Start infrastructure services
docker-compose up -d

# Start all microservices
npm run dev
# OR directly: powershell -ExecutionPolicy Bypass -File ./dev.ps1

# Run tests
npm run test

# Build all services
npm run build

# Clean up
npm run clean
```

#### Option 2: WSL (Windows Subsystem for Linux) - Recommended

WSL provides a Linux environment where `make` works natively:

```bash
# In WSL terminal
cd /mnt/c/Users/ig134/Projects/FaceAuth

# Start infrastructure services
docker-compose up -d

# Start all microservices (make works in WSL!)
make dev

# Run tests
make test

# Build all services
make build

# Clean up
make clean
```

**WSL Setup Tips:**
- Install `make` if not present: `sudo apt-get update && sudo apt-get install make`
- Docker Desktop for Windows works with WSL2 - services will be accessible
- Use WSL paths: `/mnt/c/Users/ig134/Projects/FaceAuth` (adjust your username)
- Or clone the project inside WSL: `~/Projects/FaceAuth` for better performance

#### Option 3: Linux/macOS

```bash
# Start infrastructure services
docker-compose up -d

# Start all microservices
make dev
# OR: npm run dev:unix

# Run tests
make test
# OR: npm run test:unix

# Build all services
make build
# OR: npm run build:unix

# Clean up
make clean
# OR: npm run clean:unix
```

### Production Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Monitor services
kubectl get pods -n faceauth
```

## Security Features

- **Secure Camera Enforcement** - Browser extension + JS checks
- **Multi-Level Deepfake Defense** - Light reflection, micro-expressions, motion field analysis
- **AES-GCM Encrypted Embeddings** - All biometric data encrypted at rest
- **PASETO Tokens** - Secure token format (no JWT vulnerabilities)
- **TLS 1.3** - End-to-end encryption
- **Anti-Replay Protection** - Per-frame timestamping and motion signature verification

## Documentation

- [API Documentation](./docs/API.md)
- [Architecture Documentation](./docs/ARCHITECTURE.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

## License

Proprietary - All Rights Reserved
