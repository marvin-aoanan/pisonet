@echo off
REM PisoNet Startup Installer - Batch Wrapper
REM This script bypasses PowerShell execution policy

powershell -ExecutionPolicy Bypass -File "%~dp0install-startup.ps1"
pause