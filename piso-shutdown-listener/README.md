# timer-overlay.py Guide

This folder is for running `timer-overlay.py` only.

## 1. Requirements
- Python 3.9+ installed
- Network access to your timer source server (WebSocket/API)

## 2. Install
From this folder, install dependency:

```bash
python -m pip install websocket-client
```

If `python` is not found but `py` works on Windows:

```powershell
py -m pip install websocket-client
```

Optional (recommended) virtual environment on Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install websocket-client
```

## 3. Run
On a **diskless client** with a LAN IP in `192.168.254.151–160`, `--unit` is **auto-detected** from the IP — no need to pass it:

```bash
python timer-overlay.py --server=192.168.254.201 --wsport=5001 --grace=60 --unlock-password=44
```

If you do not want the password in the command, use the env var:

```powershell
$env:PISONET_UNLOCK_PASSWORD = "44"
python timer-overlay.py --server=192.168.254.201 --wsport=5001 --grace=60
```

To override the unit number manually (non-diskless PCs or IPs outside the range):

```bash
python timer-overlay.py --unit=3 --server=192.168.254.201 --wsport=5001 --grace=60 --unlock-password=44
```

## 4. Pre-Compiled EXE (Recommended for Client PCs)
You can build a standalone executable and copy only that file to client PCs.

Build command:

```bat
.\build-overlay.bat
```

Output file:
- `dist\timer-overlay.exe`

Run on client PC (unit auto-detected from IP on diskless clients):

```bat
.\timer-overlay.exe --server=192.168.254.201 --wsport=5001 --grace=60 --unlock-password=44
```

To override unit number manually:

```bat
.\timer-overlay.exe --unit=3 --server=192.168.254.201 --wsport=5001 --grace=60 --unlock-password=44
```

Notes:
- The EXE is Windows-only.
- Build on the same architecture as clients (normally 64-bit Windows).
- SmartScreen may warn on unsigned EXE files.

## 5. Command Options
- `--unit` (optional): PC unit number (`1` to `10`). **Auto-detected** from the client IP when the IP is in the range `192.168.254.151–160` (151→1, 152→2, …, 160→10). Pass explicitly only for PCs outside that range.
- `--server` (required): management server host/IP (no protocol), e.g. `192.168.254.201`
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
   - Run `python -m pip install websocket-client`
   - If `python` is not recognized, run `C:\Users\Server\AppData\Local\Programs\Python\Python312\python.exe -m pip install websocket-client`
- No timer updates:
   - Verify `--server` and `--wsport`
   - Confirm firewall/LAN allows access to the server port
- Unit not auto-detected (error at startup):
   - Confirm this PC has a LAN IP in `192.168.254.151–160`
   - Or pass `--unit=N` explicitly
- Wrong unit shown:
   - Verify the PC's IP is correct (e.g. `192.168.254.153` → Unit 3)
   - Or override with `--unit=N`

## 9. Adding to Windows Startup
To run `timer-overlay.exe` automatically when Windows starts, use one of these methods:

### Option 1: Startup Folder (Easiest)
1. Press `Win + R`, type `shell:startup`, press Enter
2. Create a new `.bat` file (e.g., `timer-overlay-startup.bat`) with this content:
```batch
@echo off
cd /d "D:\pisonet\piso-shutdown-listener\dist"
start .\timer-overlay.exe --server=192.168.254.201 --wsport=5001 --grace=60 --unlock-password=44
```
3. The batch file will run automatically when Windows starts

> Unit number is auto-detected from the client IP (`192.168.254.151–160`). Add `--unit=N` only if this PC is outside that range.

### Option 2: Task Scheduler (More Control)
1. Press `Win + R`, type `taskschd.msc`, press Enter
2. Click **Create Basic Task**
3. Name it (e.g., "Timer Overlay Startup")
4. Set trigger to "At startup"
5. Set action to "Start a program"
6. Program: `D:\pisonet\piso-shutdown-listener\dist\timer-overlay.exe`
7. Add arguments: `--server=192.168.254.201 --wsport=5001 --grace=60 --unlock-password=44`

> Add `--unit=N` to the arguments only if this PC's IP is outside `192.168.254.151–160`.

### Option 3: Registry (For Current User)
Add to registry at `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`:
- Name: `TimerOverlay`
- Value: `D:\pisonet\piso-shutdown-listener\dist\timer-overlay.exe --server=192.168.254.201 --wsport=5001 --grace=60 --unlock-password=44`

> Add `--unit=N` to the value only if this PC's IP is outside `192.168.254.151–160`.

**Recommendation:** Use **Option 1** (Startup folder) for simplicity, or **Option 2** (Task Scheduler) if you need logging and error handling.

## 10. Windows Client Lockdown Policy Checklist (Exact Paths)

Goal: prevent users from easily signing out, shutting down, or escaping the timer overlay while client session is locked.

Important:
- `Ctrl + Alt + Del` itself cannot be disabled on normal Windows desktop editions.
- Use a dedicated **standard (non-admin)** account for each client PC.
- Apply these settings while signed in as an administrator.

### A. Prepare Client Account (Required)
1. Create/use a local client account (example: `PisoClient01`)
2. Confirm account is in `Users` group only (not Administrators)
3. Configure auto sign-in for that account if desired for kiosk flow

### B. Local Group Policy (gpedit.msc)
Open: `Win + R` -> `gpedit.msc`

Apply these policies under **User Configuration** for the client user:

1. Path: `User Configuration > Administrative Templates > Start Menu and Taskbar`
   - `Remove and prevent access to the Shut Down, Restart, Sleep, and Hibernate commands` -> **Enabled**
   - `Remove Logoff on the Start Menu` -> **Enabled**

2. Path: `User Configuration > Administrative Templates > System > Ctrl+Alt+Del Options`
   - `Remove Task Manager` -> **Enabled**
   - `Remove Lock Computer` -> **Enabled**

Apply these policies under **Computer Configuration**:

3. Path: `Computer Configuration > Administrative Templates > System > Logon`
   - `Hide entry points for Fast User Switching` -> **Enabled**

4. Path: `Computer Configuration > Administrative Templates > Windows Components > Windows Logon Options`
   - `Sign-in last interactive user automatically after a system-initiated restart` -> **Disabled** (optional, recommended)

### C. Local Security Policy (secpol.msc)
Open: `Win + R` -> `secpol.msc`

1. Path: `Security Settings > Local Policies > User Rights Assignment > Shut down the system`
   - Remove `Users`
   - Keep `Administrators` only

2. Path: `Security Settings > Local Policies > Security Options`
   - `Shutdown: Allow system to be shut down without having to log on` -> **Disabled**

### D. Apply and Verify
1. Run (Admin CMD/PowerShell):

```powershell
gpupdate /force
```

2. Reboot the client PC
3. Test as client user:
   - Start menu has no Sign out/Shutdown entry points
   - Task Manager is blocked
   - Fast User Switching is hidden
   - During overlay lock mode, attempted sign-out/shutdown is denied or restricted

### E. Optional Hardening (Recommended)
1. Disable access to command tools for client user:
   - `User Configuration > Administrative Templates > System > Prevent access to the command prompt` -> **Enabled**
   - `User Configuration > Administrative Templates > System > Don't run specified Windows applications` -> add tools you want blocked (for example `powershell.exe`, `cmd.exe`, `taskmgr.exe`)
2. Use Assigned Access / kiosk mode if edition supports it
3. Keep all admin credentials separate from client users

### F. If Using Windows Home Edition
`gpedit.msc` and `secpol.msc` are not fully available. Recommended approach:
1. Upgrade client PCs to Pro for manageable policy control
2. Or centrally enforce restrictions using MDM/domain tools

## 11. Auto Re-Run If Timer Is Closed

Yes, supported using a watchdog launcher.

### A. Watchdog Script (Included)
Use [piso-shutdown-listener/timer-watchdog.bat](piso-shutdown-listener/timer-watchdog.bat). It:
1. Starts `dist\\timer-overlay.exe`
2. Waits for it to exit
3. Restarts it after a short delay
4. Repeats forever

Current startup wrapper [piso-shutdown-listener/timer-startup.bat](piso-shutdown-listener/timer-startup.bat) now launches the watchdog minimized.

### B. Configure Per Client Using Environment Variables
The watchdog reads settings from environment variables (with defaults).

Supported variables:
1. `TIMER_UNIT` (optional — **auto-detected from IP** `192.168.254.151–160`; set only to override)
2. `TIMER_SERVER` (default: `192.168.254.201`)
3. `TIMER_UNLOCK_PASSWORD` (fallback: `PISONET_UNLOCK_PASSWORD`, then default `44`)
4. `TIMER_WSPORT` (default: `5001`)
5. `TIMER_GRACE` (default: `60`)
6. `TIMER_BG_IMAGE` (default: `D:\bg-timer-locked.png`)

Set them in [timer-startup.bat](timer-startup.bat) by uncommenting the provided `set` lines.

Example (unit override only needed for non-diskless PCs):

```batch
rem set "TIMER_UNIT=3"   <- only if IP is outside 192.168.254.151-160
set "TIMER_SERVER=192.168.254.201"
set "TIMER_UNLOCK_PASSWORD=1234"
set "TIMER_BG_IMAGE=D:\bg-timer-locked.png"
```

### C. Recommended Startup Method
Put a shortcut to [piso-shutdown-listener/timer-startup.bat](piso-shutdown-listener/timer-startup.bat) in `shell:startup` for the client account.

### D. Notes
1. This relaunches after normal close, forced close, or app crash.
2. If Windows signs out/restarts, watchdog also exits and will run again at next login via startup.
3. To stop it intentionally, close the watchdog console window or kill `cmd.exe` instance running `timer-watchdog.bat` as admin.
