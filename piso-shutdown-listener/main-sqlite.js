const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const RelayController = require('./relay-control');
const ShutdownController = require('./shutdown-control');

// Initialize controllers
const relayController = new RelayController();
const shutdownController = new ShutdownController();

// Database
const db = new Database('pisonet.db');

// Initialize tables
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

db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`).run();

// Initialize password
function initPassword() {
  const DEFAULT_PASSWORD = 'admin123';
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const result = stmt.get('password_hash');
  
  if (!result) {
    const passwordHash = crypto.createHash('sha256').update(DEFAULT_PASSWORD).digest('hex');
    const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insert.run('password_hash', passwordHash);
    console.log('Default password set to: admin123');
  }
}

initPassword();

function logCoin(unitId, coinValue) {
  const stmt = db.prepare('INSERT INTO coin_inserts (unit_id, coin_value) VALUES (?, ?)');
  stmt.run(unitId, coinValue);
}

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    // Development mode: load from Next.js dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode: load from built Next.js app
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
  
  // Connect to relay on startup
  relayController.connect().catch(err => {
    console.error('Failed to connect to relay:', err.message);
    console.log('Running in simulation mode');
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  relayController.disconnect();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC Handlers
ipcMain.on('simulate-coin', (event, unitId, coinValue) => {
  console.log(`Coin inserted: ₱${coinValue} (unit ${unitId})`);
  logCoin(unitId, coinValue);
});

ipcMain.handle('get-timers', () => {
  const stmt = db.prepare('SELECT * FROM timers');
  return stmt.all();
});

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

ipcMain.handle('get-revenue-today', () => {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(coin_value), 0) as total
    FROM coin_inserts
    WHERE DATE(inserted_at) = DATE('now')
  `);
  return stmt.get().total;
});

ipcMain.handle('get-revenue-all', () => {
  const stmt = db.prepare(`SELECT COALESCE(SUM(coin_value), 0) as total FROM coin_inserts`);
  return stmt.get().total;
});

ipcMain.handle('get-sessions-today', () => {
  const stmt = db.prepare(`
    SELECT COUNT(*) as total
    FROM coin_inserts
    WHERE DATE(inserted_at) = DATE('now')
  `);
  return stmt.get().total;
});

ipcMain.handle('relay-on', async (event, unitId) => {
  try {
    const result = await relayController.turnOn(unitId);
    return { success: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('relay-off', async (event, unitId) => {
  try {
    const result = await relayController.turnOff(unitId);
    return { success: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('shutdown-pc', async (event, unitId) => {
  try {
    const result = await shutdownController.shutdown(unitId);
    return { success: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('login', async (event, password) => {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const result = stmt.get('password_hash');
  
  if (!result) return { success: false };
  
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  return { success: inputHash === result.value };
});

ipcMain.handle('configure-pc', async (event, unitId, config) => {
  try {
    await shutdownController.configure(unitId, config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
