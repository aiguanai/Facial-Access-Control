# Setup Guide

## Prerequisites

- **Docker** and **Docker Compose** (v2.0+)
- That's it! Everything runs in containers.

For local development without Docker:
- Node.js 20+ (LTS)
- Python 3.10+
- PostgreSQL 14+
- Redis 7+

## Quick Start

```bash
# Start everything (infrastructure + all 13 services)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop everything
docker-compose down
```

The frontend will be available at `http://localhost:3080`

## Development Mode

Development mode mounts your source code as volumes for hot reload:

```bash
# Start with hot reload enabled (uses docker-compose.override.yml automatically)
docker-compose up

# Rebuild a specific service after dependency changes
docker-compose up --build <service-name>
```

## Common Commands

```bash
make dev       # Start all services with docker-compose up
make stop      # Stop all services
make clean     # Stop and remove all volumes (fresh start)
make logs      # Tail logs from all services
make build     # Build all Docker images
make test      # Run tests for a service (interactive)
```

## Service Ports

| Service | Port | Description |
|---------|------|-------------|
| frontend | 3080 | Next.js web app |
| api-gateway | 3000 | Main API entry point |
| auth-orchestration | 3001 | Authentication flow |
| profile-service | 3002 | User enrollment |
| media-service | 3003 | File storage (MinIO) |
| face-matching | 3004 | Face detection (Python) |
| liveness-service | 3005 | Anti-spoof (Python) |
| behavioural-service | 3006 | Behavior analysis |
| risk-engine | 3007 | Risk scoring |
| mfa-service | 3008 | OTP/MFA |
| session-service | 3009 | Token management |
| audit-service | 3011 | Audit logging |
| analytics-service | 3012 | ML model management |

## Infrastructure Ports

| Service | Port |
|---------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO Console | 9001 |
| Kafka | 9092 |
| Prometheus | 9090 |
| Grafana | 3100 |

## Environment Variables

Copy `.env.example` to `.env` to customize:

```bash
cp .env.example .env
```

Key variables:
- `POSTGRES_PASSWORD` - Database password (default: changeme)
- `MINIO_ROOT_PASSWORD` - MinIO password (default: minioadmin)
- `GRAFANA_PASSWORD` - Grafana admin password (default: admin)

## Troubleshooting

**Services not connecting to Kafka:**
Kafka takes ~30 seconds to fully initialize. Wait and check `docker-compose logs kafka`.

**Permission denied (Docker on Linux):**
```bash
sudo usermod -aG docker $USER
# Then log out and back in
```

**Port already in use:**
```bash
docker-compose down
# Or check what's using the port:
lsof -i :3000
```
