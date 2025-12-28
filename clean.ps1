# PowerShell script for cleaning up
# Equivalent to: make clean

Write-Host "Cleaning up containers and volumes..." -ForegroundColor Green

docker-compose down -v

Write-Host "Cleanup complete!" -ForegroundColor Green

