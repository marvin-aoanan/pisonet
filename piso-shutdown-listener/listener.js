const { SerialPort } = require('serialport');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COM_PORT = 'COM3'; // Change for Windows testing
const BAUD_RATE = 9600;

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const logFile = path.join(logsDir, 'relay.log');

function log(message) {
  fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
  console.log(message);
}

log("Starting Piso Shutdown Listener...");

// IMPORTANT: NEW constructor format
const port = new SerialPort({
  path: COM_PORT,
  baudRate: BAUD_RATE,
  autoOpen: true
});

port.on('open', () => {
  log(`Connected to ${COM_PORT}`);
});

port.on('data', (data) => {
  const message = data.toString().trim();
  log(`Received: ${message}`);

  if (message === 'ON') {
    log('Shutdown triggered');

    if (os.platform() === 'win32') {
      exec('shutdown /s /t 0');
    } else if (os.platform() === 'darwin') {
      exec('sudo shutdown -h now');
    }
  }
});

port.on('error', (err) => {
  log(`Serial error: ${err.message}`);
});
