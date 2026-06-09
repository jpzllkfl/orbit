# Orbit — one-command Docker startup (Windows)
Set-Location $PSScriptRoot
Write-Host ""
Write-Host "  Building and starting Orbit..." -ForegroundColor Cyan
Write-Host ""
docker compose up --build
