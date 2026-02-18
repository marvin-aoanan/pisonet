const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');

const Database = require('better-sqlite3');
const RelayController = require('./relay-control');
const ShutdownController = require('./shutdown-control');

// Initialize relay controller
const relayController = new RelayController();
// Initialize shutdown controller
const shutdownController = new ShutdownController();

// Open or create database
const db = new Database('pisonet.db');

// Default admin password (change this!)
const DEFAULT_PASSWORD = 'admin123';
let passwordHash = null;

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

db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`).run();

// Initialize password hash if not exists
function initPassword() {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const result = stmt.get('password_hash');
  
  if (!result) {
    // Set default password
    passwordHash = crypto.createHash('sha256').update(DEFAULT_PASSWORD).digest('hex');
    const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insert.run('password_hash', passwordHash);
    console.log('Default password set to: admin123');
  } else {
    passwordHash = result.value;
    console.log('Password loaded from database');
  }
}

initPassword();

console.log('Expected hash for admin123:', crypto.createHash('sha256').update('admin123').digest('hex'));

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

// Dashboard: Get total revenue today
ipcMain.handle('get-revenue-today', () => {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(coin_value), 0) as total
    FROM coin_inserts
    WHERE DATE(inserted_at) = DATE('now')
  `);
  return stmt.get().total;
});

// Dashboard: Get total revenue all time
ipcMain.handle('get-revenue-all', () => {
  const stmt = db.prepare('SELECT COALESCE(SUM(coin_value), 0) as total FROM coin_inserts');
  return stmt.get().total;
});

// Dashboard: Get sessions count today
ipcMain.handle('get-sessions-today', () => {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM coin_inserts
    WHERE DATE(inserted_at) = DATE('now')
  `);
  return stmt.get().count;
});

// Dashboard: Get per-unit stats
ipcMain.handle('get-unit-stats', () => {
  const stmt = db.prepare(`
    SELECT 
      unit_id,
      COALESCE(SUM(CASE WHEN DATE(inserted_at) = DATE('now') THEN coin_value ELSE 0 END), 0) as today,
      COALESCE(SUM(coin_value), 0) as all_time
    FROM coin_inserts
    GROUP BY unit_id
  `);
  return stmt.all();
});

// Reports: Get daily summary
ipcMain.handle('get-daily-summary', (event, dateFrom, dateTo) => {
  const stmt = db.prepare(`
    SELECT 
      DATE(inserted_at) as date,
      SUM(coin_value) as revenue,
      COUNT(*) as sessions
    FROM coin_inserts
    WHERE DATE(inserted_at) BETWEEN ? AND ?
    GROUP BY DATE(inserted_at)
    ORDER BY date DESC
  `);
  return stmt.all(dateFrom, dateTo);
});

// Export: Get all transactions for CSV
ipcMain.handle('get-all-transactions', (event, dateFrom, dateTo) => {
  const stmt = db.prepare(`
    SELECT 
      unit_id,
      coin_value,
      inserted_at
    FROM coin_inserts
    WHERE DATE(inserted_at) BETWEEN ? AND ?
    ORDER BY inserted_at DESC
  `);
  return stmt.all(dateFrom, dateTo);
});

// Auth: Verify password
ipcMain.handle('verify-password', (event, password) => {
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  console.log('Login attempt - Input password:', password);
  console.log('Login attempt - Input hash:', hash);
  console.log('Login attempt - Stored hash:', passwordHash);
  console.log('Login attempt - Match:', hash === passwordHash);
  return hash === passwordHash;
});

// Auth: Change password
ipcMain.handle('change-password', (event, oldPassword, newPassword) => {
  const oldHash = crypto.createHash('sha256').update(oldPassword).digest('hex');
  if (oldHash !== passwordHash) {
    return { success: false, message: 'Incorrect current password' };
  }
  
  const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
  const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  stmt.run(newHash, 'password_hash');
  passwordHash = newHash;
  
  return { success: true, message: 'Password changed successfully' };
});

// Relay: Turn ON (give PC power)
ipcMain.handle('relay-on', async (event, unitId) => {
  try {
    await relayController.turnOn(unitId);
    return { success: true };
  } catch (error) {
    console.error('Failed to turn ON relay:', error);
    return { success: false, error: error.message };
  }
});

// Relay: Turn OFF (cut PC power)
ipcMain.handle('relay-off', async (event, unitId) => {
  try {
    await relayController.turnOff(unitId);
    return { success: true };
  } catch (error) {
    console.error('Failed to turn OFF relay:', error);
    return { success: false, error: error.message };
  }
});

// Relay: Get connection status
ipcMain.handle('relay-status', () => {
  return {
    connected: relayController.isConnected,
    states: relayController.relayStates
  };
});

// Shutdown: Send graceful shutdown command to PC
ipcMain.handle('shutdown-pc', async (event, unitId) => {
  try {
    const result = await shutdownController.sendShutdown(unitId);
    return result;
  } catch (error) {
    console.error('Failed to send shutdown command:', error);
    return { success: false, error: error.message };
  }
});

// Shutdown: Cancel pending shutdown
ipcMain.handle('cancel-shutdown', async (event, unitId) => {
  try {
    const result = await shutdownController.cancelShutdown(unitId);
    return result;
  } catch (error) {
    console.error('Failed to cancel shutdown:', error);
    return { success: false, error: error.message };
  }
});

// Shutdown: Configure PC connection settings
ipcMain.handle('configure-pc', async (event, unitId, config) => {
  try {
    shutdownController.configurePC(unitId, config);
    return { success: true };
  } catch (error) {
    console.error('Failed to configure PC:', error);
    return { success: false, error: error.message };
  }
});