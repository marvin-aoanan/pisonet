# timer-overlay.py Guide

This folder is for running `timer-overlay.py` only.

## 1. Requirements
- Python 3.9+ installed
- Network access to your timer source server (WebSocket/API)

## 2. Install
From this folder, install dependency:

```bash
pip install websocket-client
```

Optional (recommended) virtual environment on Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install websocket-client
```

## 3. Run
Basic command:

```bash
python timer-overlay.py --unit=1 --server=192.168.254.110 --wsport=5001 --grace=60 --unlock-password=44
```

If you do not want password in the command, use env var:

```powershell
$env:PISONET_UNLOCK_PASSWORD = "44"
python timer-overlay.py --unit=1 --server=192.168.254.110 --wsport=5001 --grace=60
```

## 4. Pre-Compiled EXE (Recommended for Client PCs)
You can build a standalone executable and copy only that file to client PCs.

Build command:

```bat
.\build-overlay.bat
```

Output file:
- `dist\\timer-overlay.exe`

Run on client PC:

```bat
.\timer-overlay.exe --unit=1 --server=192.168.254.110 --wsport=5001 --grace=60 --unlock-password=44
```

Notes:
- The EXE is Windows-only.
- Build on the same architecture as clients (normally 64-bit Windows).
- SmartScreen may warn on unsigned EXE files.

## 5. Command Options
- `--unit` (required): PC unit number (`1` to `10`)
- `--server` (required): timer source host/IP (no protocol)
- `--wsport` (optional): WebSocket port, default `5001`
- `--grace` (optional): shutdown warning seconds after timer reaches zero, default `60`
- `--apiport` (optional): API port for initial state fetch (defaults to `--wsport`)
- `--oslock` (optional flag): lock OS at zero time
- `--unlock-password` (optional): password for admin unlock/close

## 6. Runtime Behavior
- Normal time: active session countdown
- `<= 60s`: warning mode with flashing window
- `0s`: fullscreen lock mode, no flashing, no +/- button
- New time added from server: returns to normal session mode

## 7. Controls
- `Ctrl+Q`: admin unlock prompt (requires password)
- Close attempts (`Esc`, `Alt+F4`, window close shortcuts): password required

## 8. Troubleshooting
- Missing module error for websocket:
   - Run `pip install websocket-client`
- No timer updates:
   - Verify `--server` and `--wsport`
   - Confirm firewall/LAN allows access to the server port
- Wrong unit shown:
   - Check `--unit` value

## 9. Adding to Windows Startup
To run `timer-overlay.exe` automatically when Windows starts, use one of these methods:

### Option 1: Startup Folder (Easiest)
1. Press `Win + R`, type `shell:startup`, press Enter
2. Create a new `.bat` file (e.g., `timer-overlay-startup.bat`) with this content:
```batch
@echo off
cd /d "D:\pisonet\piso-shutdown-listener\dist"
start .\timer-overlay.exe --unit=1 --server=192.168.254.110 --wsport=5001 --grace=60 --unlock-password=44
```
3. The batch file will run automatically when Windows starts

### Option 2: Task Scheduler (More Control)
1. Press `Win + R`, type `taskschd.msc`, press Enter
2. Click **Create Basic Task**
3. Name it (e.g., "Timer Overlay Startup")
4. Set trigger to "At startup"
5. Set action to "Start a program"
6. Program: `D:\pisonet\piso-shutdown-listener\dist\timer-overlay.exe`
7. Add arguments: `--unit=1 --server=192.168.254.110 --wsport=5001 --grace=60 unlock-password=44`

### Option 3: Registry (For Current User)
Add to registry at `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`:
- Name: `TimerOverlay`
- Value: `D:\pisonet\piso-shutdown-listener\dist\timer-overlay.exe --unit=1 --server=192.168.254.110 --wsport=5001 --grace=60 unlock-password=44`

**Recommendation:** Use **Option 1** (Startup folder) for simplicity, or **Option 2** (Task Scheduler) if you need logging and error handling.
