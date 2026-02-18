const { SerialPort } = require('serialport');
const fs = require('fs');
const path = require('path');

class RelayController {
  constructor() {
    this.port = null;
    this.portPath = '/dev/tty.usbserial-10'; // CH340 device
    this.isConnected = false;
    this.relayStates = {}; // Track relay states
    
    // LCUS-type 1 relay commands (adjust if different for your specific model)
    this.commands = {
      open: Buffer.from([0xA0, 0x01, 0x00, 0xA1]), // Turn OFF relay (open circuit)
      close: Buffer.from([0xA0, 0x01, 0x01, 0xA2]) // Turn ON relay (close circuit)
    };
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: this.portPath,
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none'
        });

        this.port.on('open', () => {
          console.log('Relay connected:', this.portPath);
          this.isConnected = true;
          this.logAction('Relay connected');
          resolve(true);
        });

        this.port.on('error', (err) => {
          console.error('Relay connection error:', err.message);
          this.isConnected = false;
          reject(err);
        });

        this.port.on('close', () => {
          console.log('Relay disconnected');
          this.isConnected = false;
        });

      } catch (error) {
        console.error('Failed to create serial port:', error);
        reject(error);
      }
    });
  }

  async turnOn(unitId) {
    if (!this.isConnected) {
      console.log('Relay not connected. Simulating relay ON for unit', unitId);
      this.relayStates[unitId] = true;
      this.logAction(`Unit ${unitId}: Relay ON (simulated)`);
      return true;
    }

    return new Promise((resolve, reject) => {
      this.port.write(this.commands.close, (err) => {
        if (err) {
          console.error('Error turning ON relay:', err);
          reject(err);
        } else {
          this.relayStates[unitId] = true;
          console.log(`Unit ${unitId}: Relay ON - PC powered`);
          this.logAction(`Unit ${unitId}: Relay ON - PC powered`);
          resolve(true);
        }
      });
    });
  }

  async turnOff(unitId) {
    if (!this.isConnected) {
      console.log('Relay not connected. Simulating relay OFF for unit', unitId);
      this.relayStates[unitId] = false;
      this.logAction(`Unit ${unitId}: Relay OFF (simulated)`);
      return true;
    }

    return new Promise((resolve, reject) => {
      this.port.write(this.commands.open, (err) => {
        if (err) {
          console.error('Error turning OFF relay:', err);
          reject(err);
        } else {
          this.relayStates[unitId] = false;
          console.log(`Unit ${unitId}: Relay OFF - PC powered down`);
          this.logAction(`Unit ${unitId}: Relay OFF - PC powered down`);
          resolve(true);
        }
      });
    });
  }

  getState(unitId) {
    return this.relayStates[unitId] || false;
  }

  disconnect() {
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
  }

  logAction(message) {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
    
    const logFile = path.join(logsDir, 'relay.log');
    const entry = `${new Date().toISOString()} - ${message}\n`;
    fs.appendFileSync(logFile, entry);
  }
}

module.exports = RelayController;
