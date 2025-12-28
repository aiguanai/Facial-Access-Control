# Deployment Guide

## Prerequisites

- Docker & Docker Compose
- Kubernetes cluster (or minikube/kind for local)
- kubectl configured
- PostgreSQL 14+
- Redis 7+
- Kafka (or use docker-compose)

## Local Development Setup

### 1. Start Infrastructure Services

```bash
docker-compose up -d
```

This starts:
- PostgreSQL
- Redis
- MinIO
- Kafka + Zookeeper
- Prometheus
- Grafana

### 2. Build and Start Services

```bash
# Build all services
make build

# Start all services in development mode
make dev
```

### 3. Initialize Database

The services will auto-initialize their database schemas on first start. Alternatively, you can run migrations manually:

```bash
# Connect to PostgreSQL
psql -h localhost -U faceauth -d faceauth

# Run migrations (if any)
```

## Production Deployment

### 1. Build Docker Images

```bash
# Build all service images
docker build -t faceauth/api-gateway:latest services/api-gateway/
docker build -t faceauth/auth-orchestration:latest services/auth-orchestration/
# ... repeat for all services
```

### 2. Push to Container Registry

```bash
docker push faceauth/api-gateway:latest
# ... repeat for all services
```

### 3. Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply configmaps
kubectl apply -f k8s/configmaps/

# Apply secrets (create these first)
kubectl create secret generic app-secrets \
  --from-literal=db-password=your-password \
  --from-literal=paseto-secret-key=your-key \
  -n faceauth

# Deploy services
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/
kubectl apply -f k8s/ingress/
```

### 4. Verify Deployment

```bash
kubectl get pods -n faceauth
kubectl get services -n faceauth
kubectl logs -f deployment/api-gateway -n faceauth
```

## Environment Variables

Key environment variables to configure:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `REDIS_HOST`, `REDIS_PORT`
- `KAFKA_BROKER`
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- `PASETO_SECRET_KEY` (generate a secure random key)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (for email OTP)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (for SMS OTP)

## Monitoring

Access Grafana at `http://localhost:3000` (default credentials: admin/admin)

Access Prometheus at `http://localhost:9090`

## Troubleshooting

### Services not starting
- Check logs: `kubectl logs <pod-name> -n faceauth`
- Verify database connectivity
- Check Redis/Kafka connectivity

### GPU not available
- Face Matching and Liveness services require GPU
- For local development, you may need to modify resource requests
- In production, ensure GPU nodes are available

### High latency
- Check service health endpoints
- Review Prometheus metrics
- Verify network policies allow inter-service communication

