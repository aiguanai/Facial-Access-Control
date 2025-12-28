# PowerShell script for building all services
# Equivalent to: make build

Write-Host "Building all services..." -ForegroundColor Green

# Build Node.js services
$nodeServices = @(
    "api-gateway",
    "auth-orchestration",
    "media-service",
    "behavioural-service",
    "risk-engine",
    "mfa-service",
    "session-service",
    "profile-service",
    "audit-service",
    "analytics-service"
)

foreach ($service in $nodeServices) {
    Write-Host "`nBuilding $service..." -ForegroundColor Cyan
    Set-Location "services/$service"
    if (Test-Path "package.json") {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error building $service" -ForegroundColor Red
            Set-Location ../..
            exit 1
        }
    }
    Set-Location ../..
}

# Build Python services
Write-Host "`nBuilding Python services..." -ForegroundColor Cyan

# Face Matching
Write-Host "Building face-matching..." -ForegroundColor Cyan
Set-Location services/face-matching
docker build -t faceauth-face-matching:latest .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error building face-matching" -ForegroundColor Red
    Set-Location ../..
    exit 1
}
Set-Location ../..

# Liveness Service
Write-Host "Building liveness-service..." -ForegroundColor Cyan
Set-Location services/liveness-service
docker build -t faceauth-liveness:latest .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error building liveness-service" -ForegroundColor Red
    Set-Location ../..
    exit 1
}
Set-Location ../..

Write-Host "`nAll services built successfully!" -ForegroundColor Green

