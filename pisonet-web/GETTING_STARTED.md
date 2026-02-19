# PisoNet Getting Started Checklist

Use this checklist to verify all components are in place and system is ready to run.

## Pre-Flight Checks ✓

- [ ] Node.js 16+ installed (`node --version`)
- [ ] npm 7+ installed (`npm --version`)
- [ ] Git installed (optional but recommended)
- [ ] 4GB+ available disk space
- [ ] Ports 5000 (API) and 3000 (Frontend) are available
- [ ] All project files present in directory

## Project Structure Verification ✓

**Backend:**
- [ ] `backend/server.js` - Express server
- [ ] `backend/database.js` - SQLite setup
- [ ] `backend/routes/units.js` - Unit endpoints
- [ ] `backend/routes/transactions.js` - Transaction endpoints
- [ ] `backend/routes/settings.js` - Settings endpoints
- [ ] `backend/package.json` - Dependencies
- [ ] `backend/.env` - Environment variables
- [ ] `backend/.env.example` - Config template
- [ ] `backend/Dockerfile` - Container image

**Frontend:**
- [ ] `frontend/src/App.js` - Main component
- [ ] `frontend/src/components/AdminView.js` - Admin dashboard
- [ ] `frontend/src/components/CustomerView.js` - PC selection
- [ ] `frontend/src/components/CoinDialog.js` - Coin insertion
- [ ] `frontend/package.json` - Dependencies
- [ ] `frontend/.env.local` - Dev configuration
- [ ] `frontend/.env.production` - Prod configuration
- [ ] `frontend/Dockerfile` - Container image
- [ ] `frontend/nginx.conf` - Web server config

**Documentation:**
- [ ] `README.md` - Project overview
- [ ] `API_DOCUMENTATION.md` - API reference
- [ ] `DEPLOYMENT_GUIDE.md` - Deployment guide
- [ ] `DEVELOPMENT_GUIDE.md` - Development guide
- [ ] `PROJECT_SUMMARY.md` - Feature summary
- [ ] `FILE_MANIFEST.md` - File listing

**Configuration:**
- [ ] `docker-compose.yml` - Stack orchestration
- [ ] `start.ps1` - Windows startup script
- [ ] `.gitignore` - VCS rules

## Dependency Installation ✓

### Option 1: Automatic (Windows PowerShell)
```powershell
cd c:\Users\bilyunir\pisonet\pisonet-web
.\start.ps1
# Select option and script will install dependencies
```

### Option 2: Manual

**Backend dependencies:**
```bash
cd backend
npm install
# Should install: express, cors, sqlite3, ws, dotenv, nodemon
```

Verify:
- [ ] `backend/node_modules` directory created (400+ MB)
- [ ] `backend/package-lock.json` created

**Frontend dependencies:**
```bash
cd frontend
npm install
# Should install: react, react-dom, react-scripts, axios
```

Verify:
- [ ] `frontend/node_modules` directory created (300+ MB)
- [ ] `frontend/package-lock.json` created

## Configuration Verification ✓

### Backend (.env file)
- [ ] NODE_ENV set (development/production)
- [ ] PORT set (default: 5000)
- [ ] DATABASE_PATH set (./pisonet.db)
- [ ] CORS_ORIGIN configured (localhost:3000)
- [ ] PESO_TO_SECONDS set (default: 60)

### Frontend (.env.local file)
- [ ] REACT_APP_API_URL set (http://localhost:5000/api)
- [ ] REACT_APP_WS_URL set (ws://localhost:5000)

## Port Availability Check ✓

**Windows PowerShell:**
```powershell
netstat -ano | findstr :5000  # Should show nothing
netstat -ano | findstr :3000  # Should show nothing
```

If ports are in use:
- [ ] Kill existing processes on those ports
- [ ] Or change PORT in backend/.env
- [ ] Or change start script for frontend

## First Run - Full System ✓

### Method 1: Using start.ps1 (Windows - Recommended)

```powershell
.\start.ps1
# Choose option 1 for full system
# Servers will start in separate windows
```

- [ ] Backend terminal shows "🚀 PisoNet Backend running on port 5000"
- [ ] Frontend terminal shows "Compiled successfully!"
- [ ] Browser opens to http://localhost:3000
- [ ] No error messages in terminal

### Method 2: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

Wait for:
- [ ] "✅ Connected to SQLite database"
- [ ] "✅ 10 PC units initialized" (first run)
- [ ] "🚀 PisoNet Backend running on port 5000"

**Terminal 2 - Frontend (after backend is running):**
```bash
cd frontend
npm start
```

Wait for:
- [ ] "Compiled successfully!"
- [ ] Browser opens to http://localhost:3000

## System Validation ✓

### API Health Check
```bash
curl http://localhost:5000/api/health
# Should return: {"status":"ok","message":"PisoNet API is running",...}
```

Or visit in browser: http://localhost:5000/api/health

- [ ] GET request successful (200 status)
- [ ] Returns JSON response
- [ ] Status is "ok"

### WebSocket Connection
Open http://localhost:3000 and check browser console:
- [ ] No errors in console
- [ ] "✅ Connected" or similar message
- [ ] WebSocket shows as "OPEN"

### Database Creation
- [ ] `backend/pisonet.db` file created
- [ ] File size > 0 bytes
- [ ] Can be opened with SQLite viewer

**Check with sqlite3 CLI:**
```bash
sqlite3 backend/pisonet.db ".tables"
# Should show: admin_users hardware_log sessions settings transactions units
```

- [ ] All 6 tables present
- [ ] Run `.schema units` to see schema

### API Endpoints Testing

**Get all units:**
```bash
curl http://localhost:5000/api/units
# Should return array of 10 units (PC 1 - PC 10)
```

- [ ] Returns JSON array
- [ ] Contains 10 units
- [ ] Each unit has: id, name, status, remaining_seconds, total_revenue

**Get system stats:**
```bash
curl http://localhost:5000/api/stats
# Should return system statistics
```

- [ ] Returns JSON with stats
- [ ] Shows 10 total_units
- [ ] Shows 0 active_units (unless coin inserted)

## UI Validation ✓

### Customer View (Default)
- [ ] Title: "🖥️ PC Selection"
- [ ] 10 PC cards displayed in grid
- [ ] Each PC shows: PC Name, Status (✅ Available)
- [ ] Can click on PC card
- [ ] PC highlights as "Selected"

### Admin View
In header, click "Admin Dashboard" button:
- [ ] Title: "📊 Admin Dashboard"
- [ ] 6 stat cards showing: Total PCs, Active, Available, Revenue, Total Time, Avg
- [ ] Unit cards display with timers
- [ ] Sort options (PC Number, Time, Revenue, Status)
- [ ] View toggle buttons at top right

### Coin Dialog
1. Click on a PC card in Customer View
2. Dialog should appear with:
   - [ ] Title "Insert Coin - PC X"
   - [ ] Remaining time display
   - [ ] Status indicator
   - [ ] Coin animation (💰)
   - [ ] Standard denomination buttons (₱1, ₱5, ₱10, ₱20)
   - [ ] Custom amount input field
   - [ ] Cancel button
   - [ ] Info text about conversion rate

### Hardware Controls (Admin)
1. Switch to Admin View
2. Click on any PC card:
   - [ ] Card expands showing controls
   - [ ] Buttons appear: Power On, Off, Restart, Shutdown, Lock
   - [ ] "Add Time" section with quick buttons
   - [ ] Custom amount input

## Real-Time Updates Test ✓

1. Insert a coin in Customer View:
   - [ ] Timer updates immediately
   - [ ] Status changes to "Active" or "⏳"
   - [ ] No page refresh needed
   - [ ] Both Customer and Admin views update

2. Watch timer countdown:
   - [ ] Admin View timer counts down every second
   - [ ] Status remains correct
   - [ ] Both views stay synchronized

3. Open two browser windows:
   - [ ] Update in one reflects in other
   - [ ] No page reload needed
   - [ ] Real-time synchronization works

## Docker Validation ✓ (Optional)

If using Docker:

```bash
docker-compose up -d
```

- [ ] Both images build successfully
- [ ] Containers start and stay running
- [ ] No errors in logs

Verify:
```bash
docker-compose ps
# Both containers should show "Up"

docker-compose logs api
# Should show startup messages

curl http://localhost/api/health
# API should be accessible
```

## Development Setup ✓ (Optional)

If planning to develop:

### Install Nodemon for auto-reload
```bash
cd backend
npm install --save-dev nodemon
# Or already included
npm run dev  # Starts with auto-reload
```

- [ ] nodemon installed
- [ ] Changes to backend files auto-reload

### HMR (Hot Module Reload) for React
- [ ] Changes to React files auto-reload
- [ ] Browser updates without page refresh
- [ ] State is preserved where possible

## Troubleshooting ✓

If anything failed above, check:

### Port Already in Use
```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill it (replace PID)
taskkill /PID <PID> /F

# Or use different port in .env
```

### Node Modules Issues
```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -r node_modules package-lock.json
npm install
```

### Database Issues
```bash
# Delete database to reset
rm backend/pisonet.db

# Restart backend to recreate
cd backend
npm start
```

### WebSocket Connection Failed
- [ ] Verify backend is running (check port 5000)
- [ ] Check browser network tab for failed ws:// connection
- [ ] Check REACT_APP_WS_URL in .env.local
- [ ] Check CORS settings in backend/.env

### API Connection Failed
- [ ] Verify backend running: curl http://localhost:5000/api/health
- [ ] Check REACT_APP_API_URL in .env.local
- [ ] Check CORS_ORIGIN in backend/.env
- [ ] Check browser console for CORS errors

## Documentation Reference ✓

Before proceeding, review:
- [ ] README.md - Overall project guide
- [ ] API_DOCUMENTATION.md - All 27 endpoints
- [ ] DEVELOPMENT_GUIDE.md - For development work
- [ ] DEPLOYMENT_GUIDE.md - For cloud deployment

## Success Criteria ✓

You're ready when:
- [ ] Backend running on http://localhost:5000
- [ ] Frontend running on http://localhost:3000
- [ ] API health check passes
- [ ] Database has 10 units
- [ ] Both views display correctly
- [ ] Coin insertion works
- [ ] Real-time updates visible
- [ ] Admin controls function
- [ ] No errors in console

## Next Steps ✓

Once everything is working:

1. **For Development:**
   - [ ] Read DEVELOPMENT_GUIDE.md
   - [ ] Make changes and verify
   - [ ] Test thoroughly
   - [ ] Commit to git

2. **For Deployment:**
   - [ ] Read DEPLOYMENT_GUIDE.md
   - [ ] Choose target platform
   - [ ] Configure environment
   - [ ] Deploy and monitor

3. **For Customization:**
   - [ ] Review API_DOCUMENTATION.md
   - [ ] Plan modifications
   - [ ] Implement changes
   - [ ] Test in development

4. **For Production:**
   - [ ] Set NODE_ENV=production
   - [ ] Update environment URLs
   - [ ] Configure SSL/HTTPS
   - [ ] Set up backups
   - [ ] Configure monitoring

## Common URLs Reference ✓

Save these for quick access:

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | Main web interface |
| API | http://localhost:5000/api | REST endpoints |
| Health | http://localhost:5000/api/health | API status |
| Units | http://localhost:5000/api/units | Get all PCs |
| Stats | http://localhost:5000/api/stats | System statistics |

## Support ✓

If you encounter issues:

1. Check browser console (F12)
2. Check terminal output for errors
3. Read troubleshooting in README.md
4. Check DEVELOPMENT_GUIDE.md
5. Review relevant API documentation

---

## Final Checklist ✓

- [ ] All files present
- [ ] Dependencies installed
- [ ] Configuration complete
- [ ] Backend running
- [ ] Frontend accessible
- [ ] All validations passed
- [ ] Real-time updates working
- [ ] Documentation reviewed
- [ ] Ready to use/develop

---

**Congratulations! 🎉**
**PisoNet is ready to use!**

Start with `./start.ps1` (Windows) or follow manual setup above. 

Refer to README.md for full documentation.
