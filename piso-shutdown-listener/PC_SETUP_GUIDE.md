# PisoNet Real PC Setup Guide

## Architecture Overview

```
Universal Coin Slot (1,5,10)
    │
    ├─> Allan Super Neg Timer (countdown display)
    │
    └─> Management PC (Electron App)
        ├─> Software Commands (graceful shutdown at 10s)
        │   ├─> SSH (Linux/Mac clients)
        │   ├─> Windows Remote (Windows clients)
        │   └─> Local (same machine)
        └─> USB Relay LCUS-type 1 (backup power cut at 0s)
            └─> Physical power control via relay outputs
                ├─> Client PC 1
                ├─> Client PC 2
                └─> ... (up to 10 PCs)
```

## Prerequisites

### 1. Hardware Devices

**Required Hardware:**
- **Universal Coin Slot (1,5,10)** - Accepts ₱1, ₱5, and ₱10 coins (connects to Management PC)
- **USB Relay (LCUS-type 1)** - 10-channel relay for PC power control

**Optional Hardware:**
- **Allan Super Neg Timer** - External countdown timer display (for customer-facing display)
  - *Note: The Electron app has a built-in timer display, so this is optional*

**Connections:**
- Universal Coin Slot → Management PC (coin pulse detection)
- USB Relay (LCUS-type 1) → Management PC via USB
- Relay outputs → Client PC power supplies
- (Optional) Allan Super Neg Timer → Management PC (for external display sync)

### 2. Network Setup
- All PCs on the same network
- Static IP addresses for client PCs (recommended)
- Example: 192.168.1.101, 192.168.1.102, etc.

### 3. USB Relay Device Setup
- Connect LCUS-type 1 relay to management PC via USB
- Device will appear as `/dev/tty.usbserial-*` (Mac) or `COM*` (Windows)
- Wire relay outputs to PC power buttons or power supplies
- Each relay output controls one client PC (supports up to 10 PCs)

## Configuration Methods

### Method 1: Windows Client PCs (Easiest)

**On Client PC (one-time setup):**
1. Enable Remote Shutdown:
   ```cmd
   # Run as Administrator
   reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f
   ```

2. Configure Windows Firewall:
   ```cmd
   netsh advfirewall firewall set rule group="Remote Shutdown" new enable=yes
   ```

**On Management PC:**
Configure each PC in the app:
```javascript
// In Settings or via console
window.electronAPI.configurePC(1, {
  ip: '192.168.1.101',
  method: 'windows-remote',
  username: 'Admin', // Not needed for Windows remote
  password: ''
});
```

### Method 2: Linux/Mac Clients (via SSH)

**On Client PC (one-time setup):**
1. Enable SSH:
   ```bash
   # Linux
   sudo apt install openssh-server
   sudo systemctl enable ssh
   
   # Mac
   # System Preferences > Sharing > Enable "Remote Login"
   ```

2. Allow passwordless sudo shutdown:
   ```bash
   sudo visudo
   # Add this line:
   yourusername ALL=(ALL) NOPASSWD: /sbin/shutdown
   ```

3. Set up SSH keys (more secure than password):
   ```bash
   # On management PC
   ssh-keygen -t rsa
   ssh-copy-id user@192.168.1.101
   ```

**On Management PC:**
```javascript
window.electronAPI.configurePC(1, {
  ip: '192.168.1.101',
  method: 'ssh',
  username: 'pisonet',
  password: 'yourpassword' // Or use SSH keys
});
```

### Method 3: Local Testing

Test on the same machine (management PC):
```javascript
window.electronAPI.configurePC(1, {
  method: 'local'
});
```

## Physical Relay Wiring

### Power Supply Control (Recommended)
Connect relay outputs to ATX power supply PS_ON pins:
```
Relay Output 1 → PC 1 Power Supply (PS_ON to Ground)
Relay Output 2 → PC 2 Power Supply (PS_ON to Ground)
...
Relay Output 10 → PC 10 Power Supply
```

### Power Button Control (Alternative)
Connect relay outputs in parallel with PC power buttons:
```
Relay NO (Normally Open) → Power Button terminals
```

## Testing Procedure

### 1. Software Shutdown Test (No Relay Needed)
```bash
# Start the app
npm start

# Login and insert ₱1 (1 minute)
# Watch the console at 10 seconds:
# ✓ "PC 1 - Graceful shutdown initiated"
# ✓ Client PC should receive shutdown command
```

### 2. Full System Test (With Relay)
```bash
# 1. Connect USB relay device
# 2. Wire ONE relay output to a test PC
# 3. Start app, insert ₱1
# 4. Timeline:
#    - At 10s: Shutdown command sent (PC starts shutting down)
#    - At 0s: Relay cuts power (backup - PC should already be off)
```

### 3. Safety Test
```bash
# Test the backup power cut:
# 1. Disconnect network from client PC (so shutdown command fails)
# 2. Insert ₱1 coin
# 3. At 10s: Software shutdown will fail
# 4. At 0s: Relay will cut power (safety measure works!)
```

## Configuration via Console

Open DevTools in the app (View > Toggle Developer Tools) and configure PCs:

```javascript
// Configure all 10 PCs
for (let i = 1; i <= 10; i++) {
  await window.electronAPI.configurePC(i, {
    ip: `192.168.1.${100 + i}`,
    method: 'windows-remote', // or 'ssh' or 'local'
    username: 'admin',
    password: ''
  });
}
```

## Troubleshooting

### "Shutdown command failed"
- Check network connectivity: `ping 192.168.1.101`
- Verify SSH access: `ssh user@192.168.1.101`
- Check Windows Remote Shutdown permissions
- Verify firewall settings on client PC

### Relay not working
- Check USB connection: `ls /dev/tty.usbserial-*`
- Verify relay wiring to PC power pins
- Test relay manually: Click "Power ON/OFF" buttons
- Check logs: `logs/relay.log`

### PC doesn't shut down at 10s but relay cuts at 0s
- This is EXPECTED behavior (relay is backup)
- Fix the software shutdown configuration
- Client PC will be protected by relay backup

## Client PC Timer Display

### Quick Setup (Recommended)

**Step 1: Start the sync server on Management PC**
```bash
cd /Users/bilyunir/pisonet/piso-shutdown-listener
node sync-server.js
```

**Step 2: On each Client PC, open a browser to:**
```
http://192.168.1.10:8080/client.html?unit=1
```
- Replace `192.168.1.10` with your Management PC's IP address
- Replace `unit=1` with the correct PC number (1, 2, 3... up to 10)

**Step 3: Make it fullscreen and persistent**
- Press **F11** for fullscreen mode
- Set browser to launch on startup:
  - **Windows**: Add browser shortcut to Startup folder with URL as parameter
  - **Linux**: Add to autostart applications
  - **Mac**: System Preferences > Users & Groups > Login Items

### Features

The client display shows:
- ✅ Large countdown timer with PC number
- ✅ Real-time updates when coins are inserted
- ✅ Warning when time is low (< 1 minute)
- ✅ Critical warning at 10 seconds before shutdown
- ✅ Auto-reconnects if connection is lost
- ✅ Connection status indicator

### Option 1: Web Browser (Simplest)

Each client PC can display their timer via a web browser:

**On Management PC:**
```bash
# Start the sync server
cd /path/to/piso-shutdown-listener
node sync-server.js
```

**On Each Client PC:**
1. Open browser and navigate to: `http://[MANAGEMENT_PC_IP]:8080/client.html?unit=1`
   - Replace `[MANAGEMENT_PC_IP]` with the Management PC's IP (e.g., `192.168.1.10`)
   - Replace `unit=1` with the appropriate unit number (1-10)
2. Press F11 for fullscreen
3. Set browser to auto-start on boot (optional)

**Create the client display page:**
```bash
# Add this file to your project
touch client.html
```

See the implementation below for `client.html`.

### Option 2: Python + Tkinter Overlay (Lightweight)

A small always-on-top Python window that floats above all applications:

**Advantages:**
- Very lightweight (~10MB RAM)
- Cross-platform (Windows, Linux, Mac)
- Simple to deploy (one `.py` file)
- Always visible, doesn't interfere with games/apps

**Setup:**
```bash
pip install websocket-client
python timer-overlay.py --unit=1 --server=192.168.1.10
```

**Use case:** Best for gaming cafes where you want timer visible during fullscreen games

### Option 3: Windows Desktop Gadget / Rainmeter Widget

For Windows PCs, use Rainmeter (popular desktop customization tool):

**Advantages:**
- Native Windows integration
- Customizable appearance (skins)
- Low resource usage
- Can display on desktop or always-on-top

**Setup:**
1. Install Rainmeter from rainmeter.net
2. Create custom skin that reads from sync server
3. Auto-loads on Windows startup

**Use case:** Professional-looking displays, matches Windows desktop aesthetic

### Option 4: Screensaver/Lock Screen Integration

Display timer when PC is idle or locked:

**Advantages:**
- No interference with active sessions
- Automatic display when idle
- Users can't accidentally close it

**Use case:** Reminds users of time when they return from bathroom breaks

### Option 5: OSD (On-Screen Display) Overlay

Similar to game FPS counters - small overlay in corner of screen:

**Advantages:**
- Minimally intrusive
- Always visible
- Works with fullscreen apps/games
- Can be draggable

**Tools:**
- **Windows:** AutoHotkey script with GUI
- **Linux:** Conky with websocket integration
- **Mac:** GeekTool or Übersicht

**Use case:** Discrete timer that doesn't block content

### Option 6: Hardware LED/LCD Display

Physical display mounted on/near each PC:

**Options:**
- Raspberry Pi with small LCD screen
- Arduino with 7-segment LED display
- USB-connected LED matrix display
- HDMI secondary monitor showing timer

**Advantages:**
- Cannot be closed or hidden by users
- Highly visible
- Works even if PC crashes
- Professional appearance

**Setup:**
- Connect device via USB or network
- Reads timer from sync server API
- Updates display every second

**Use case:** Most reliable, professional PisoNet setups

### Option 7: Taskbar/System Tray Application

Small app that sits in Windows taskbar or system tray:

**Advantages:**
- Non-intrusive
- Shows tooltip on hover
- Popup notifications for warnings
- Can't be easily closed

**Implementation:**
- C# .NET Windows Forms app
- Python with pystray library
- AutoIt script

**Use case:** Minimal interference, professional offices/computer labs

### Option 8: Allan Super Neg Timer (Hardware Display)

Use your existing **Allan Super Neg Timer** as external physical display:

**Advantages:**
- Dedicated hardware timer
- Highly visible to customers
- Professional PisoNet appearance
- No software on client PCs needed

**Setup:**
- Connect to Management PC
- Sync via serial/USB from Electron app
- Physical countdown display

**Use case:** Traditional PisoNet setup, customer-facing display

### Option 9: SSH/Terminal Display (Linux/Mac)

For Linux/Mac clients, use terminal-based display:

**Advantages:**
- Zero GUI dependencies
- Runs in terminal/console
- Extremely lightweight (<1MB RAM)
- Can run in tmux/screen session

**Setup:**
```bash
curl http://192.168.1.10:8080/timer-cli.sh | bash
```

**Use case:** Server environments, Linux labs, minimal installations

### Option 10: Custom Wallpaper with Timer

Dynamically update desktop wallpaper with timer overlay:

**Advantages:**
- Always visible when desktop shown
- No additional windows
- Can't be closed

**Implementation:**
- Script that updates wallpaper image every 5 seconds
- Renders timer text on background image

**Use case:** Public access computers, lobbies

## Production Deployment Checklist

- [ ] Configure static IPs for all client PCs
- [ ] Set up SSH keys or Windows Remote Shutdown
- [ ] Test shutdown commands for each PC
- [ ] Wire relay outputs to PC power supplies
- [ ] **Deploy timer display on client PCs (web browser or app)**
- [ ] **Start sync-server.js on Management PC**
- [ ] Test full cycle (coin insert → warning → shutdown → power cut)
- [ ] Document PC configurations
- [ ] Train staff on manual controls
- [ ] Set up monitoring for disconnected PCs
- [ ] Change default admin password

## Network Diagram

```
Internet Router (192.168.1.1)
    │
    ├─ Management PC (192.168.1.10) [Electron App + USB Relay]
    ├─ Client PC 1 (192.168.1.101) ←── Relay Output 1
    ├─ Client PC 2 (192.168.1.102) ←── Relay Output 2
    ├─ Client PC 3 (192.168.1.103) ←── Relay Output 3
    └─ ...
```
