# PowerShell script for running tests
# Equivalent to: make test

Write-Host "Running tests..." -ForegroundColor Green

$failed = $false

# Test Node.js services
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
    Write-Host "`nTesting $service..." -ForegroundColor Cyan
    Set-Location "services/$service"
    if (Test-Path "package.json") {
        npm test
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Tests failed for $service" -ForegroundColor Red
            $failed = $true
        }
    }
    Set-Location ../..
}

# Test Python services
Write-Host "`nTesting Python services..." -ForegroundColor Cyan

# Face Matching
Write-Host "Testing face-matching..." -ForegroundColor Cyan
Set-Location services/face-matching
if (Test-Path "requirements.txt") {
    python -m pytest 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 5) {
        Write-Host "Tests failed for face-matching" -ForegroundColor Red
        $failed = $true
    }
}
Set-Location ../..

# Liveness Service
Write-Host "Testing liveness-service..." -ForegroundColor Cyan
Set-Location services/liveness-service
if (Test-Path "requirements.txt") {
    python -m pytest 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 5) {
        Write-Host "Tests failed for liveness-service" -ForegroundColor Red
        $failed = $true
    }
}
Set-Location ../..

if ($failed) {
    Write-Host "`nSome tests failed!" -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nAll tests passed!" -ForegroundColor Green
}

