# Client Timer Display Setup - Python Overlay

## Quick Start

### 1. Install Python Dependencies

**On each Client PC (one-time setup):**

```bash
# Install Python (if not already installed)
# Windows: Download from python.org
# Linux: sudo apt install python3 python3-pip
# Mac: brew install python3

# Install required package
pip install websocket-client
```

### 2. Copy the Timer Script

Copy `timer-overlay.py` to each client PC, or download it:

```bash
# Option 1: Copy from USB drive
cp /path/to/timer-overlay.py ~/timer-overlay.py

# Option 2: Download from Management PC
curl http://192.168.1.10:8080/timer-overlay.py -o timer-overlay.py
```

### 3. Run the Timer

```bash
python timer-overlay.py --unit=1 --server=192.168.1.10
```

Replace:
- `--unit=1` with the PC number (1, 2, 3... up to 10)
- `--server=192.168.1.10` with your Management PC's IP address

## Auto-Start on Boot

### Windows

**Option 1: Startup Folder (Easiest)**

1. Press `Win + R` and type: `shell:startup`
2. Create a shortcut to `timer-overlay.py` with arguments:
   ```
   Target: pythonw.exe C:\path\to\timer-overlay.py --unit=1 --server=192.168.1.10
   ```

**Option 2: Task Scheduler**

1. Open Task Scheduler
2. Create Basic Task → "PisoNet Timer"
3. Trigger: "When I log on"
4. Action: Start a program
   - Program: `pythonw.exe`
   - Arguments: `C:\path\to\timer-overlay.py --unit=1 --server=192.168.1.10`

### Linux

Add to autostart:

```bash
# Create autostart directory if it doesn't exist
mkdir -p ~/.config/autostart

# Create desktop entry
cat > ~/.config/autostart/pisonet-timer.desktop << EOF
[Desktop Entry]
Type=Application
Name=PisoNet Timer
Exec=python3 /home/user/timer-overlay.py --unit=1 --server=192.168.1.10
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF
```

### macOS

Create a Launch Agent:

```bash
# Create launch agents directory
mkdir -p ~/Library/LaunchAgents

# Create plist file
cat > ~/Library/LaunchAgents/com.pisonet.timer.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pisonet.timer</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/username/timer-overlay.py</string>
        <string>--unit=1</string>
        <string>--server=192.168.1.10</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

# Load the launch agent
launchctl load ~/Library/LaunchAgents/com.pisonet.timer.plist
```

## Features

✅ **Always on top** - Floats above all applications and games
✅ **Draggable** - Click and drag to reposition
✅ **Lightweight** - Uses ~10MB RAM
✅ **Auto-reconnects** - Reconnects if connection lost
✅ **Color-coded warnings**:
  - Green: Normal (> 1 minute)
  - Orange: Warning (≤ 1 minute)
  - Red: Critical (≤ 10 seconds)
✅ **Connection indicator** - Green dot = connected, Red dot = disconnected
✅ **Minimal UI** - Clean, unobtrusive design

## Troubleshooting

### "websocket-client not installed"
```bash
pip install websocket-client
```

### Timer shows "--:--"
- Check if sync-server is running on Management PC
- Verify network connection: `ping 192.168.1.10`
- Check if correct server IP is specified

### Timer not updating
- Check connection indicator (should be green)
- Verify WebSocket port 8081 is not blocked by firewall
- Check sync-server logs on Management PC

### Window doesn't stay on top
- Some fullscreen games may override always-on-top
- Try borderless windowed mode for games

### High CPU usage
- This shouldn't happen with this script
- If it does, check for network issues causing constant reconnections

## Customization

Edit `timer-overlay.py` to customize:
- Window size and position (lines 38-46)
- Colors (lines 48-55)
- Font sizes (lines 63, 74, 83)
- Warning thresholds (lines 117-140)

## Deployment Script

For deploying to multiple PCs:

```bash
#!/bin/bash
# deploy-timer.sh

MANAGEMENT_IP="192.168.1.10"

# Copy script to client PCs
for i in {1..10}; do
  CLIENT_IP="192.168.1.$((100 + i))"
  echo "Deploying to PC $i ($CLIENT_IP)..."
  
  scp timer-overlay.py user@$CLIENT_IP:~/
  ssh user@$CLIENT_IP "pip install websocket-client"
  ssh user@$CLIENT_IP "python3 ~/timer-overlay.py --unit=$i --server=$MANAGEMENT_IP &"
done

echo "Deployment complete!"
```

## Uninstall

To remove auto-start:

**Windows:** Delete shortcut from `shell:startup` folder
**Linux:** Remove `~/.config/autostart/pisonet-timer.desktop`
**macOS:** 
```bash
launchctl unload ~/Library/LaunchAgents/com.pisonet.timer.plist
rm ~/Library/LaunchAgents/com.pisonet.timer.plist
```
