#!/bin/bash
# Script to check and fix Docker in WSL

echo "Checking Docker setup in WSL..."

# Check if Docker is accessible
if command -v docker &> /dev/null; then
    echo "✅ Docker is available"
    docker --version
else
    echo "❌ Docker not found"
    echo ""
    echo "Please enable WSL integration in Docker Desktop:"
    echo "1. Open Docker Desktop"
    echo "2. Settings → Resources → WSL Integration"
    echo "3. Enable toggle and check 'Ubuntu'"
    echo "4. Click 'Apply & Restart'"
    exit 1
fi

# Check Docker Compose
if command -v docker-compose &> /dev/null; then
    echo "✅ docker-compose is available"
    docker-compose --version
elif docker compose version &> /dev/null 2>&1; then
    echo "✅ docker compose (V2) is available"
    docker compose version
    echo ""
    echo "Note: Use 'docker compose' instead of 'docker-compose'"
else
    echo "⚠️  docker-compose not found, but Docker is available"
    echo "You can use: docker compose (V2 syntax)"
fi

echo ""
echo "Testing Docker connection..."
if docker ps &> /dev/null; then
    echo "✅ Docker is running and accessible"
else
    echo "❌ Cannot connect to Docker daemon"
    echo "Make sure Docker Desktop is running"
fi

