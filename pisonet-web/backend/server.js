const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ENV_PATH = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_PATH });
const CoinAcceptor = require('./hardware/coin-acceptor');

const db = require('./database');
const unitsRouter = require('./routes/units');
const transactionsRouter = require('./routes/transactions');
const settingsRouter = require('./routes/settings');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Kiosk + hardware configuration
const COIN_ACCEPTOR_ENABLED = (process.env.COIN_ACCEPTOR_ENABLED || 'false').toLowerCase() === 'true';
const COIN_PORT = process.env.SERIAL_PORT || '/dev/ttyUSB0';
const COIN_BAUD_RATE = parseInt(process.env.BAUD_RATE || '9600', 10);
const COIN_VALUE = parseFloat(process.env.COIN_VALUE || '1');
const COIN_DEBOUNCE_MS = parseInt(process.env.COIN_DEBOUNCE_MS || process.env.COIN_PULSE_THRESHOLD || '50', 10);
const COIN_SETTLE_MS = parseInt(process.env.COIN_SETTLE_MS || '120', 10);
const COIN_PAYLOAD_MODE = (process.env.COIN_PAYLOAD_MODE || 'auto').toLowerCase();
const SELECTION_TIMEOUT_MS = parseInt(process.env.SELECTION_TIMEOUT_MS || '30000', 10);

let coinAcceptor = null;
let selectedUnit = null;
let selectionExpiresAt = null;
let selectionTimeout = null;

function clearSelectedUnit(reason = 'cleared') {
  selectedUnit = null;
  selectionExpiresAt = null;

  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
    selectionTimeout = null;
  }

  if (global.broadcast) {
    global.broadcast({
      type: 'SELECTION_UPDATED',
      selection: {
        unit_id: null,
        expires_at: null,
        reason
      }
    });
  }
}

function setSelectedUnit(unitId) {
  selectedUnit = parseInt(unitId, 10);
  selectionExpiresAt = new Date(Date.now() + SELECTION_TIMEOUT_MS).toISOString();

  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }

  selectionTimeout = setTimeout(() => {
    clearSelectedUnit('timeout');
  }, SELECTION_TIMEOUT_MS);

  if (global.broadcast) {
    global.broadcast({
      type: 'SELECTION_UPDATED',
      selection: {
        unit_id: selectedUnit,
        expires_at: selectionExpiresAt,
        reason: 'selected'
      }
    });
  }
}

function getSelectionSnapshot() {
  return {
    unit_id: selectedUnit,
    expires_at: selectionExpiresAt,
    timeout_ms: SELECTION_TIMEOUT_MS
  };
}

function addCoinToUnit(unitId, amountValue, source = 'api', cb) {
  db.get(`SELECT key, value FROM settings WHERE key = 'peso_to_seconds'`, [], (err, setting) => {
    if (err) {
      return cb(err);
    }

    const conversionRate = setting ? parseInt(setting.value, 10) : 60;
    const secondsToAdd = Math.floor(amountValue * conversionRate);

    db.get('SELECT * FROM units WHERE id = ?', [unitId], (unitErr, unit) => {
      if (unitErr) {
        return cb(unitErr);
      }
      if (!unit) {
        return cb(new Error(`Unit ${unitId} not found`));
      }

      const newSeconds = unit.remaining_seconds + secondsToAdd;
      const newRevenue = unit.total_revenue + amountValue;
      const newStatus = newSeconds > 0 ? 'Active' : unit.status;

      db.run(
        'UPDATE units SET remaining_seconds = ?, total_revenue = ?, status = ?, last_status_update = ? WHERE id = ?',
        [newSeconds, newRevenue, newStatus, new Date().toISOString(), unitId],
        function(updateErr) {
          if (updateErr) {
            return cb(updateErr);
          }

          db.run(
            'INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type) VALUES (?, ?, ?, ?, ?)',
            [unitId, amountValue, amountValue, new Date().toISOString(), source],
            (txErr) => {
              if (txErr) {
                console.error('Error recording transaction:', txErr);
              }
            }
          );

          if (global.broadcast) {
            global.broadcast({
              type: 'COIN_INSERTED',
              unit: {
                id: unitId,
                remaining_seconds: newSeconds,
                total_revenue: newRevenue,
                status: newStatus
              }
            });
          }

          return cb(null, {
            unit_id: unitId,
            amount: amountValue,
            seconds_added: secondsToAdd,
            new_remaining_seconds: newSeconds,
            status: newStatus,
            source
          });
        }
      );
    });
  });
}

async function initializeCoinAcceptor() {
  if (!COIN_ACCEPTOR_ENABLED) {
    console.log('Coin acceptor startup disabled (COIN_ACCEPTOR_ENABLED=false)');
    return;
  }

  try {
    coinAcceptor = new CoinAcceptor({
      portPath: COIN_PORT,
      baudRate: COIN_BAUD_RATE,
      coinValue: COIN_VALUE,
      debounceMs: COIN_DEBOUNCE_MS,
      settleMs: COIN_SETTLE_MS,
      payloadMode: COIN_PAYLOAD_MODE
    });

    coinAcceptor.on('connected', () => {
      console.log(`Coin acceptor connected on ${COIN_PORT}`);
      if (global.broadcast) {
        global.broadcast({
          type: 'HARDWARE_STATUS',
          hardware: 'coin_acceptor',
          connected: true,
          port: COIN_PORT
        });
      }
    });

    coinAcceptor.on('error', (err) => {
      console.error('Coin acceptor error:', err.message);
      if (global.broadcast) {
        global.broadcast({
          type: 'HARDWARE_STATUS',
          hardware: 'coin_acceptor',
          connected: false,
          error: err.message
        });
      }
    });

    coinAcceptor.on('coin', (event) => {
      const unitId = selectedUnit;
      const amountValue = parseFloat(event.amount);

      if (!unitId) {
        console.log(`Coin detected (amount ${amountValue}) but no unit selected; ignoring event.`);
        if (global.broadcast) {
          global.broadcast({
            type: 'COIN_IGNORED',
            reason: 'no_unit_selected',
            amount: amountValue
          });
        }
        return;
      }

      addCoinToUnit(unitId, amountValue, 'coin_acceptor', (err) => {
        if (err) {
          console.error('Failed to apply coin event from coin acceptor:', err.message);
          return;
        }

        clearSelectedUnit('coin_applied');
      });
    });

    await coinAcceptor.connect();
  } catch (err) {
    console.error('Failed to initialize coin acceptor:', err.message);
  }
}

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

// Kiosk unit selection endpoints
app.get('/api/kiosk/selection', (req, res) => {
  res.json(getSelectionSnapshot());
});

app.post('/api/kiosk/selection', (req, res) => {
  const { unitId } = req.body;
  const parsedUnitId = parseInt(unitId, 10);

  if (!parsedUnitId || Number.isNaN(parsedUnitId)) {
    return res.status(400).json({ error: 'Invalid unitId' });
  }

  db.get('SELECT id FROM units WHERE id = ?', [parsedUnitId], (err, unit) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!unit) {
      return res.status(404).json({ error: `Unit ${parsedUnitId} not found` });
    }

    setSelectedUnit(parsedUnitId);

    return res.json({
      message: 'Unit selected. Waiting for coin insert.',
      ...getSelectionSnapshot()
    });
  });
});

app.delete('/api/kiosk/selection', (req, res) => {
  clearSelectedUnit('cancelled');
  res.json({ message: 'Selection cleared', ...getSelectionSnapshot() });
});

// Compatibility endpoint for Orange Pi gateway
// Expected payload: { unitNumber, amount, timestamp?, gateway? }
app.post('/api/coin-events', (req, res) => {
  const { unitNumber, amount } = req.body;

  const unitId = parseInt(unitNumber, 10);
  const amountValue = parseFloat(amount);

  if (!unitId || Number.isNaN(unitId) || !amountValue || amountValue <= 0) {
    return res.status(400).json({
      error: 'Invalid payload. unitNumber and amount are required.'
    });
  }

  addCoinToUnit(unitId, amountValue, 'gateway', (err, result) => {
    if (err) {
      if (err.message && err.message.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: err.message });
    }

    return res.json({
      message: 'Coin event processed',
      ...result
    });
  });
});

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
        console.log(`   Coin Acceptor: ${COIN_ACCEPTOR_ENABLED ? `enabled (${COIN_PORT})` : 'disabled'}`);
  
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

  // Initialize hardware listeners before serving requests so serial devices are opened early.
  await initializeCoinAcceptor();

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

  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 PisoNet Backend Server Started');
    console.log(`   Port: ${PORT}`);
    console.log(`   Environment: ${NODE_ENV}`);
    console.log(`   Env File: ${ENV_PATH} (exists: ${fs.existsSync(ENV_PATH)})`);
    console.log(`   Coin Env: enabled=${process.env.COIN_ACCEPTOR_ENABLED || 'undefined'}, port=${process.env.SERIAL_PORT || 'undefined'}, baud=${process.env.BAUD_RATE || 'undefined'}`);
    console.log(`   Database: ${process.env.DATABASE_PATH || './pisonet.db'}`);
    console.log(`   CORS Origin: ${process.env.CORS_ORIGIN || '*'}`);
    console.log(`   WebSocket: ws://0.0.0.0:${PORT}`);
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
  clearSelectedUnit('shutdown');
});

startServer();

module.exports = { app, server, wss };

