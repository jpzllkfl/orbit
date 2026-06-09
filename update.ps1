# Rebuild and restart Orbit after pulling latest code (run on Plex PC).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host 'Pulling latest from GitHub...' -ForegroundColor Cyan
git pull --ff-only

Write-Host 'Rebuilding Docker image and restarting...' -ForegroundColor Cyan
docker compose up --build -d

Write-Host ''
Write-Host 'Orbit updated. Open http://localhost:8090 (or your Cloudflare URL).' -ForegroundColor Green
docker compose ps
