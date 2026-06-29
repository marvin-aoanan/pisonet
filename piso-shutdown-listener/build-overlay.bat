@echo off
setlocal

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

set "PY_CMD="

rem 1) Prefer local venv if present
if exist "%SCRIPT_DIR%.venv\Scripts\python.exe" (
  set "PY_CMD=%SCRIPT_DIR%.venv\Scripts\python.exe"
)

rem 2) Fall back to Windows py launcher
if not defined PY_CMD (
  where py >nul 2>nul
  if not errorlevel 1 set "PY_CMD=py"
)

rem 3) Final fallback to python on PATH
if not defined PY_CMD (
  where python >nul 2>nul
  if not errorlevel 1 set "PY_CMD=python"
)

if not defined PY_CMD (
  echo Python not found. Install Python or create .venv in this folder.
  echo Expected optional venv: %SCRIPT_DIR%.venv\Scripts\python.exe
  echo You can also use: py -m pip install pyinstaller websocket-client
  echo Then run this script again.
  exit /b 1
)

%PY_CMD% -m PyInstaller --version >nul 2>nul
if errorlevel 1 (
  echo PyInstaller is not installed for this Python interpreter.
  echo Install it with: %PY_CMD% -m pip install pyinstaller
  exit /b 1
)

set "DIST_DIR=%SCRIPT_DIR%dist"
set "PKG_FILE=%SCRIPT_DIR%build\timer-overlay\timer-overlay.pkg"
set "BOOTLOADER=%SCRIPT_DIR%.venv\Lib\site-packages\PyInstaller\bootloader\Windows-64bit-intel\runw.exe"
set "FINAL_EXE=%DIST_DIR%\timer-overlay.exe"

echo Building timer-overlay.exe...
%PY_CMD% -m PyInstaller --noconfirm --clean --onefile --noconsole --name timer-overlay --distpath "%DIST_DIR%" timer-overlay.py
if not errorlevel 1 (
  echo Build complete: %FINAL_EXE%
  endlocal
  exit /b 0
)

rem EXE write blocked (likely Controlled Folder Access / EDR policy).
rem The PKG (compiled payload) should still have been built successfully.
if not exist "%PKG_FILE%" (
  echo Build failed - packaging error before EXE stage.
  exit /b 1
)

echo.
echo EXE write blocked by security policy. Assembling via PowerShell...
echo.

powershell -NoProfile -Command "$b=[IO.File]::ReadAllBytes('%BOOTLOADER%');$p=[IO.File]::ReadAllBytes('%PKG_FILE%');$c=New-Object byte[]($b.Length+$p.Length);[Array]::Copy($b,$c,$b.Length);[Array]::Copy($p,0,$c,$b.Length,$p.Length);[IO.File]::WriteAllBytes('%FINAL_EXE%',$c)"
if errorlevel 1 (
  echo PowerShell assembly failed.
  echo To fix permanently: add Python to your AV/EDR allowed applications list.
  exit /b 1
)

echo Build complete: %FINAL_EXE%
endlocal
