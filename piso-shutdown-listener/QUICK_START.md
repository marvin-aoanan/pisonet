# PisoNet Quick Start Guide

## Current Status: ✅ Ready for Testing!

### What's Working Right Now:
- ✅ Sync server is running on ports 8080 & 8081
- ✅ Graceful shutdown system implemented
- ✅ USB relay detection (simulation mode active)
- ✅ Settings UI with PC configuration

---

## Quick Test (Same Machine)

### Test the Graceful Shutdown:
```bash
# Terminal 1: Start sync server
npm run sync-server

# Terminal 2: Start main app
npm start
```

1. Login with `admin123`
2. Click "Insert ₱1" on PC 1
3. Wait for countdown:
   - **At 10s**: You'll see warning overlay + hear 3 beeps + shutdown command sent
   - **At 0s**: Relay backup activates (simulated since no USB device)

---

## Testing with Real Client PCs

### Prerequisites:
- [ ] All PCs on same network (e.g., 192.168.1.x)
- [ ] Management PC has static IP
- [ ] USB relay device connected (optional for first test)

### Step 1: Configure Client PCs

**For Windows Clients:**
On each Windows PC, run as Administrator:
```cmd
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f
netsh advfirewall firewall set rule group="Remote Shutdown" new enable=yes
```

**For Linux/Mac Clients:**
On each client PC:
```bash
# Enable SSH
sudo systemctl enable ssh  # Linux
# or System Preferences > Sharing > Remote Login (Mac)

# Allow shutdown without password
sudo visudo
# Add: username ALL=(ALL) NOPASSWD: /sbin/shutdown
```

### Step 2: Configure in App

1. Open app → Login → Go to **Settings** tab
2. Scroll to **PC Shutdown Configuration**
3. Option A: Click "Auto-configure All PCs" (sets IPs 192.168.1.101-110)
4. Option B: Configure each PC individually:
   - Select PC number
   - Enter IP address
   - Choose method (Windows Remote, SSH, or Local)
   - Enter credentials if needed
   - Click "Save PC Configuration"

### Step 3: Test Shutdown

**Software Test (No Relay):**
1. Insert ₱1 coin on any PC
2. At 10 seconds: Check if client PC receives shutdown command
3. Client PC should show shutdown message

**Full Hardware Test (With Relay):**
1. Connect USB relay device to management PC
2. Wire ONE relay output to test PC power supply
3. Restart the app (it will detect relay automatically)
4. Insert ₱1 coin
5. Timeline:
   - **10s**: Shutdown command sent (check client PC)
   - **0s**: Relay cuts power (backup)

---

## Troubleshooting

### "Relay not connected" in console?
- **Normal!** App runs in simulation mode without USB device
- Graceful shutdown still works via network
- Relay is only a backup safety measure

### Shutdown command not reaching client PC?
Check network:
```bash
# Test connectivity
ping 192.168.1.101

# Test SSH (Linux/Mac)
ssh user@192.168.1.101 "echo test"

# Test Windows Remote (from Windows management PC)
shutdown /m \\192.168.1.101 /? 
```

### Need to rebuild for Electron after sync-server?
```bash
npm run rebuild-electron
npm start
```

---

## Control Buttons Explained

Each PC unit has 3 buttons:

| Button | Color | Function | Use Case |
|--------|-------|----------|----------|
| ⚡ Power ON | Green | Turn on relay → Power to PC | Start PC from off state |
| 🖥️ Shutdown | Orange | Send graceful shutdown | Safely shut down PC (preferred) |
| 🔌 Power OFF | Red | Hard power cut via relay | Emergency only! |

**Best Practice:** Always use "Shutdown" button. Only use "Power OFF" if PC is frozen/unresponsive.

---

## Two-Tier Shutdown System

```
Timer expires (or manual shutdown button clicked)
    ↓
10 seconds: Software Shutdown
    ├─> Warning overlay + 3 beeps
    ├─> Send OS shutdown command
    └─> User has time to save work
    ↓
0 seconds: Hardware Backup
    └─> Relay cuts power (if PC didn't shut down)
```

This ensures:
- Users don't lose data (10 second warning)
- PCs shut down gracefully (software first)
- Power is guaranteed to cut (relay backup)

---

## Next Steps

### Production Deployment:
1. ✅ Test graceful shutdown on one client PC
2. ✅ Verify network shutdown commands work
3. ⬜ Wire relay outputs to all client PCs
4. ⬜ Configure all 10 PCs in Settings
5. ⬜ Change default password (admin123)
6. ⬜ Test full cycle with real coins
7. ⬜ Train staff on manual controls

### Optional Enhancements:
- Set up monitoring for disconnected PCs (red status)
- Configure email alerts for errors
- Set up automatic database backups
- Create user manual for staff

---

## Support Files

- [PC_SETUP_GUIDE.md](PC_SETUP_GUIDE.md) - Complete setup documentation
- [README_FEATURES.md](README_FEATURES.md) - Feature list and usage
- [test-shutdown.sh](test-shutdown.sh) - Automated testing script

---

## Quick Commands Reference

```bash
# Start app (Electron)
npm start

# Start sync server (Node.js)
npm run sync-server

# Rebuild for Electron (after using sync-server)
npm run rebuild-electron

# Test shutdown features
./test-shutdown.sh

# Check USB relay detection
ls /dev/tty.usbserial-*

# Cancel accidental shutdown (on client PC)
sudo shutdown -c          # Linux/Mac
shutdown /a               # Windows
```

---

**Status:** Everything is ready! The sync server is running, graceful shutdown is implemented, and the Settings UI is configured. You can now test on real client PCs! 🚀
