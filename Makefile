.PHONY: dev build test clean docker-build k8s-deploy

# Install npm dependencies
install-deps:
	@echo "Installing npm dependencies..."
	@cd services/api-gateway && (test -d node_modules || npm install)
	@cd services/auth-orchestration && (test -d node_modules || npm install)
	@cd services/media-service && (test -d node_modules || npm install)
	@cd services/behavioural-service && (test -d node_modules || npm install)
	@cd services/risk-engine && (test -d node_modules || npm install)
	@cd services/mfa-service && (test -d node_modules || npm install)
	@cd services/session-service && (test -d node_modules || npm install)
	@cd services/profile-service && (test -d node_modules || npm install)
	@cd services/audit-service && (test -d node_modules || npm install)
	@cd services/analytics-service && (test -d node_modules || npm install)
	@echo "✅ All npm dependencies installed"

# Stop all services
stop:
	@echo "Stopping all services..."
	@-pkill -f "tsx watch" 2>/dev/null || true
	@-pkill -f "uvicorn" 2>/dev/null || true
	@for port in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3011 3012; do \
		pid=$$(lsof -ti:$$port 2>/dev/null || echo ""); \
		if [ ! -z "$$pid" ]; then \
			kill -9 $$pid 2>/dev/null || true; \
		fi; \
	done
	@echo "✅ Services stopped"

# Development
dev: install-deps
	@which docker-compose > /dev/null 2>&1 && docker-compose up -d || docker compose up -d
	@echo "Waiting for Kafka to be ready..."
	@sleep 5
	@echo "Starting all microservices..."
	@cd services/api-gateway && npm run dev &
	@cd services/auth-orchestration && npm run dev &
	@cd services/media-service && npm run dev &
	@bash -c "cd services/face-matching && (test -d venv || python3 -m venv venv) && . venv/bin/activate && pip install -q -r requirements.txt > /dev/null 2>&1 && python -m uvicorn main:app --reload --host 0.0.0.0 --port 3004" &
	@bash -c "cd services/liveness-service && (test -d venv || python3 -m venv venv) && . venv/bin/activate && pip install -q -r requirements.txt > /dev/null 2>&1 && python -m uvicorn main:app --reload --host 0.0.0.0 --port 3005" &
	@cd services/behavioural-service && npm run dev &
	@cd services/risk-engine && npm run dev &
	@cd services/mfa-service && npm run dev &
	@cd services/session-service && npm run dev &
	@cd services/profile-service && npm run dev &
	@cd services/audit-service && npm run dev &
	@cd services/analytics-service && npm run dev &
	@echo "All services starting... Check logs above for any errors."
	@echo "Press Ctrl+C to stop all services"
	@wait

# Build all services
build:
	@echo "Building all services..."
	@cd services/api-gateway && npm run build
	@cd services/auth-orchestration && npm run build
	@cd services/media-service && npm run build
	@cd services/face-matching && docker build -t faceauth-face-matching:latest .
	@cd services/liveness-service && docker build -t faceauth-liveness:latest .
	@cd services/behavioural-service && npm run build
	@cd services/risk-engine && npm run build
	@cd services/mfa-service && npm run build
	@cd services/session-service && npm run build
	@cd services/profile-service && npm run build
	@cd services/audit-service && npm run build
	@cd services/analytics-service && npm run build

# Run tests
test:
	@echo "Running tests..."
	@cd services/api-gateway && npm test
	@cd services/auth-orchestration && npm test
	@cd services/media-service && npm test
	@cd services/face-matching && pytest
	@cd services/liveness-service && pytest
	@cd services/behavioural-service && npm test
	@cd services/risk-engine && npm test
	@cd services/mfa-service && npm test
	@cd services/session-service && npm test
	@cd services/profile-service && npm test
	@cd services/audit-service && npm test
	@cd services/analytics-service && npm test

# Clean
clean:
	@which docker-compose > /dev/null 2>&1 && docker-compose down -v || docker compose down -v
	@echo "Cleaned up all containers and volumes"

# Docker build all
docker-build:
	@which docker-compose > /dev/null 2>&1 && docker-compose build || docker compose build

# Kubernetes deploy
k8s-deploy:
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/configmaps/
	kubectl apply -f k8s/secrets/
	kubectl apply -f k8s/services/
	kubectl apply -f k8s/deployments/
	kubectl apply -f k8s/ingress/


