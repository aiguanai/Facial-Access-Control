#!/bin/bash
# Install npm dependencies for all Node.js services

set -e

echo "Installing npm dependencies for all services..."

services=(
    "api-gateway"
    "auth-orchestration"
    "media-service"
    "behavioural-service"
    "risk-engine"
    "mfa-service"
    "session-service"
    "profile-service"
    "audit-service"
    "analytics-service"
)

for service in "${services[@]}"; do
    if [ -d "services/$service" ]; then
        echo "Installing dependencies for $service..."
        cd "services/$service"
        if [ -f "package.json" ]; then
            npm install
            echo "✅ $service dependencies installed"
        else
            echo "⚠️  $service: No package.json found"
        fi
        cd ../..
    else
        echo "⚠️  $service: Directory not found"
    fi
done

echo ""
echo "✅ All npm dependencies installed!"

