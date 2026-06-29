@echo off
cd /d "D:\pisonet\piso-shutdown-listener"

rem Per-client overrides. TIMER_UNIT is optional on diskless clients whose IP
rem falls in 192.168.1.151-160 (unit is auto-detected from the IP). Uncomment
rem and edit any line you need to override the default.
rem set "TIMER_UNIT=1"
rem set "TIMER_SERVER=192.168.1.200"
rem set "TIMER_WSPORT=5001"
rem set "TIMER_GRACE=60"
rem set "TIMER_UNLOCK_PASSWORD=44"
rem set "TIMER_BG_IMAGE=D:\bg-timer-locked.png"

start "Timer Overlay Watchdog" /min .\timer-watchdog.bat
