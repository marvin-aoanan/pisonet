#!/usr/bin/env powershell
# PisoNet Quick Start Script

$scriptPath = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition

# Check if Node.js is installed
$nodeExists = $null -ne (Get-Command node -ErrorAction SilentlyContinue)

if (-not $nodeExists) {
    Clear-Host
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ERROR: Node.js is not installed!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "To get started with PisoNet:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Visit https://nodejs.org/" -ForegroundColor Cyan
    Write-Host "  2. Download the LTS version" -ForegroundColor Cyan
    Write-Host "  3. Run the installer" -ForegroundColor Cyan
    Write-Host "  4. Restart PowerShell" -ForegroundColor Cyan
    Write-Host "  5. Run this script again" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "After installation, verify with: node --version" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Checking Node.js and npm..." -ForegroundColor Green
Write-Host "  Node.js: $(node --version)" -ForegroundColor Cyan
Write-Host "  npm: $(npm --version)" -ForegroundColor Cyan
Write-Host ""

Write-Host "Installing dependencies..." -ForegroundColor Green

# Backend
if (-not (Test-Path "$scriptPath\backend\node_modules")) {
    Write-Host "  Backend: installing..." -ForegroundColor Yellow
    Push-Location "$scriptPath\backend"
    npm install --silent
    Pop-Location
    Write-Host "  Backend: ready" -ForegroundColor Green
} else {
    Write-Host "  Backend: ready" -ForegroundColor Green
}

# Frontend
if (-not (Test-Path "$scriptPath\frontend\node_modules")) {
    Write-Host "  Frontend: installing..." -ForegroundColor Yellow
    Push-Location "$scriptPath\frontend"
    npm install --silent
    Pop-Location
    Write-Host "  Frontend: ready" -ForegroundColor Green
} else {
    Write-Host "  Frontend: ready" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting PisoNet..." -ForegroundColor Green
Write-Host ""

# Start Backend
Start-Process powershell -ArgumentList @(
    "-NoExit"
    "-Command"
    "cd '$scriptPath\backend'; npm start"
) -WindowStyle Normal

Start-Sleep -Seconds 2

# Start Frontend
Start-Process powershell -ArgumentList @(
    "-NoExit"
    "-Command"
    "cd '$scriptPath\frontend'; npm start"
) -WindowStyle Normal

Write-Host "Servers started!" -ForegroundColor Green
Write-Host ""
Write-Host "Backend API:   http://localhost:5000/api" -ForegroundColor Cyan
Write-Host "Frontend:      http://localhost:3000" -ForegroundColor Cyan
Write-Host "Health Check:  http://localhost:5000/api/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Waiting for servers to start (15-30 seconds)..." -ForegroundColor Yellow

Start-Sleep -Seconds 15

# Try to open browser
try {
    Start-Process "http://localhost:3000"
    Write-Host "Browser opened" -ForegroundColor Green
} catch {
    Write-Host "Browser auto-open failed - navigate to http://localhost:3000" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "PisoNet is ready! Press Ctrl+C in server windows to stop." -ForegroundColor Cyan
Write-Host ""

# Keep this window open
while ($true) {
    Start-Sleep -Seconds 1
}
