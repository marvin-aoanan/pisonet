const { SerialPort } = require('serialport');
const EventEmitter = require('events');

/**
 * Coin Acceptor Controller
 * Handles pulse-based coin acceptor (common pisonet type)
 * Each pulse represents a coin denomination
 */
class CoinAcceptor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.portPath = options.portPath || this.detectCoinPort();
    this.baudRate = options.baudRate || 9600;
    this.coinValue = options.coinValue || 1; // 1 peso per pulse
    this.debounceMs = options.debounceMs || 50; // Debounce time
    
    // State
    this.port = null;
    this.isConnected = false;
    this.pulseCount = 0;
    this.lastPulseTime = 0;
    this.debounceTimer = null;
  }

  /**
   * Auto-detect coin acceptor port
   * Common patterns: /dev/ttyUSB*, /dev/ttyACM*, COM*
   */
  detectCoinPort() {
    const os = require('os');
    const platform = os.platform();
    
    if (platform === 'darwin') {
      return '/dev/tty.usbserial-1'; // macOS CH340
    } else if (platform === 'linux') {
      return '/dev/ttyUSB0'; // Linux
    } else if (platform === 'win32') {
      return 'COM3'; // Windows
    }
    
    return null;
  }

  /**
   * Connect to coin acceptor
   */
  async connect() {
    if (!this.portPath) {
      throw new Error('Coin acceptor port not specified');
    }

    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: this.portPath,
          baudRate: this.baudRate,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false
        });

        this.port.open((err) => {
          if (err) {
            console.error('Failed to open coin acceptor port:', err.message);
            reject(err);
            return;
          }

          this.isConnected = true;
          console.log(`Coin acceptor connected: ${this.portPath}`);
          this.emit('connected');
          
          // Set up data listener for pulses
          this.setupPulseDetection();
          
          resolve();
        });

        this.port.on('error', (err) => {
          console.error('Coin acceptor error:', err.message);
          this.isConnected = false;
          this.emit('error', err);
        });

        this.port.on('close', () => {
          console.log('Coin acceptor disconnected');
          this.isConnected = false;
          this.emit('disconnected');
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Set up pulse detection from coin acceptor
   */
  setupPulseDetection() {
    this.port.on('data', (data) => {
      // Pulse-based coin acceptors typically send HIGH/LOW signals
      // Each pulse = 1 coin
      const now = Date.now();
      
      // Debounce: Ignore pulses within debounce window
      if (now - this.lastPulseTime < this.debounceMs) {
        return;
      }
      
      this.lastPulseTime = now;
      this.pulseCount++;
      
      console.log(`Coin pulse detected (count: ${this.pulseCount})`);
      
      // Clear existing debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      // Wait for debounce period, then emit coin event
      this.debounceTimer = setTimeout(() => {
        const coins = this.pulseCount;
        const amount = coins * this.coinValue;
        
        console.log(`Coin inserted: ${coins} coin(s) = ₱${amount}`);
        
        this.emit('coin', {
          coins,
          amount,
          timestamp: new Date().toISOString()
        });
        
        // Reset pulse count
        this.pulseCount = 0;
      }, this.debounceMs);
    });
  }

  /**
   * Disconnect from coin acceptor
   */
  async disconnect() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => {
          this.isConnected = false;
          resolve();
        });
      });
    }
  }

  /**
   * Check if coin acceptor is connected
   */
  getStatus() {
    return {
      connected: this.isConnected,
      port: this.portPath,
      coinValue: this.coinValue
    };
  }

  /**
   * Simulate coin insertion (for testing without hardware)
   */
  simulateCoin(coins = 1) {
    const amount = coins * this.coinValue;
    console.log(`Simulated coin insertion: ${coins} coin(s) = ₱${amount}`);
    
    this.emit('coin', {
      coins,
      amount,
      timestamp: new Date().toISOString(),
      simulated: true
    });
  }
}

module.exports = CoinAcceptor;
