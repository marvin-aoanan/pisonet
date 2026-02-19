@echo off
REM PisoNet Quick Start - Batch Wrapper
REM This script bypasses PowerShell execution policy

powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
