```batch
@echo off
cd /d "D:\pisonet\piso-shutdown-listener\dist"
start .\timer-overlay.exe --unit=1 --server=192.168.254.110 --grace=60 --unlock-password=44 --bg-image="D:\bg-timer-locked.png"
```