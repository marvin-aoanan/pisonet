```batch
@echo off
cd /d "D:\pisonet\piso-shutdown-listener"

rem Optional per-PC overrides (uncomment/edit as needed):
rem set "TIMER_UNIT=1"
rem set "TIMER_SERVER=192.168.1.200"
rem set "TIMER_WSPORT=5001"
rem set "TIMER_GRACE=60"
rem set "TIMER_UNLOCK_PASSWORD=44"
rem set "TIMER_BG_IMAGE=D:\bg-timer-locked.png"

start "Timer Overlay Watchdog" /min .\timer-watchdog.bat
```