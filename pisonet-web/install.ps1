# PisoNet Web - Installation Script
# Run this script once to install all dependencies

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PisoNet Manager - Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "✓ npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js/npm not found. Please install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Install Backend Dependencies
Write-Host ""
Write-Host "Installing Backend Dependencies..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\backend"
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✗ Backend installation failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# Install Frontend Dependencies
Write-Host ""
Write-Host "Installing Frontend Dependencies..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\frontend"
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✗ Frontend installation failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the application, run:" -ForegroundColor White
Write-Host "  .\start.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "Or manually:" -ForegroundColor White
Write-Host "  cd backend; npm start" -ForegroundColor Gray
Write-Host "  cd frontend; npm start" -ForegroundColor Gray
Write-Host ""
