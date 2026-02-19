# 🖥️ PisoNet Manager - Complete Web Application

A comprehensive, production-ready web-based PisoNet (Internet Cafe) management system with real-time monitoring, WebSocket updates, SQLite database, and cloud deployment support.

## ✨ Features

### Core Features
- **Real-time Updates**: WebSocket-based live timer countdown and revenue tracking
- **Dual Interface**: 
  - 👥 **Customer View**: PC selection with coin insertion dialog
  - 👨‍💼 **Admin Dashboard**: Real-time monitoring, control, and revenue tracking
- **Coin Management**: Multi-denomination coin system (₱1, ₱5, ₱10, ₱20) with custom amounts
- **Hardware Control**: Power on/off, restart, shutdown, lock/unlock commands
- **Session Management**: Track active sessions, session duration, and revenue per session
- **Revenue Tracking**: 
  - Real-time total revenue
  - Per-unit revenue analysis
  - Daily and hourly revenue reports
  - Revenue trends and statistics
- **System Statistics**: Overall stats, active PCs, idle status, time tracking
- **Database**: SQLite with comprehensive schema supporting units, transactions, sessions, hardware logs
- **Environment Configuration**: Support for development, staging, and production environments
- **Cloud Ready**: Docker, Docker Compose, and environment configuration for easy cloud deployment

### Advanced Features
- 📊 **Analytics Dashboard**: Comprehensive reporting with daily/hourly breakdown
- 🔄 **Auto-reconnect**: Automatic WebSocket reconnection with fallback to polling
- 💾 **Persistent Storage**: SQLite database with automatic backups
- 🛡️ **Security**: CORS configuration, environment-based secrets
- 📱 **Responsive UI**: Mobile-friendly customer and admin interfaces
- ⌨️ **Keyboard Support**: ESC to close dialogs, Enter for quick actions
- 🎨 **Visual Feedback**: Status indicators, progress states, loading states
- 🔐 **Hardware Logging**: Track all hardware control actions

## 🏗️ System Architecture

```
PisoNet Manager
│
├── Frontend (React 18)
│   ├── CustomerView (PC Selection Interface)
│   ├── AdminView (Dashboard & Control Panel)
│   ├── CoinDialog (Payment Interface)
│   └── Real-time Updates (WebSocket)
│
├── Backend (Node.js + Express)
│   ├── REST API (http://localhost:5000/api)
│   ├── WebSocket Server (ws://localhost:5000)
│   ├── SQLite Database (pisonet.db)
│   └── Routes
│       ├── /units (PC Management)
│       ├── /transactions (Revenue & Payments)
│       ├── /settings (Configuration)
│       └── /api/health & /api/stats
│
└── Database (SQLite)
    ├── units (PC workstations)
    ├── sessions (User sessions)
    ├── transactions (Payments & Coins)
    ├── hardware_log (Control actions)
    ├── admin_users (Management accounts)
    └── settings (System configuration)
```

## 📋 Prerequisites

- **Node.js**: Version 16+ (LTS recommended)
- **npm**: Version 7+
- **Docker** (optional, for containerized deployment)
- **Git** (for version control)

## 🚀 Quick Start

### Local Development

#### 1. Backend Setup

```powershell
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create environment file (copy from .env.example if needed)
# Edit .env with your configuration

# Start backend server
npm start
# or for development with auto-reload
npm run dev
```

Backend will be available at: **http://localhost:5000**  
WebSocket at: **ws://localhost:5000**

#### 2. Frontend Setup

```powershell
# In a new terminal, navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend will open at: **http://localhost:3000**

### Using Docker Compose (Production)

```powershell
# From project root
docker-compose up -d

# Access:
# Frontend: http://localhost
# API: http://localhost:5000/api
```

#### Stopping containers:
```powershell
docker-compose down
```

## 📁 Project Structure

```
pisonet-web/
├── backend/
│   ├── routes/
│   │   ├── units.js          # PC/Unit management endpoints
│   │   ├── transactions.js    # Revenue & payment endpoints
│   │   └── settings.js        # Configuration endpoints
│   ├── database.js            # SQLite setup and schema
│   ├── server.js              # Express server with WebSocket
│   ├── package.json
│   ├── .env                   # Development configuration
│   ├── .env.example           # Configuration template
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminView.js       # Admin dashboard
│   │   │   ├── CustomerView.js    # PC selection interface
│   │   │   └── CoinDialog.js      # Coin insertion dialog
│   │   ├── App.js                 # Main application component
│   │   ├── App.css
│   │   └── index.js
│   ├── public/
│   ├── package.json
│   ├── .env.local             # Development API URLs
│   ├── .env.production        # Production API URLs
│   ├── Dockerfile
│   └── nginx.conf             # Production web server config
│
├── docker-compose.yml         # Multi-container orchestration
└── README.md                  # This file
```

## 🔌 API Endpoints

### Units Management
- `GET /api/units` - Get all units with status
- `GET /api/units/:id` - Get single unit details
- `GET /api/units/:id/session` - Get current session
- `GET /api/units/:id/transactions` - Get transaction history
- `POST /api/units/:id/add-time` - Insert coin/add time
- `POST /api/units/:id/control` - Hardware control (on/off/restart/shutdown/lock)
- `POST /api/units/:id/session/start` - Start session
- `POST /api/units/:id/session/end` - End session
- `PUT /api/units/:id` - Update unit details

### Transactions & Revenue
- `GET /api/transactions` - Get all transactions
- `GET /api/transactions/revenue/total` - Total revenue
- `GET /api/transactions/revenue/by-unit` - Revenue by unit
- `GET /api/transactions/revenue/daily` - Daily revenue breakdown
- `GET /api/transactions/revenue/hourly` - Hourly revenue
- `POST /api/transactions` - Create transaction

### Settings
- `GET /api/settings` - Get all settings
- `GET /api/settings/:key` - Get specific setting
- `PUT /api/settings/:key` - Update setting
- `PUT /api/settings` - Bulk update settings

### System
- `GET /api/health` - Health check
- `GET /api/stats` - System statistics

## 🔧 Configuration

### Backend Configuration (.env)

```env
# Server
NODE_ENV=development
PORT=5000
LOG_LEVEL=info

# Database
DATABASE_PATH=./pisonet.db

# CORS
CORS_ORIGIN=http://localhost:3000

# System Settings
PESO_TO_SECONDS=60              # Conversion rate
MAX_SESSION_DURATION=3600       # Max session length
AUTO_LOGOUT=true                # Auto logout when time expires

# Cloud/Production
CLOUD_ENV=development
CLOUD_PROVIDER=local
```

### Frontend Configuration (.env.local for dev, .env.production for prod)

```env
# API URLs
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_WS_URL=ws://localhost:5000

# Settings
REACT_APP_API_TIMEOUT=10000
REACT_APP_DEBUG_MODE=true
```

## 🌐 WebSocket Events

### Incoming (Client receives):
- `CONNECTION` - Server connection confirmation
- `UNIT_UPDATE` - Unit status/timer update
- `COIN_INSERTED` - Coin insertion confirmation
- `HARDWARE_CONTROL` - Hardware command acknowledgment
- `PONG` - Keep-alive response

### Outgoing (Client sends):
- `PING` - Keep-alive signal

## 📊 Database Schema

### Units Table
```sql
CREATE TABLE units (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,                  -- Idle, Active, Offline
  remaining_seconds INTEGER,
  total_revenue REAL,
  mac_address TEXT,
  last_status_update TEXT,
  created_at TEXT
)
```

### Transactions Table
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER,
  amount REAL,
  denomination INTEGER,
  timestamp TEXT,
  transaction_type TEXT,        -- coin, manual, system
  session_id INTEGER
)
```

### Sessions Table
```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER,
  start_time TEXT,
  end_time TEXT,
  duration_seconds INTEGER,
  amount_paid REAL,
  status TEXT                   -- active, ended
)
```

## 🚀 Deployment

### Local Development
```powershell
# Terminal 1 - Backend
cd backend
npm install
npm start

# Terminal 2 - Frontend
cd frontend
npm install
npm start
```

### Docker Deployment
```powershell
# Build and run
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
docker-compose logs -f web

# Stop
docker-compose down
```

### Cloud Platforms

#### Heroku
```bash
# Backend
heroku create pisonet-api
heroku config:set NODE_ENV=production PORT=5000
git push heroku main

# Frontend
heroku create pisonet-web
# Set environment variables in Heroku dashboard
npm run build
git push heroku main
```

#### AWS EC2
```bash
# Update environment URLs
export API_URL=https://your-api.example.com
export REACT_APP_WS_URL=wss://your-api.example.com
docker-compose up -d
```

#### Azure App Service
```bash
# Container registry login
az acr login --name your-registry.azurecr.io

# Deploy
az container create --resource-group myGroup \
  --name pisonet-api \
  --image your-registry.azurecr.io/pisonet-api:latest
```

## 🔒 Security Considerations

1. **Environment Variables**: Never commit .env files, use .env.example templates
2. **CORS**: Configure CORS_ORIGIN for your specific domain
3. **Database**: In production, move database to secure volumes
4. **WebSocket**: Use WSS (WebSocket Secure) in production
5. **Authentication**: Add authentication middleware for admin routes
6. **API Keys**: Store sensitive keys in environment variables
7. **HTTPS**: Always use HTTPS in production
8. **Rate Limiting**: Consider adding rate limiting middleware

## 📈 Monitoring & Logging

### Log Levels
- `error` - Critical errors
- `warn` - Warnings
- `info` - General information
- `debug` - Detailed debugging

### Key Metrics
- Active sessions per unit
- Revenue per hour/day/week
- System uptime
- WebSocket connection count
- API response times

## 🛠️ Development

### Scripts

**Backend:**
```powershell
npm start    # Start server
npm run dev  # Start with auto-reload (nodemon)
npm test     # Run tests
```

**Frontend:**
```powershell
npm start    # Start development server
npm build    # Create production build
npm test     # Run tests
npm eject    # Eject from create-react-app
```

### Adding New Features

1. Update database schema in `backend/database.js`
2. Add API routes in `backend/routes/`
3. Create React components in `frontend/src/components/`
4. Update App.js to integrate new components
5. Test with WebSocket enabled

## 🐛 Troubleshooting

### API Connection Issues
```powershell
# Check backend is running
curl http://localhost:5000/api/health

# Check CORS configuration
# Update CORS_ORIGIN in backend/.env
```

### WebSocket Connection Issues
```powershell
# Check WebSocket server
# Open browser console and check for ws:// connection
# Verify WS_URL in frontend .env files
```

### Database Issues
```powershell
# Reset database (development only)
# Delete pisonet.db file and restart server
# Database will auto-initialize

# View database contents
# Use sqlite3 client or DB Browser
```

### Port Already in Use
```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process
taskkill /PID <PID> /F

# Or use different port
# Update PORT in backend/.env and REACT_APP_API_URL in frontend
```

## 📝 License

ISC

## 👥 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

For issues, questions, or suggestions:
1. Check troubleshooting section
2. Review API documentation
3. Check GitHub issues
4. Contact development team

## 🔄 Version History

- **v1.0.0** (Current)
  - Complete PisoNet management system
  - WebSocket real-time updates
  - Multi-denomination coin support
  - Admin dashboard with analytics
  - Docker deployment support
  - Cloud-ready configuration

## 🎯 Roadmap

- [ ] User authentication and authorization
- [ ] Advanced analytics and reporting
- [ ] Mobile app (React Native)
- [ ] Payment gateway integration
- [ ] API rate limiting
- [ ] Backup and recovery system
- [ ] Email notifications
- [ ] SMS alerts for admins
- [ ] Multi-location support
- [ ] Advanced scheduling

---

**Happy PisoNet managing! 🎉**

### 2. Frontend Setup

Open a **new terminal** and run:

```powershell
# Navigate to frontend directory
cd c:\Users\bilyunir\pisonet\pisonet-web\frontend

# Install dependencies
npm install

# Start the React development server
npm start
```

The frontend will open automatically at **http://localhost:3000**

## Usage

### Customer View
1. Click on any PC card to select it
2. Selected PC gets a gold border
3. A coin dialog appears with animated coins
4. Click ₱1, ₱5, or ₱10 to add time (60 seconds per peso)

### Admin View
- View all PCs with:
  - Live countdown timer (green display)
  - Status (Active/Idle)
  - Total revenue per unit
- Control buttons:
  - **On**: Turn PC on
  - **Off**: Turn PC off
  - **Shutdown**: Graceful shutdown

## Configuration

### Backend Environment Variables

Create a `.env` file in the `backend` directory:

```env
PORT=5000
DATABASE_PATH=./pisonet.db
CORS_ORIGIN=http://localhost:3000
```

### Frontend Environment Variables

Create a `.env` file in the `frontend` directory:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_WS_URL=ws://localhost:5000
```

## Database Schema

### Units Table
```sql
CREATE TABLE units (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Idle',
  remaining_seconds INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0
)
```

### Transactions Table
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER,
  amount REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## API Endpoints

### Units
- `GET /api/units` - Get all units
- `GET /api/units/:id` - Get specific unit
- `POST /api/units/:id/add-time` - Add time via coin insertion
  ```json
  { "amount": 5 }
  ```
- `POST /api/units/:id/control` - Control unit
  ```json
  { "action": "on" | "off" | "shutdown" }
  ```

### Transactions
- `GET /api/transactions` - Get all transactions
- `GET /api/transactions/revenue/total` - Get total revenue
- `GET /api/transactions/revenue/by-unit` - Get revenue by unit

## WebSocket Events

### Server to Client
- `UNIT_UPDATE`: Timer countdown update (every second)
- `COIN_INSERTED`: Coin insertion notification
- `CONTROL_COMMAND`: Control action notification

## Hardware Integration

To connect with actual hardware (coin acceptor + relay board):

### Serial Protocol

**Received from microcontroller:**
```
COIN:X:Y
X = Unit ID (1-10)
Y = Amount inserted (1, 5, 10)
```

**Sent to microcontroller:**
```
SELECT:X  - Unit X selected for coin insertion
ON:X      - Turn unit X on
OFF:X     - Turn unit X off  
SHUTDOWN:X - Shutdown unit X
```

### Example Arduino Code (Backend Integration)

Modify `backend/server.js` to add serial port support:

```javascript
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const port = new SerialPort({
  path: 'COM3',
  baudRate: 9600
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

// Receive coin insertions from hardware
parser.on('data', (line) => {
  const match = line.match(/COIN:(\d+):(\d+)/);
  if (match) {
    const unitId = parseInt(match[1]);
    const amount = parseInt(match[2]);
    
    // Call existing add-time logic
    db.run(
      `UPDATE units SET 
        remaining_seconds = remaining_seconds + ?, 
        total_revenue = total_revenue + ?, 
        status = 'Active' 
      WHERE id = ?`,
      [amount * 60, amount, unitId]
    );
  }
});

// Send control commands to hardware
function sendToHardware(command) {
  port.write(command + '\n');
}
```

## Project Structure

```
pisonet-web/
├── backend/
│   ├── server.js           # Express + WebSocket server
│   ├── database.js         # SQLite initialization
│   ├── routes/
│   │   ├── units.js        # Unit endpoints
│   │   └── transactions.js # Transaction endpoints
│   ├── package.json
│   └── pisonet.db         # SQLite database (auto-created)
│
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── App.js          # Main application component
    │   ├── App.css         # Global styles
    │   ├── index.js        # React entry point
    │   └── components/
    │       ├── CustomerView.js    # PC selection UI
    │       ├── CustomerView.css
    │       ├── AdminView.js       # Admin control panel
    │       ├── AdminView.css
    │       ├── CoinDialog.js      # Coin insertion dialog
    │       └── CoinDialog.css
    └── package.json
```

## Troubleshooting

### Backend won't start
- Ensure port 5000 is not in use: `netstat -ano | findstr :5000`
- Check Node.js version: `node --version` (should be 16+)

### Frontend can't connect to backend
- Verify backend is running on port 5000
- Check CORS configuration in backend
- Clear browser cache and reload

### WebSocket disconnects
- Check firewall settings
- Ensure backend server is running
- WebSocket auto-reconnects after 3 seconds

### Database errors
- Delete `pisonet.db` to reset (will lose data)
- Backend recreates database on startup

## Production Deployment

### Backend
1. Set `NODE_ENV=production`
2. Use process manager like PM2
3. Configure reverse proxy (nginx)
4. Enable HTTPS

### Frontend
```powershell
npm run build
# Deploy 'build' folder to static hosting
```

## Comparison with WPF Version

| Feature | WPF Desktop | Web Application |
|---------|-------------|-----------------|
| Platform | Windows only | Cross-platform browser |
| Deployment | Local installation | Cloud-ready |
| Updates | Reinstall required | Instant reload |
| Access | Single PC | Multiple devices |
| Serial Port | Direct USB | Requires bridge/API |

## License

MIT

## Support

For issues with the web version, check:
1. Browser console (F12) for errors
2. Backend terminal output
3. Network tab for failed API calls
