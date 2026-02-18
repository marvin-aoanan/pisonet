const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const RelayController = require('./relay-control');
const ShutdownController = require('./shutdown-control');

// Initialize controllers
const relayController = new RelayController();
const shutdownController = new ShutdownController();

// Database setup with lowdb v3
const adapter = new FileSync('pisonet-db.json');
const db = low(adapter);

// Set defaults
db.defaults({
  units: [],
  coinInserts: [],
  timers: {},
  settings: {}
}).write();

function initDatabase() {
  // Initialize password if not exists
  if (!db.get('settings.passwordHash').value()) {
    const DEFAULT_PASSWORD = 'admin123';
    db.set('settings.passwordHash', crypto.createHash('sha256').update(DEFAULT_PASSWORD).digest('hex'))
      .write();
    console.log('Default password set to: admin123');
  }
}

function logCoin(unitId, coinValue) {
  db.get('coinInserts')
    .push({
      id: Date.now(),
      unitId,
      coinValue,
      insertedAt: new Date().toISOString()
    })
    .write();
}

function getRevenueToday() {
  const today = new Date().toISOString().split('T')[0];
  return db.get('coinInserts')
    .filter(c => c.insertedAt.startsWith(today))
    .reduce((sum, c) => sum + c.coinValue, 0)
    .value();
}

function getRevenueAll() {
  return db.get('coinInserts')
    .reduce((sum, c) => sum + c.coinValue, 0)
    .value();
}

function getSessionsToday() {
  const today = new Date().toISOString().split('T')[0];
  return db.get('coinInserts')
    .filter(c => c.insertedAt.startsWith(today))
    .size()
    .value();
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
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'out', 'index.html'));
  }
  
  // Connect to relay on startup
  relayController.connect().catch(err => {
    console.error('Failed to connect to relay:', err.message);
    console.log('Running in simulation mode');
  });
}

app.whenReady().then(async () => {
  await initDatabase();
  createWindow();() => {
 

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
  // Convert timers object to array format
  const timers = db.get('timers').value();
  return Object.entries(timers).map(([unitId, data]) => ({
    unit_id: parseInt(unitId),
    remaining_seconds: data.remainingSeconds || 0,
    total_revenue: data.totalRevenue || 0,
    last_updated: data.lastUpdated || new Date().toISOString()
  }));
});

ipcMain.handle('update-timer', (event, unitId, remainingSeconds, totalRevenue) => {
  db.set(`timers.${unitId}`, {
    remainingSeconds,
    totalRevenue,
    lastUpdated: new Date().toISOString()
  }).write();
});

ipcMain.handle('get-revenue-today', () => {
  return getRevenueToday();
});

ipcMain.handle('get-revenue-all', () => {
  return getRevenueAll();
});

ipcMain.handle('get-sessions-today', () => {
  return getSessionsToday();
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
  await db.read();
  const storedHash = db.data.settings.passwordHash;
  
  if (!storedHash) return { success: false };
  (event, password) => {
  const storedHash = db.get('settings.passwordHash').value()
});

ipcMain.handle('configure-pc', async (event, unitId, config) => {
  try {
    await shutdownController.configure(unitId, config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
