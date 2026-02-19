const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const db = require('./database');
const unitsRouter = require('./routes/units');
const transactionsRouter = require('./routes/transactions');
const settingsRouter = require('./routes/settings');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware - CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN ? 
    process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : 
    ['http://localhost:3000', 'http://localhost:5001', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// If CORS_ORIGIN is '*', use wildcard
if (process.env.CORS_ORIGIN === '*') {
  corsOptions.origin = '*';
}

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/units', unitsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/settings', settingsRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'PisoNet API',
    version: '1.0.0',
    message: 'PisoNet Backend API Server',
    endpoints: {
      health: 'GET /api/health',
      stats: 'GET /api/stats',
      units: 'GET /api/units',
      transactions: 'GET /api/transactions',
      settings: 'GET /api/settings'
    },
    documentation: 'See API_DOCUMENTATION.md'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'PisoNet API is running',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    port: PORT
  });
});

// API status and stats
app.get('/api/stats', (req, res) => {
  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM units) as total_units,
      (SELECT COUNT(*) FROM units WHERE status = 'Active') as active_units,
      (SELECT COUNT(*) FROM transactions) as total_transactions,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions) as total_revenue,
      (SELECT COUNT(*) FROM sessions WHERE status = 'active') as active_sessions
  `, [], (err, stats) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...stats
    });
  });
});

// WebSocket connections for real-time updates
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString();
  clients.set(clientId, ws);
  
  console.log(`✅ Client connected via WebSocket (ID: ${clientId}, Total: ${clients.size})`);

  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'CONNECTION',
    client_id: clientId,
    timestamp: new Date().toISOString(),
    message: 'Connected to PisoNet WebSocket server'
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📨 WebSocket message from ${clientId}:`, message.type);
      
      // Handle ping/pong for connection keep-alive
      if (message.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    console.log(`👋 Client disconnected (ID: ${clientId}, Remaining: ${clients.size - 1})`);
    clients.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error (ID: ${clientId}):`, error.message);
    clients.delete(clientId);
  });
});

// Broadcast function for real-time updates
global.broadcast = (data) => {
  const message = JSON.stringify({
    ...data,
    timestamp: new Date().toISOString(),
    broadcast_to: clients.size
  });
  
  let sentCount = 0;
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
    }
  });
  
  if (sentCount < clients.size) {
    console.log(`⚠️  Broadcast sent to ${sentCount}/${clients.size} clients`);
  }
};

// Timer countdown - runs every second (debounced updates)
let lastUpdateTime = {};
let countdownTimer = null;

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔴 Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

async function startServer() {
  try {
    await db.ready;
  } catch (err) {
    console.error('Failed to initialize database. Server not started.', err);
    process.exit(1);
  }

  countdownTimer = setInterval(() => {
    db.all('SELECT * FROM units WHERE remaining_seconds > 0', [], (err, units) => {
      if (err) {
        console.error('Error fetching units for countdown:', err);
        return;
      }

      const updates = [];

      units.forEach((unit) => {
        const newSeconds = Math.max(0, unit.remaining_seconds - 1);
        const newStatus = newSeconds === 0 ? 'Idle' : 'Active';

        // Only broadcast if status changed or every 10 seconds
        const timeSinceUpdate = Date.now() - (lastUpdateTime[unit.id] || 0);
        if (newStatus !== unit.status || timeSinceUpdate > 10000) {
          updates.push({ id: unit.id, newSeconds, newStatus });
          lastUpdateTime[unit.id] = Date.now();
        }

        db.run(
          'UPDATE units SET remaining_seconds = ?, status = ? WHERE id = ?',
          [newSeconds, newStatus, unit.id],
          (err) => {
            if (err) {
              console.error(`Error updating unit ${unit.id} countdown:`, err);
            }
          }
        );
      });

      // Broadcast updates
      updates.forEach(update => {
        global.broadcast({
          type: 'UNIT_UPDATE',
          unit: {
            id: update.id,
            remaining_seconds: update.newSeconds,
            status: update.newStatus
          }
        });
      });
    });
  }, 1000);

  server.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 PisoNet Backend Server Started');
    console.log(`   Port: ${PORT}`);
    console.log(`   Environment: ${NODE_ENV}`);
    console.log(`   Database: ${process.env.DATABASE_PATH || './pisonet.db'}`);
    console.log(`   CORS Origin: ${process.env.CORS_ORIGIN || '*'}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log('='.repeat(60) + '\n');
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down gracefully...');
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

startServer();

module.exports = { app, server, wss };

