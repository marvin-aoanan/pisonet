const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  simulateCoin: (unitId, coinValue) => {
    ipcRenderer.send('simulate-coin', unitId, coinValue);
  },
  getTimers: () => ipcRenderer.invoke('get-timers'),
  updateTimer: (unitId, remainingSeconds, totalRevenue) => 
    ipcRenderer.invoke('update-timer', unitId, remainingSeconds, totalRevenue),
  
  // Dashboard APIs
  getRevenueToday: () => ipcRenderer.invoke('get-revenue-today'),
  getRevenueAll: () => ipcRenderer.invoke('get-revenue-all'),
  getSessionsToday: () => ipcRenderer.invoke('get-sessions-today'),
  getUnitStats: () => ipcRenderer.invoke('get-unit-stats'),
  
  // Reports APIs
  getDailySummary: (dateFrom, dateTo) => ipcRenderer.invoke('get-daily-summary', dateFrom, dateTo),
  getAllTransactions: (dateFrom, dateTo) => ipcRenderer.invoke('get-all-transactions', dateFrom, dateTo),
  
  // Auth APIs
  verifyPassword: (password) => ipcRenderer.invoke('verify-password', password),
  changePassword: (oldPassword, newPassword) => ipcRenderer.invoke('change-password', oldPassword, newPassword),
  
  // Reports APIs
  getAllTransactions: (dateFrom, dateTo) => ipcRenderer.invoke('get-all-transactions', dateFrom, dateTo),
  
  // Relay APIs
  relayOn: (unitId) => ipcRenderer.invoke('relay-on', unitId),
  relayOff: (unitId) => ipcRenderer.invoke('relay-off', unitId),
  relayStatus: () => ipcRenderer.invoke('relay-status'),
  
  // Shutdown APIs
  shutdownPC: (unitId) => ipcRenderer.invoke('shutdown-pc', unitId),
  cancelShutdown: (unitId) => ipcRenderer.invoke('cancel-shutdown', unitId),
  configurePC: (unitId, config) => ipcRenderer.invoke('configure-pc', unitId, config)
});
