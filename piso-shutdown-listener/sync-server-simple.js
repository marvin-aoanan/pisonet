const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;
const WS_PORT = 8081;

// Simple in-memory storage (no database needed for sync server)
// Data persists to JSON file
const DATA_FILE = 'pisonet-sync-data.json';

let timers = {}; // { unit_id: { remaining_seconds, total_revenue, last_updated } }
let coinHistory = []; // Array of coin inserts

// Load data from file on startup
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      timers = data.timers || {};
      coinHistory = data.coinHistory || [];
      console.log('Loaded existing data from file');
    } else {
      // Initialize with empty timers for 10 units
      for (let i = 1; i <= 10; i++) {
        timers[i] = {
          unit_id: i,
          remaining_seconds: 0,
          total_revenue: 0,
          last_updated: new Date().toISOString()
        };
      }
      saveData();
    }
  } catch (error) {
    console.error('Error loading data:', error);
    // Initialize fresh data
    for (let i = 1; i <= 10; i++) {
      timers[i] = {
        unit_id: i,
        remaining_seconds: 0,
        total_revenue: 0,
        last_updated: new Date().toISOString()
      };
    }
  }
}

// Save data to file
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ timers, coinHistory }, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Load data on startup
loadData();

// REST API
app.use(express.json());

// Serve client display page
app.get('/client.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html'));
});

// Serve Python overlay script
app.get('/timer-overlay.py', (req, res) => {
  res.sendFile(path.join(__dirname, 'timer-overlay.py'));
});

// Serve root redirect to help page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>PisoNet Sync Server</title></head>
      <body style="font-family: Arial; padding: 40px; background: #1a1a2e; color: #fff;">
        <h1>PisoNet Sync Server Running ✓</h1>
        <p>To display timer on client PCs, open:</p>
        <code style="background: #333; padding: 10px; display: block; margin: 20px 0;">
          http://${req.hostname}:${PORT}/client.html?unit=X
        </code>
        <p>Replace X with the PC unit number (1-10)</p>
        <hr style="margin: 30px 0; border-color: #333;">
        <h3>API Endpoints:</h3>
        <ul>
          <li>GET /api/timers - Get all timer states</li>
          <li>POST /api/timer/update - Update timer state</li>
          <li>POST /api/coin/insert - Log coin insert</li>
        </ul>
        <p>WebSocket: ws://${req.hostname}:${WS_PORT}</p>
        <hr style="margin: 30px 0; border-color: #333;">
        <h3>Current Timer States:</h3>
        <pre style="background: #333; padding: 15px; border-radius: 5px; overflow: auto;">
${JSON.stringify(Object.values(timers), null, 2)}
        </pre>
      </body>
    </html>
  `);
});

app.get('/api/timers', (req, res) => {
  res.json(Object.values(timers));
});

app.post('/api/timer/update', (req, res) => {
  const { unit_id, remaining_seconds, total_revenue } = req.body;
  
  if (!unit_id || unit_id < 1 || unit_id > 10) {
    return res.status(400).json({ error: 'Invalid unit_id' });
  }
  
  timers[unit_id] = {
    unit_id,
    remaining_seconds: remaining_seconds || 0,
    total_revenue: total_revenue || 0,
    last_updated: new Date().toISOString()
  };
  
  saveData();
  
  // Broadcast to all clients
  broadcastUpdate({ 
    type: 'timer_update', 
    data: { unit_id, remaining_seconds, total_revenue } 
  });
  
  res.json({ success: true });
});

app.post('/api/coin/insert', (req, res) => {
  const { unit_id, coin_value } = req.body;
  
  if (!unit_id || unit_id < 1 || unit_id > 10) {
    return res.status(400).json({ error: 'Invalid unit_id' });
  }
  
  // Log coin insert
  coinHistory.push({
    unit_id,
    coin_value,
    inserted_at: new Date().toISOString()
  });
  
  // Keep only last 1000 entries
  if (coinHistory.length > 1000) {
    coinHistory = coinHistory.slice(-1000);
  }
  
  saveData();
  
  // Broadcast to all clients
  broadcastUpdate({ 
    type: 'coin_insert', 
    data: { unit_id, coin_value } 
  });
  
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`✓ Sync server running on http://localhost:${PORT}`);
  console.log(`✓ WebSocket server will run on ws://localhost:${WS_PORT}`);
  console.log(`✓ Data file: ${DATA_FILE}`);
});

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);
  
  // Send current state to new client
  const timersList = Object.values(timers);
  ws.send(JSON.stringify({ type: 'initial_state', data: timersList }));
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

function broadcastUpdate(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

console.log(`✓ WebSocket server running on ws://localhost:${WS_PORT}`);

// Auto-save every 30 seconds
setInterval(() => {
  saveData();
}, 30000);
