const { app, Tray, Menu, BrowserWindow } = require('electron');
const path = require('path');
const AutoLaunch = require('electron-auto-launch');
require('./listener');

let tray = null;
let win = null;

const autoLauncher = new AutoLaunch({ name: 'PisoShutdownListener', path: app.getPath('exe') });
autoLauncher.enable();

app.whenReady().then(() => {
    tray = new Tray(path.join(__dirname, 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Timer', click: () => toggleWindow() },
        { label: 'Exit', click: () => app.quit() }
    ]);
    tray.setToolTip('PisoNet Auto Shutdown Listener');
    tray.setContextMenu(contextMenu);
    createWindow();
});

function createWindow() {
    win = new BrowserWindow({
        width: 250,
        height: 100,
        show: false,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    win.loadFile('index.html');
}

function toggleWindow() {
    if (win.isVisible()) win.hide();
    else win.show();
}