@echo off
setlocal

set "BASE_DIR=D:\pisonet\piso-shutdown-listener\dist"
set "EXE=timer-overlay.exe"
set "RESTART_DELAY_SECONDS=2"

set "UNIT=%TIMER_UNIT%"
rem If UNIT is not set, the overlay will auto-detect it from the client IP (192.168.1.151-160).

set "SERVER=%TIMER_SERVER%"
if not defined SERVER set "SERVER=192.168.1.200"

set "WSPORT=%TIMER_WSPORT%"
if not defined WSPORT set "WSPORT=5001"

set "GRACE=%TIMER_GRACE%"
if not defined GRACE set "GRACE=60"

set "UNLOCK_PASSWORD=%TIMER_UNLOCK_PASSWORD%"
if not defined UNLOCK_PASSWORD set "UNLOCK_PASSWORD=%PISONET_UNLOCK_PASSWORD%"
if not defined UNLOCK_PASSWORD set "UNLOCK_PASSWORD=44"

set "BG_IMAGE=%TIMER_BG_IMAGE%"
if not defined BG_IMAGE set "BG_IMAGE=D:\bg-timer-locked.png"

if defined UNIT (
    set "ARGS=--unit=%UNIT% --server=%SERVER% --wsport=%WSPORT% --grace=%GRACE% --unlock-password=%UNLOCK_PASSWORD%"
    set "DISPLAY_ARGS=--unit=%UNIT% --server=%SERVER% --wsport=%WSPORT% --grace=%GRACE% --unlock-password=***"
) else (
    set "ARGS=--server=%SERVER% --wsport=%WSPORT% --grace=%GRACE% --unlock-password=%UNLOCK_PASSWORD%"
    set "DISPLAY_ARGS=--server=%SERVER% --wsport=%WSPORT% --grace=%GRACE% --unlock-password=***"
)
if defined BG_IMAGE (
    set "ARGS=%ARGS% --bg-image=\"%BG_IMAGE%\""
    set "DISPLAY_ARGS=%DISPLAY_ARGS% --bg-image=\"%BG_IMAGE%\""
)

if not exist "%BASE_DIR%\%EXE%" (
    echo [%date% %time%] ERROR: %BASE_DIR%\%EXE% not found.
    timeout /t 10 /nobreak >nul
    exit /b 1
)

:run_loop
cd /d "%BASE_DIR%"
echo [%date% %time%] Starting %EXE% %DISPLAY_ARGS%
"%BASE_DIR%\%EXE%" %ARGS%
echo [%date% %time%] %EXE% exited with code %ERRORLEVEL%. Restarting in %RESTART_DELAY_SECONDS%s...
timeout /t %RESTART_DELAY_SECONDS% /nobreak >nul
goto run_loop
