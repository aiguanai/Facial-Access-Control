# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A production-grade microservices-based facial authentication framework for secure banking with anti-spoofing and behavioral biometrics. The system uses 13 microservices with GPU-optimized ML inference.

## Quick Start

Everything runs in Docker. No local Node.js or Python installation required.

```bash
docker compose up        # Start all services with hot reload
docker compose down      # Stop all services
```

Frontend: http://localhost:3080 | API: http://localhost:3000

## Common Commands

```bash
make dev       # Start all services (foreground, with logs)
make start     # Start all services (detached)
make stop      # Stop all services
make clean     # Stop and remove all volumes (fresh start)
make logs      # View logs from all services
make build     # Build all Docker images
make status    # View status of all services

# Run tests for a specific service
make test SERVICE=api-gateway

# Open shell in a running service
make shell SERVICE=api-gateway
```

## Architecture

### Service Flow
```
Frontend (3080) → API Gateway (3000) → Auth Orchestration (3001)
                                              ↓
    ┌───────────────────────────────────────────────────────────┐
    │ Media Service (3003)      - MinIO storage                 │
    │ Face Matching (3004)      - PyTorch face detection        │
    │ Liveness Service (3005)   - Anti-spoof detection          │
    │ Behavioural Service (3006)- Keystroke/mouse analysis      │
    │ Risk Engine (3007)        - Score fusion                  │
    │ MFA Service (3008)        - OTP/Email/SMS                 │
    │ Session Service (3009)    - PASETO tokens                 │
    │ Audit Service (3011)      - Kafka event logging           │
    └───────────────────────────────────────────────────────────┘
```

### Technology Stack
- **Node.js Services**: Express + TypeScript (Node 20)
- **Python ML Services**: FastAPI + PyTorch + OpenCV (Python 3.10)
- **Frontend**: Next.js 14 + React 18 + Tailwind CSS
- **Infrastructure**: PostgreSQL 14, Redis 7, Kafka, MinIO

### Key Directories
- `services/` - 10 Node.js + 2 Python microservices
- `frontend/` - Next.js application
- `k8s/` - Kubernetes manifests
- `monitoring/` - Prometheus/Grafana config

### Service Patterns
- Node.js: `src/index.ts` entry, Zod validation, Pino logging
- Python: `main.py` entry, FastAPI with uvicorn
- All services expose `/health` endpoint

## Development

The `docker-compose.override.yml` automatically mounts source code for hot reload:
- Node.js services: Changes to `src/` trigger rebuild
- Python services: Changes trigger uvicorn reload
- Frontend: Next.js hot module replacement

To rebuild a specific service after dependency changes:
```bash
docker compose up --build <service-name>
```

## Infrastructure Ports

| Service | Port |
|---------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO Console | 9001 |
| Kafka | 9092 |
| Prometheus | 9090 |
| Grafana | 3100 |
