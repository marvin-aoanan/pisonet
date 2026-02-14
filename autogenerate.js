const fs = require('fs');
const path = require('path');

const projectName = 'piso-shutdown-listener';
const projectPath = path.join(__dirname, projectName);

// Ensure main folder exists
if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath);
    console.log(`Created folder: ${projectName}`);
}

// Helper to write files
function writeFile(filePath, content) {
    fs.writeFileSync(path.join(projectPath, filePath), content);
    console.log(`Created file: ${filePath}`);
}

// Create logs folder
fs.mkdirSync(path.join(projectPath, 'logs'), { recursive: true });

// package.json
writeFile('package.json', `{
  "name": "piso-shutdown-listener",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "electron": "^26.0.0",
    "serialport": "^11.0.0",
    "node-notifier": "^11.0.0",
    "electron-auto-launch": "^5.0.0"
  },
  "devDependencies": {
    "electron-packager": "^17.1.0"
  }
}`);

// main.js
writeFile('main.js', `const { app, Tray, Menu, BrowserWindow } = require('electron');
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
}`);

// listener.js
writeFile('listener.js', `const SerialPort = require('serialport');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const COM_PORT = 'COM3'; // Update to your Elecbee COM port
const BAUD_RATE = 9600;
const LOG_FILE = path.join(__dirname, 'logs', 'relay.log');

if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'));

const port = new SerialPort(COM_PORT, { baudRate: BAUD_RATE });

console.log(\`Listening on \${COM_PORT}...\`);

port.on('data', (data) => {
    const message = data.toString().trim();
    fs.appendFileSync(LOG_FILE, \`\${new Date().toISOString()} - \${message}\\n\`);
    if (message === 'ON') {
        fs.appendFileSync(LOG_FILE, \`\${new Date().toISOString()} - Shutdown triggered\\n\`);
        exec('shutdown /s /t 0', (err) => {
            if (err) fs.appendFileSync(LOG_FILE, \`\${new Date().toISOString()} - Shutdown failed: \${err}\\n\`);
        });
    }
});

port.on('error', (err) => {
    fs.appendFileSync(LOG_FILE, \`\${new Date().toISOString()} - Serial error: \${err}\\n\`);
});`);

// index.html
writeFile('index.html', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PisoNet Timer</title>
<style>
body { background: rgba(0,0,0,0.6); color: #fff; font-family: Arial; text-align: center; }
#timer { font-size: 32px; margin-top: 30px; }
</style>
</head>
<body>
<div id="timer">00:00</div>
<script src="renderer.js"></script>
</body>
</html>`);

// renderer.js
writeFile('renderer.js', `let timeLeft = 0; // in seconds
function updateTimer() {
    const m = String(Math.floor(timeLeft/60)).padStart(2,'0');
    const s = String(timeLeft%60).padStart(2,'0');
    document.getElementById('timer').innerText = \`\${m}:\${s}\`;
}
setInterval(() => { if(timeLeft>0){timeLeft--; updateTimer();} }, 1000);`);

// icon.png
// For simplicity, create a blank placeholder icon
const iconPath = path.join(projectPath, 'icon.png');
fs.writeFileSync(iconPath, Buffer.alloc(0));
console.log('Created placeholder icon.png');

console.log('\n✅ Project generator complete!');
console.log(`Project folder ready at: ${projectPath}`);
console.log('Next: run `npm install` inside the folder, then `npm start` to test, then package using Electron Packager.');
