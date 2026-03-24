require('dotenv').config();
const { SerialPort } = require('serialport');
const axios = require('axios');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://192.168.254.110:5001/api/coin-events';
const SERIAL_PORT = process.env.SERIAL_PORT || '/dev/ttyUSB0';
const BAUD_RATE = parseInt(process.env.BAUD_RATE) || 9600;
const COIN_VALUE = parseInt(process.env.COIN_VALUE) || 5;
const COIN_PULSE_THRESHOLD = parseInt(process.env.COIN_PULSE_THRESHOLD) || 50;

// State
let coinCount = 0;
let selectedUnit = null;
let lastPulseTime = 0;

console.log('🚀 Orange Pi Gateway Starting...');
console.log(`📡 Server URL: ${SERVER_URL}`);
console.log(`🔌 Serial Port: ${SERIAL_PORT} @ ${BAUD_RATE} baud`);
console.log(`💰 Coin Value: ₱${COIN_VALUE} per pulse`);

// Initialize Serial Port for Coin Acceptor
let port;
try {
  port = new SerialPort({
    path: SERIAL_PORT,
    baudRate: BAUD_RATE,
  });

  port.on('open', () => {
    console.log('✅ Serial port opened successfully');
  });

  port.on('data', (data) => {
    handleCoinPulse(data);
  });

  port.on('error', (err) => {
    console.error('❌ Serial port error:', err.message);
  });
} catch (err) {
  console.error('❌ Failed to open serial port:', err.message);
  console.log('⚠️  Will run in test mode without coin acceptor');
}

// Handle coin pulses from coin acceptor
function handleCoinPulse(data) {
  const now = Date.now();
  
  // Debounce pulses (ignore if too close together)
  if (now - lastPulseTime < COIN_PULSE_THRESHOLD) {
    return;
  }
  
  lastPulseTime = now;
  coinCount++;
  
  const totalAmount = coinCount * COIN_VALUE;
  console.log(`💰 Coin detected! Count: ${coinCount} | Total: ₱${totalAmount}`);
  
  // If a unit is selected, send to server immediately
  if (selectedUnit !== null) {
    sendCoinEvent(selectedUnit, totalAmount);
    coinCount = 0; // Reset after sending
  }
}

// Send coin event to central server
async function sendCoinEvent(unitNumber, amount) {
  try {
    console.log(`📤 Sending coin event: Unit ${unitNumber}, Amount: ₱${amount}`);
    
    const response = await axios.post(SERVER_URL, {
      unitNumber: unitNumber,
      amount: amount,
      timestamp: new Date().toISOString(),
      gateway: 'orangepi-001'
    }, {
      timeout: 50000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Server response:`, response.data);
    selectedUnit = null; // Reset selection
    
  } catch (err) {
    console.error('❌ Failed to send coin event:', err.message);
    if (err.response) {
      console.error('   Server responded with:', err.response.status, err.response.data);
    }
  }
}

// Button matrix simulation (to be implemented with GPIO)
// For now, use keyboard input for testing
if (process.stdin.isTTY) {
  console.log('\n🎮 Button Matrix Test Mode');
  console.log('   Press 1-9 to select unit, then insert coins');
  console.log('   Press T to test coin pulse');
  console.log('   Press R to reset');
  console.log('   Press Q to quit\n');
  
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  
  process.stdin.on('data', (key) => {
    if (key === 'q' || key === '\u0003') {
      console.log('\n👋 Shutting down...');
      if (port && port.isOpen) {
        port.close();
      }
      process.exit();
    }
    
    if (key === 't' || key === 'T') {
      // Simulate coin pulse
      handleCoinPulse(Buffer.from([0x01]));
    }
    
    if (key === 'r' || key === 'R') {
      // Reset
      coinCount = 0;
      selectedUnit = null;
      console.log('🔄 Reset: coin count and selection cleared');
    }
    
    const num = parseInt(key);
    if (num >= 1 && num <= 9) {
      selectedUnit = num;
      console.log(`✅ Unit ${num} selected`);
      
      // If there are already coins, send immediately
      if (coinCount > 0) {
        const totalAmount = coinCount * COIN_VALUE;
        sendCoinEvent(selectedUnit, totalAmount);
        coinCount = 0;
      }
    }
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  if (port && port.isOpen) {
    port.close();
  }
  process.exit();
});

console.log('✅ Gateway is ready!\n');
