const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const Database = require('better-sqlite3');  // <-- Add this

// Open or create database
const db = new Database('pisonet.db');

// Create tables if they don't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY,
    name TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS coin_inserts (
    id INTEGER PRIMARY KEY,
    unit_id INTEGER,
    coin_value INTEGER,
    inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS timers (
    unit_id INTEGER PRIMARY KEY,
    remaining_seconds INTEGER DEFAULT 0,
    total_revenue INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Function to log coins
function logCoin(unitId, coinValue) {
  const stmt = db.prepare('INSERT INTO coin_inserts (unit_id, coin_value) VALUES (?, ?)');
  stmt.run(unitId, coinValue);
  console.log(`Logged ₱${coinValue} for unit ${unitId}`);
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('simulate-coin', (event, unitId, coinValue) => {
  console.log(`Coin inserted: ₱${coinValue} (unit ${unitId})`);
  logCoin(unitId, coinValue);  // log into SQLite
});

// Get all timer states
ipcMain.handle('get-timers', () => {
  const stmt = db.prepare('SELECT * FROM timers');
  return stmt.all();
});

// Update timer state
ipcMain.handle('update-timer', (event, unitId, remainingSeconds, totalRevenue) => {
  const stmt = db.prepare(`
    INSERT INTO timers (unit_id, remaining_seconds, total_revenue, last_updated)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(unit_id) DO UPDATE SET
      remaining_seconds = ?,
      total_revenue = ?,
      last_updated = CURRENT_TIMESTAMP
  `);
  stmt.run(unitId, remainingSeconds, totalRevenue, remainingSeconds, totalRevenue);
});