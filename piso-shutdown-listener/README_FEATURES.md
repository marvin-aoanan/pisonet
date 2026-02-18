# PisoNet Management System - New Features

## Overview
The system now includes comprehensive management features including dashboard, reports, authentication, and multi-PC network synchronization.

## Default Login
- **Default Password:** `admin123`
- You should change this immediately after first login!

## Features

### 1. Revenue Dashboard
- Real-time revenue tracking (today & all-time)
- Active units monitoring
- Per-unit statistics with revenue breakdown
- Auto-refreshes every 5 seconds

### 2. Daily Earnings Summary
- View earnings grouped by date
- Filter by date range
- Shows revenue and session count per day
- Quick access to historical data

### 3. CSV Export
- Export transaction logs to CSV
- Filter by date range
- Includes unit ID, amount, and timestamp
- Perfect for accounting and record-keeping

### 4. Admin Login Panel
- Secure password-protected access
- SHA-256 password hashing
- Change password from Settings
- Logout functionality

### 5. Multi-PC Network Sync
Real-time synchronization across multiple PCs in your shop!

#### Setup Instructions:

**Step 1: Install Dependencies**
```bash
npm install ws express
```

**Step 2: Start the Sync Server (on one main PC)**
```bash
npm run sync-server
```
This will automatically rebuild better-sqlite3 for Node.js and start:
- REST API server on port 8080
- WebSocket server on port 8081

**Note:** The sync server runs with regular Node.js, so better-sqlite3 is automatically rebuilt for the correct Node.js version.

**⚠️ IMPORTANT:** After running sync-server, you must rebuild for Electron before running the main app:
```bash
# Run this before starting the Electron app again
npx electron-rebuild -f -w better-sqlite3

# Then start the app
npm start
```

**Recommended Workflow:**
1. **On Server PC:** Run `npm run sync-server` (leave it running in one terminal)
2. **On All PCs (including server):** Run `npx electron-rebuild -f -w better-sqlite3` then `npm start`

**Step 3: Configure Clients**
On each PC (including the server PC):
1. Login to the app
2. Go to Settings tab
3. Enter sync server address (e.g., `192.168.1.100:8080` or `localhost:8080`)
4. Enter WebSocket port (default: `8081`)
5. Check "Enable Sync"
6. Click "Save & Connect"

**Step 4: Verify Connection**
- Status should change to "Connected" (green)
- All PCs will now share timer states in real-time
- When coin is inserted on any PC, all others update instantly

#### Network Setup Tips:
- Server PC should have a static IP address
- Make sure firewall allows ports 8080 and 8081
- All PCs must be on the same network
- For single PC usage, use `localhost:8080`

### 6. Graceful Shutdown System
**Intelligent PC shutdown with safety features!**

#### How It Works:
1. **At 10 seconds remaining:**
   - Warning overlay appears on screen
   - 3 beep sounds play (audio alert)
   - Graceful shutdown command sent to PC
   
2. **At 0 seconds:**
   - USB relay cuts power (backup safety measure)
   - Only activates if PC didn't shut down gracefully

#### Features:
- **Software-First Approach:** PCs receive shutdown commands via network (SSH, Windows Remote, or local)
- **Hardware Backup:** USB relay ensures power is cut if shutdown fails
- **10-Second Warning:** Users have time to save their work
- **Audio & Visual Alerts:** Beeps and full-screen warning overlay
- **Three Control Methods:** Each PC has Power ON, Shutdown, and Power OFF buttons

#### PC Configuration:
Configure each PC in **Settings > PC Shutdown Configuration**:
- **Local:** Test on same machine (for development)
- **SSH:** For Linux/Mac client PCs (requires SSH access)
- **Windows SSH:** For Windows client PCs with OpenSSH server enabled (works from any OS)
- **Windows Remote:** For Windows client PCs (only works if management app runs on Windows)
- **Auto-configure:** Quick setup for all 10 PCs with sequential IPs

#### For Windows Client PCs (Managed from macOS):
1. **Enable OpenSSH Server on each Windows PC:**
   - Open Settings → Apps → Optional Features
   - Add "OpenSSH Server"
   - Start the service: `Start-Service sshd` in PowerShell (Admin)
   - Set to auto-start: `Set-Service -Name sshd -StartupType 'Automatic'`

2. **Configure in the app:**
   - Method: `Windows SSH`
   - IP: Windows PC's IP address
   - Username: Windows username
   - Password: Windows password (or use SSH keys)
   - Port: 22 (default)

3. **Optional - Install sshpass for password auth (on macOS):**
   ```bash
   brew install sshpass
   ```
   Without sshpass, you'll need SSH key-based authentication.

### 7. USB Relay Control
**Physical power management via LCUS-type 1 USB relay module**

#### Hardware Support:
- LCUS-type 1 relay module (CH340 USB chip)
- Controls up to 10 PC units
- Automatic device detection
- Fallback to simulation mode if device not connected

#### Manual Controls:
Each PC unit has three control buttons:
- **⚡ Power ON** (Green) - Turn on PC via relay
- **🖥️ Shutdown** (Orange) - Send graceful shutdown command
- **🔌 Power OFF** (Red) - Emergency hard power cut

#### Setup:
See [PC_SETUP_GUIDE.md](PC_SETUP_GUIDE.md) for detailed wiring and configuration instructions.

## Usage Guide

### Navigation
- **PC Units**: Main control panel for each computer
- **Dashboard**: View overall statistics and revenue
- **Reports**: Access daily summaries and export data
- **Settings**: Configure sync and change password

### Timer Management
- Timers auto-save every 5 seconds
- Persist across app restarts
- Sync across network (if enabled)

### Security
- Always change default password
- Use strong passwords (minimum 6 characters)
- Keep the database file (`pisonet.db`) secure

## Files
- `pisonet.db` - Main application database (local)
- `pisonet-server.db` - Sync server database (on server PC only)
- `sync-server.js` - Network synchronization server
- `relay-control.js` - USB relay hardware controller
- `shutdown-control.js` - Graceful shutdown system
- `PC_SETUP_GUIDE.md` - Detailed setup instructions for real PCs
- `test-shutdown.sh` - Testing script for shutdown functionality

## Scripts
- `npm start` - Start the main Electron app
- `npm run sync-server` - Start the network sync server
- `npm run rebuild-electron` - Rebuild native modules for Electron
- `./test-shutdown.sh` - Test graceful shutdown features

## Troubleshooting

### Sync Not Working?
1. Check if sync server is running
2. Verify network connectivity
3. Check firewall settings
4. Ensure correct IP address and ports
5. Look at console for error messages

### Forgot Password?
Delete `pisonet.db` to reset to default password (WARNING: This deletes all data!)

### Timers Not Saving?
- Check console for errors
- Verify database file permissions
- Restart the application

## Future Enhancements
- Remote monitoring via web interface
- Email reports
- Automatic backup
- User roles and permissions
- SMS notifications
