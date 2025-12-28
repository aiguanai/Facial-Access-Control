.PHONY: dev start stop clean logs build test shell

# Development - starts all services with hot reload
dev:
	docker compose up --build

# Production - starts all services detached
start:
	docker compose up -d --build

# Stop all services
stop:
	docker compose down

# Stop and remove all data (fresh start)
clean:
	docker compose down -v --remove-orphans

# View logs
logs:
	docker compose logs -f

# Build all images without starting
build:
	docker compose build

# Run tests for a specific service
# Usage: make test SERVICE=api-gateway
test:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Usage: make test SERVICE=<service-name>"; \
		echo "Available services: api-gateway, auth-orchestration, profile-service, media-service,"; \
		echo "  face-matching, liveness-service, behavioural-service, risk-engine,"; \
		echo "  mfa-service, session-service, audit-service, analytics-service, frontend"; \
	else \
		docker compose exec $(SERVICE) npm test 2>/dev/null || docker compose exec $(SERVICE) pytest; \
	fi

# Open shell in a running service
# Usage: make shell SERVICE=api-gateway
shell:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Usage: make shell SERVICE=<service-name>"; \
	else \
		docker compose exec $(SERVICE) sh; \
	fi

# Restart a specific service
# Usage: make restart SERVICE=api-gateway
restart:
	docker compose restart $(SERVICE)

# View status of all services
status:
	docker compose ps
