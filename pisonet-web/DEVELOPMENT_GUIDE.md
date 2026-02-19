# PisoNet Development Guide

Complete guide for developers working on the PisoNet system.

## Table of Contents
1. [Project Overview](#project-overview)
2. [Development Setup](#development-setup)
3. [Architecture](#architecture)
4. [Code Structure](#code-structure)
5. [API Development](#api-development)
6. [Frontend Development](#frontend-development)
7. [Database](#database)
8. [WebSocket](#websocket)
9. [Testing](#testing)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

## Project Overview

**PisoNet Manager** is a complete Internet Cafe management system with:
- Real-time WebSocket updates
- Multi-platform architecture (React + Node.js)
- SQLite database for persistence
- Cloud-ready deployment
- Comprehensive API

**Tech Stack:**
- Frontend: React 18, Axios, CSS3
- Backend: Node.js, Express, SQLite, WebSocket
- Database: SQLite3
- Deployment: Docker, Docker Compose

## Development Setup

### Prerequisites
- Node.js 16+ (LTS recommended)
- npm 7+
- Git
- VS Code (recommended)
- Postman or Insomnia (for API testing)

### Initial Setup

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/pisonet-web.git
cd pisonet-web
```

2. **Install dependencies:**
```bash
# Backend
cd backend
npm install

# Frontend (new terminal)
cd frontend
npm install
```

3. **Create environment files:**
```bash
# Backend
cd backend
copy .env.example .env
# Edit .env as needed

# Frontend
cd frontend
copy .env.local.example .env.local
# Edit .env.local as needed
```

4. **Start development servers:**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

Both will auto-reload on file changes.

## Architecture

### High-Level Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP/WebSocket
       ▼
┌─────────────────┐      ┌──────────────┐
│   React App     │◄────►│ Express API  │
│  (Port 3000)    │      │ (Port 5000)  │
└─────────────────┘      └──────┬───────┘
                                 │
                        ┌────────▼────────┐
                        │  SQLite DB      │
                        │ (pisonet.db)    │
                        └─────────────────┘
```

### Request Flow

1. **Coin Insertion (Customer)**
   - User clicks PC in CustomerView
   - CoinDialog opens with options
   - User inserts coin amount
   - Frontend: `POST /units/:id/add-time`
   - Backend updates unit and broadcasts via WebSocket
   - Frontend updates unit immediately

2. **Hardware Control (Admin)**
   - Admin clicks control button
   - Frontend: `POST /units/:id/control`
   - Backend broadcasts to WebSocket
   - Frontend receives and updates UI

3. **Real-time Updates**
   - Timer countdown every second
   - WebSocket broadcasts to all connected clients
   - Frontend receives and updates display

## Code Structure

### Backend

```
backend/
├── server.js              # Express app setup, WebSocket server
├── database.js            # SQLite initialization and schema
├── package.json
├── .env                   # Configuration
└── routes/
    ├── units.js           # PC/Unit management (15 endpoints)
    ├── transactions.js    # Payments & revenue (8 endpoints)
    └── settings.js        # System configuration (4 endpoints)
```

### Frontend

```
frontend/
├── src/
│   ├── App.js             # Main component, state management
│   ├── App.css            # Global styles
│   ├── index.js           # React entry point
│   ├── index.css          # Base styles
│   └── components/
│       ├── AdminView.js       # Admin dashboard (350+ lines)
│       ├── AdminView.css      # Admin styles
│       ├── CustomerView.js    # PC selection (150+ lines)
│       ├── CustomerView.css   # Customer styles
│       ├── CoinDialog.js      # Coin insertion (180+ lines)
│       └── CoinDialog.css     # Dialog styles
├── public/
│   └── index.html
├── package.json
└── .env.local
```

## API Development

### Adding a New Endpoint

1. **Define in route file** (`routes/units.js`):
```javascript
router.get('/new-endpoint', (req, res) => {
  // Implementation
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
```

2. **Update API documentation:**
   - Add to `API_DOCUMENTATION.md`
   - Include method, path, parameters, response

3. **Test with Postman/Insomnia:**
   - Create request in collection
   - Test with various parameters
   - Document expected responses

4. **Update frontend** if needed:
   - Add API call in App.js or component
   - Handle response/errors
   - Update UI

### Common Patterns

**GET with filtering:**
```javascript
router.get('/units/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM units WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
});
```

**POST with transaction:**
```javascript
router.post('/units/:id/add-time', (req, res) => {
  const { amount } = req.body;
  // Validation
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  // Update and broadcast
  db.run(query, params, () => {
    global.broadcast({ type: 'UPDATE', data: {...} });
    res.json({ message: 'Success' });
  });
});
```

## Frontend Development

### Component Structure

```javascript
function MyComponent({ units, onAction }) {
  const [state, setState] = useState(initialValue);
  
  useEffect(() => {
    // Setup/cleanup
  }, []);
  
  const handleAction = async () => {
    try {
      const response = await axios.post(url, data);
      setState(response.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };
  
  return <div>...</div>;
}
```

### Styles

Use CSS modules or individual CSS files:
```css
.component {
  display: grid;
  gap: 1rem;
}

.component:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

@media (max-width: 768px) {
  .component {
    grid-template-columns: 1fr;
  }
}
```

### API Integration

```javascript
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// In component
const response = await axios.get(`${API_URL}/units`);

// With error handling
try {
  const response = await axios.post(`${API_URL}/units/1/add-time`, 
    { amount: 5 }
  );
  setStatusMessage('Success!');
} catch (error) {
  setStatusMessage(`Error: ${error.response?.data?.error || error.message}`);
}
```

## Database

### Schema Overview

```javascript
// units - PC workstations
{
  id: INTEGER PRIMARY,
  name: TEXT,
  status: TEXT ('Idle', 'Active', 'Offline'),
  remaining_seconds: INTEGER,
  total_revenue: REAL,
  mac_address: TEXT,
  last_status_update: TEXT,
  created_at: TEXT
}

// transactions - Payments and coin insertions
{
  id: INTEGER PRIMARY,
  unit_id: INTEGER FOREIGN KEY,
  amount: REAL,
  denomination: INTEGER,
  timestamp: TEXT,
  transaction_type: TEXT ('coin', 'manual', 'system'),
  session_id: INTEGER FOREIGN KEY
}

// sessions - User sessions
{
  id: INTEGER PRIMARY,
  unit_id: INTEGER FOREIGN KEY,
  start_time: TEXT,
  end_time: TEXT,
  duration_seconds: INTEGER,
  amount_paid: REAL,
  status: TEXT ('active', 'ended')
}

// hardware_log - Control actions
{
  id: INTEGER PRIMARY,
  unit_id: INTEGER FOREIGN KEY,
  action: TEXT,
  timestamp: TEXT,
  status: TEXT
}
```

### Database Operations

**Read:**
```javascript
db.all(query, params, (err, rows) => {
  if (err) console.error(err);
});

db.get(query, params, (err, row) => {
  if (err) console.error(err);
});
```

**Write:**
```javascript
db.run(query, params, function(err) {
  if (err) console.error(err);
  console.log(this.lastID, this.changes);
});
```

**Transactions:**
```javascript
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  db.run(query1, params1);
  db.run(query2, params2);
  db.run('COMMIT');
});
```

### Queries

```javascript
// Select with JOIN
`SELECT u.*, COUNT(t.id) as transactions
 FROM units u
 LEFT JOIN transactions t ON u.id = t.unit_id
 GROUP BY u.id`

// Aggregate
`SELECT SUM(amount) as total_revenue FROM transactions`

// Date functions
`SELECT DATE(timestamp) as date, SUM(amount) 
 FROM transactions 
 WHERE timestamp >= datetime('now', '-7 days')
 GROUP BY DATE(timestamp)`
```

## WebSocket

### Server (Node.js)

```javascript
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.send(JSON.stringify({ type: 'CONNECTION' }));
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    // Handle message
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Broadcast to all clients
global.broadcast = (data) => {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};
```

### Client (React)

```javascript
useEffect(() => {
  const ws = new WebSocket(WS_URL);
  
  ws.onopen = () => {
    console.log('Connected');
    setConnected(true);
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'UNIT_UPDATE') {
      setUnits(prev => 
        prev.map(u => u.id === data.unit.id ? {...u, ...data.unit} : u)
      );
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  return () => ws.close();
}, []);
```

## Testing

### Manual Testing

1. **API Testing with Postman:**
   - Import endpoints into Postman
   - Test each endpoint with various inputs
   - Check response status and structure

2. **Frontend Testing:**
   - Test coin insertion flow
   - Test hardware controls
   - Verify real-time updates

3. **WebSocket Testing:**
   - Open DevTools Console
   - Check for UNIT_UPDATE messages
   - Verify timer countdown

### Automated Testing

```javascript
// Example Jest test
describe('Units API', () => {
  test('GET /units returns array', async () => {
    const response = await axios.get(`${API_URL}/units`);
    expect(Array.isArray(response.data)).toBe(true);
  });

  test('POST /units/:id/add-time adds time', async () => {
    const response = await axios.post(
      `${API_URL}/units/1/add-time`,
      { amount: 5 }
    );
    expect(response.status).toBe(200);
    expect(response.data.seconds_added).toBeGreaterThan(0);
  });
});
```

## Best Practices

### Code Style

1. **Consistent naming:**
   - camelCase for variables/functions
   - PascalCase for components/classes
   - UPPER_SNAKE_CASE for constants

2. **Error handling:**
   - Always catch promises
   - Provide user-friendly error messages
   - Log errors for debugging

3. **React patterns:**
   - Use hooks for state management
   - Memoize expensive operations
   - Clean up subscriptions in useEffect

### Performance

1. **Optimize re-renders:**
   - Use React.memo for expensive components
   - useCallback for event handlers
   - useMemo for expensive calculations

2. **Database optimization:**
   - Use indexes for frequently queried columns
   - Limit result sets with LIMIT
   - Cache frequently accessed data

3. **API efficiency:**
   - Batch requests when possible
   - Implement pagination
   - Use WebSocket for real-time data

### Security

1. **Input validation:**
   - Validate all user inputs
   - Sanitize strings
   - Use parameterized queries

2. **Error messages:**
   - Don't expose system errors to users
   - Log full errors for debugging
   - Return generic messages publicly

3. **Environment variables:**
   - Never commit secrets
   - Use .env.example as template
   - Rotate secrets regularly

## Troubleshooting

### Backend won't start
```
Check port is available:
netstat -tuln | grep 5000

Check Node.js:
node --version

Check dependencies:
npm install

Check environment:
copy .env.example .env
```

### Frontend won't connect to API
```
Check backend is running:
curl http://localhost:5000/api/health

Check REACT_APP_API_URL:
echo $env:REACT_APP_API_URL

Check CORS:
Verify CORS_ORIGIN in backend/.env

Check network:
Open DevTools - Network tab
Look for failed requests
```

### WebSocket not connecting
```
Check server is running:
curl http://localhost:5000/api/health

Check in browser console:
console.log(ws.readyState)
// 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED

Verify WebSocket URL:
Should be: ws://localhost:5000 (not http)
```

### Database issues
```
Delete and recreate:
rm backend/pisonet.db
cd backend && npm start

Check schema:
sqlite3 backend/pisonet.db
.schema

Query data:
SELECT * FROM units;
```

---

**Happy coding! 🚀**
