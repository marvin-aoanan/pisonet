#!/usr/bin/env powershell
# PisoNet unattended startup script

$scriptPath = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$backendPath = Join-Path $scriptPath 'backend'
$frontendPath = Join-Path $scriptPath 'frontend'
$logDir = Join-Path $scriptPath 'logs'

function Get-CommandPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName
    )

    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return $null
    }

    return $command.Source
}

if (-not (Test-Path $backendPath)) {
    Write-Host "Backend folder not found at $backendPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $frontendPath)) {
    Write-Host "Frontend folder not found at $frontendPath" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$npmPath = Get-CommandPath -CommandName 'npm.cmd'
if (-not $npmPath) {
    Write-Host "Node.js/npm not found. Install Node.js before enabling startup." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $backendPath 'node_modules'))) {
    Write-Host "Backend dependencies are missing. Run install.ps1 first." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $frontendPath 'node_modules'))) {
    Write-Host "Frontend dependencies are missing. Run install.ps1 first." -ForegroundColor Red
    exit 1
}

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backendOutLog = Join-Path $logDir "backend-startup-$timestamp.out.log"
$backendErrLog = Join-Path $logDir "backend-startup-$timestamp.err.log"
$frontendOutLog = Join-Path $logDir "frontend-startup-$timestamp.out.log"
$frontendErrLog = Join-Path $logDir "frontend-startup-$timestamp.err.log"

Write-Host "Starting PisoNet backend..." -ForegroundColor Green
Start-Process -FilePath $npmPath `
    -ArgumentList 'start' `
    -WorkingDirectory $backendPath `
    -RedirectStandardOutput $backendOutLog `
    -RedirectStandardError $backendErrLog `
    -WindowStyle Hidden

Start-Sleep -Seconds 5

Write-Host "Starting PisoNet frontend..." -ForegroundColor Green
Start-Process -FilePath $npmPath `
    -ArgumentList 'start' `
    -WorkingDirectory $frontendPath `
    -RedirectStandardOutput $frontendOutLog `
    -RedirectStandardError $frontendErrLog `
    -WindowStyle Hidden

Start-Sleep -Seconds 20

try {
    Start-Process 'http://localhost:3000'
} catch {
    Write-Host "Browser auto-open skipped. Open http://localhost:3000 manually if needed." -ForegroundColor Yellow
}

Write-Host "PisoNet autorun started." -ForegroundColor Cyan
Write-Host "Backend stdout log:  $backendOutLog" -ForegroundColor Cyan
Write-Host "Backend stderr log:  $backendErrLog" -ForegroundColor Cyan
Write-Host "Frontend stdout log: $frontendOutLog" -ForegroundColor Cyan
Write-Host "Frontend stderr log: $frontendErrLog" -ForegroundColor Cyan