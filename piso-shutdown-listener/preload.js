const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  simulateCoin: (unitId, coinValue) => {
    ipcRenderer.send('simulate-coin', unitId, coinValue);
  },
  getTimers: () => ipcRenderer.invoke('get-timers'),
  updateTimer: (unitId, remainingSeconds, totalRevenue) => 
    ipcRenderer.invoke('update-timer', unitId, remainingSeconds, totalRevenue)
});
