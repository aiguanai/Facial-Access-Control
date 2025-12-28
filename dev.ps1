# PowerShell script for development on Windows
# Equivalent to: make dev

Write-Host "Starting infrastructure services..." -ForegroundColor Green
docker-compose up -d

Write-Host "`nStarting all microservices..." -ForegroundColor Green
Write-Host "Note: Services will run in separate windows. Press Ctrl+C to stop." -ForegroundColor Yellow

# Start services in background jobs
$jobs = @()

# API Gateway
Start-Job -Name "api-gateway" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/api-gateway
    npm run dev
} | Out-Null
$jobs += "api-gateway"

# Auth Orchestration
Start-Job -Name "auth-orchestration" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/auth-orchestration
    npm run dev
} | Out-Null
$jobs += "auth-orchestration"

# Media Service
Start-Job -Name "media-service" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/media-service
    npm run dev
} | Out-Null
$jobs += "media-service"

# Face Matching (Python)
Start-Job -Name "face-matching" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/face-matching
    python -m uvicorn main:app --reload --host 0.0.0.0 --port 3004
} | Out-Null
$jobs += "face-matching"

# Liveness Service (Python)
Start-Job -Name "liveness-service" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/liveness-service
    python -m uvicorn main:app --reload --host 0.0.0.0 --port 3005
} | Out-Null
$jobs += "liveness-service"

# Behavioural Service
Start-Job -Name "behavioural-service" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/behavioural-service
    npm run dev
} | Out-Null
$jobs += "behavioural-service"

# Risk Engine
Start-Job -Name "risk-engine" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/risk-engine
    npm run dev
} | Out-Null
$jobs += "risk-engine"

# MFA Service
Start-Job -Name "mfa-service" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/mfa-service
    npm run dev
} | Out-Null
$jobs += "mfa-service"

# Session Service
Start-Job -Name "session-service" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/session-service
    npm run dev
} | Out-Null
$jobs += "session-service"

# Profile Service
Start-Job -Name "profile-service" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/profile-service
    npm run dev
} | Out-Null
$jobs += "profile-service"

# Audit Service
Start-Job -Name "audit-service" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/audit-service
    npm run dev
} | Out-Null
$jobs += "audit-service"

# Analytics Service
Start-Job -Name "analytics-service" -ScriptBlock {
    Set-Location $using:PWD
    Set-Location services/analytics-service
    npm run dev
} | Out-Null
$jobs += "analytics-service"

Write-Host "`nAll services started!" -ForegroundColor Green
Write-Host "Services are running in background jobs." -ForegroundColor Cyan
Write-Host "`nTo view logs, use: Get-Job | Receive-Job" -ForegroundColor Yellow
Write-Host "To stop all services, use: Get-Job | Stop-Job; Get-Job | Remove-Job" -ForegroundColor Yellow
Write-Host "`nPress Ctrl+C to stop all services and exit" -ForegroundColor Red

try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nStopping all services..." -ForegroundColor Yellow
    Get-Job | Stop-Job
    Get-Job | Remove-Job
    Write-Host "All services stopped." -ForegroundColor Green
}

