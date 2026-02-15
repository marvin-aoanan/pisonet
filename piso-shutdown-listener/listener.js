const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const logFile = path.join(logsDir, 'relay.log');

function log(message) {
  const entry = `${new Date().toISOString()} - ${message}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(message);
}

let remainingSeconds = 0;
let timerInterval = null;

function startTimer(minutes) {
  remainingSeconds += minutes * 60;
  log(`Added ${minutes} minute(s). Total time: ${remainingSeconds}s`);

  if (!timerInterval) {
    timerInterval = setInterval(() => {
      remainingSeconds--;
      log(`Remaining: ${remainingSeconds}s`);

      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        log("Time expired. Triggering shutdown...");

        if (os.platform() === 'win32') {
          exec('shutdown /s /t 0');
        } else {
          console.log("Shutdown simulated (Mac dev mode)");
        }
      }
    }, 1000);
  }
}

module.exports = { startTimer };
