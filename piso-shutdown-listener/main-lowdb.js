const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const RelayController = require('./relay-control');
const ShutdownController = require('./shutdown-control');

// Initialize controllers
const relayController = new RelayController();
const shutdownController = new ShutdownController();

// Simple JSON database
const DB_FILE = 'pisonet-db.json';
const defaultData = {
  units: [],
  coinInserts: [],
  timers: {},
  settings: {}
};

function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading database:', error);
  }
  return { ...defaultData };
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing database:', error);
  }
}

function initDatabase() {
  const db = readDB();
  
  // Initialize password if not exists
  if (!db.settings.passwordHash) {
    const DEFAULT_PASSWORD = 'admin123';
    db.settings.passwordHash = crypto.createHash('sha256').update(DEFAULT_PASSWORD).digest('hex');
    writeDB(db);
    console.log('Default password set to: admin123');
  }
}

function logCoin(unitId, coinValue) {
  const db = readDB();
  db.coinInserts.push({
    id: Date.now(),
    unitId,
    coinValue,
    insertedAt: new Date().toISOString()
  });
  writeDB(db);
}

function getRevenueToday() {
  const db = readDB();
  const today = new Date().toISOString().split('T')[0];
  return db.coinInserts
    .filter(c => c.insertedAt.startsWith(today))
    .reduce((sum, c) => sum + c.coinValue, 0);
}

function getRevenueAll() {
  const db = readDB();
  return db.coinInserts.reduce((sum, c) => sum + c.coinValue, 0);
}

function getSessionsToday() {
  const db = readDB();
  const today = new Date().toISOString().split('T')[0];
  return db.coinInserts.filter(c => c.insertedAt.startsWith(today)).length;
}

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  // Disable extensions in production
  if (!isDev) {
    app.commandLine.appendSwitch('disable-extensions');
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev // Disable DevTools in production to prevent extension warnings
    }
  });

  if (isDev) {
    // Development mode: load from Next.js dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode: load from built Next.js app
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'out', 'index.html'));
    
    // Filter out extension and dev tool console warnings
    mainWindow.webContents.on('console-message', (event) => {
      const message = event.message || '';
      // Suppress common extension/devtools warnings
      if (message.includes('Could not establish connection') ||
          message.includes('Injected script') ||
          message.includes('electronAPI not available')) {
        event.preventDefault();
      }
    });
  }
  
  // Connect to relay on startup
  relayController.connect().catch(err => {
    console.error('Failed to connect to relay:', err.message);
    console.log('Running in simulation mode');
  });
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
});

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
  const db = readDB();
  // Convert timers object to array format
  return Object.entries(db.timers).map(([unitId, data]) => ({
    unit_id: parseInt(unitId),
    remaining_seconds: data.remainingSeconds || 0,
    total_revenue: data.totalRevenue || 0,
    last_updated: data.lastUpdated || new Date().toISOString()
  }));
});

ipcMain.handle('update-timer', (event, unitId, remainingSeconds, totalRevenue) => {
  const db = readDB();
  db.timers[unitId] = {
    remainingSeconds,
    totalRevenue,
    lastUpdated: new Date().toISOString()
  };
  writeDB(db);
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

ipcMain.handle('login', (event, password) => {
  const db = readDB();
  const storedHash = db.settings.passwordHash;
  
  if (!storedHash) return { success: false };
  
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  return { success: inputHash === storedHash };
});

ipcMain.handle('change-password', (event, oldPassword, newPassword) => {
  const db = readDB();
  const storedHash = db.settings.passwordHash;
  
  if (!storedHash) return { success: false };
  
  const oldHash = crypto.createHash('sha256').update(oldPassword).digest('hex');
  if (oldHash !== storedHash) {
    return { success: false, error: 'Incorrect current password' };
  }
  
  const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
  db.settings.passwordHash = newHash;
  writeDB(db);
  
  return { success: true };
});

ipcMain.handle('get-all-transactions', (event, dateFrom, dateTo) => {
  const db = readDB();
  return db.coinInserts.filter(t => {
    const date = t.insertedAt.split('T')[0];
    return date >= dateFrom && date <= dateTo;
  });
});

ipcMain.handle('configure-pc', async (event, unitId, config) => {
  try {
    await shutdownController.configure(unitId, config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
