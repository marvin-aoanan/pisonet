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
This starts:
- REST API server on port 8080
- WebSocket server on port 8081

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
