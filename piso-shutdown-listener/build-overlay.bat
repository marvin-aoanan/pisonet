@echo off
setlocal

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

if not exist "d:\pisonet\.venv\Scripts\python.exe" (
  echo Python not found at d:\pisonet\.venv\Scripts\python.exe
  echo Update this script or run PyInstaller manually.
  exit /b 1
)

echo Building timer-overlay.exe...
d:\pisonet\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --noconsole --name timer-overlay timer-overlay.py
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo Build complete: %SCRIPT_DIR%dist\timer-overlay.exe
endlocal
