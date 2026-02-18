const WebSocket = require('ws');
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 8080;
const WS_PORT = 8081;

// Open database
const db = new Database('pisonet-server.db');

// Create tables
db.prepare(`
  CREATE TABLE IF NOT EXISTS timers (
    unit_id INTEGER PRIMARY KEY,
    remaining_seconds INTEGER DEFAULT 0,
    total_revenue INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS coin_inserts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER,
    coin_value INTEGER,
    inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// REST API
app.use(express.json());

// Serve client display page
app.get('/client.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html'));
});

// Serve root redirect to help page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>PisoNet Sync Server</title></head>
      <body style="font-family: Arial; padding: 40px; background: #1a1a2e; color: #fff;">
        <h1>PisoNet Sync Server Running</h1>
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
      </body>
    </html>
  `);
});

app.get('/api/timers', (req, res) => {
  const stmt = db.prepare('SELECT * FROM timers');
  res.json(stmt.all());
});

app.post('/api/timer/update', (req, res) => {
  const { unit_id, remaining_seconds, total_revenue } = req.body;
  const stmt = db.prepare(`
    INSERT INTO timers (unit_id, remaining_seconds, total_revenue, last_updated)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(unit_id) DO UPDATE SET
      remaining_seconds = ?,
      total_revenue = ?,
      last_updated = CURRENT_TIMESTAMP
  `);
  stmt.run(unit_id, remaining_seconds, total_revenue, remaining_seconds, total_revenue);
  
  // Broadcast to all clients
  broadcastUpdate({ type: 'timer_update', data: { unit_id, remaining_seconds, total_revenue } });
  
  res.json({ success: true });
});

app.post('/api/coin/insert', (req, res) => {
  const { unit_id, coin_value } = req.body;
  const stmt = db.prepare('INSERT INTO coin_inserts (unit_id, coin_value) VALUES (?, ?)');
  stmt.run(unit_id, coin_value);
  
  // Broadcast to all clients
  broadcastUpdate({ type: 'coin_insert', data: { unit_id, coin_value } });
  
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Sync server running on http://localhost:${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);
  
  // Send current state to new client
  const timers = db.prepare('SELECT * FROM timers').all();
  ws.send(JSON.stringify({ type: 'initial_state', data: timers }));
  
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
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
