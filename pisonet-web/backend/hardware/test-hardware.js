const CoinAcceptor = require('./coin-acceptor');
const RelayController = require('../../../piso-shutdown-listener/relay-control');
const axios = require('axios');

/**
 * Hardware Test Script
 * Tests coin acceptor and USB relay functionality
 */

const BACKEND_URL = 'http://localhost:5001';
const TEST_UNIT_ID = 1; // Unit to test with

// Configuration
const config = {
  coinAcceptor: {
    portPath: '/dev/tty.usbserial-110', // Coin acceptor USB adapter
    coinValue: 1, // 1 peso per pulse
    debounceMs: 50
  },
  relay: {
    portPath: null // Relay not connected (using simulation)
  }
};

let coinAcceptor;
let relayController;

/**
 * Initialize hardware devices
 */
async function initializeHardware() {
  console.log('\n=== Initializing Hardware ===\n');
  
  // Initialize coin acceptor
  try {
    console.log('Connecting to coin acceptor...');
    coinAcceptor = new CoinAcceptor(config.coinAcceptor);
    
    coinAcceptor.on('connected', () => {
      console.log('✓ Coin acceptor connected');
    });
    
    coinAcceptor.on('coin', async (event) => {
      console.log(`\n💰 COIN EVENT: ${event.coins} coin(s) = ₱${event.amount}`);
      console.log(`   Timestamp: ${event.timestamp}`);
      
      // Add time to unit via API
      await addTimeToUnit(TEST_UNIT_ID, event.amount);
    });
    
    coinAcceptor.on('error', (err) => {
      console.error('❌ Coin acceptor error:', err.message);
    });
    
    await coinAcceptor.connect();
    
  } catch (error) {
    console.error('❌ Failed to connect coin acceptor:', error.message);
    console.log('   Using simulation mode for coin acceptor\n');
  }
  
  // Initialize relay controller
  try {
    console.log('Connecting to USB relay...');
    relayController = new RelayController();
    relayController.portPath = config.relay.portPath; // Override port path
    
    await relayController.connect();
    console.log('✓ USB relay connected\n');
    
  } catch (error) {
    console.error('❌ Failed to connect relay:', error.message);
    console.log('   Using simulation mode for relay\n');
  }
}

/**
 * Add time to unit via backend API
 */
async function addTimeToUnit(unitId, amount) {
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/units/${unitId}/add-time`,
      { amount }
    );
    
    console.log(`✓ Added ₱${amount} to Unit ${unitId}`);
    console.log(`  New remaining time: ${response.data.remainingTime} minutes`);
    
    // Turn on PC if it was off
    if (relayController) {
      await relayController.turnOn(unitId);
      console.log(`✓ Unit ${unitId} powered ON`);
    }
    
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to add time to unit ${unitId}:`, error.message);
  }
}

/**
 * Test relay control
 */
async function testRelay(unitId) {
  if (!relayController) {
    console.log('❌ Relay not connected');
    return;
  }
  
  console.log(`\n=== Testing Relay Control for Unit ${unitId} ===\n`);
  
  try {
    // Turn ON
    console.log(`Turning ON Unit ${unitId}...`);
    await relayController.turnOn(unitId);
    console.log('✓ Unit turned ON');
    
    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Turn OFF
    console.log(`\nTurning OFF Unit ${unitId}...`);
    await relayController.turnOff(unitId);
    console.log('✓ Unit turned OFF');
    
  } catch (error) {
    console.error('❌ Relay test failed:', error.message);
  }
}

/**
 * Simulate coin insertion (for testing without hardware)
 */
function simulateCoinInsertion(coins = 1) {
  if (!coinAcceptor) {
    console.log('❌ Coin acceptor not initialized');
    return;
  }
  
  console.log(`\n>>> Simulating ${coins} coin insertion(s)...`);
  coinAcceptor.simulateCoin(coins);
}

/**
 * Display test menu
 */
function displayMenu() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   HARDWARE TEST MENU                   ║');
  console.log('╠════════════════════════════════════════╣');
  console.log('║ 1. Test Relay (ON → OFF)              ║');
  console.log('║ 2. Simulate 1 Coin Insert             ║');
  console.log('║ 3. Simulate 5 Coins Insert            ║');
  console.log('║ 4. Check Hardware Status              ║');
  console.log('║ 5. List Available Serial Ports        ║');
  console.log('║ 0. Exit                                ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log('Waiting for coin insertion or press key for manual test...\n');
}

/**
 * Check hardware status
 */
function checkStatus() {
  console.log('\n=== Hardware Status ===\n');
  
  if (coinAcceptor) {
    const status = coinAcceptor.getStatus();
    console.log('Coin Acceptor:');
    console.log(`  Connected: ${status.connected ? '✓' : '✗'}`);
    console.log(`  Port: ${status.port}`);
    console.log(`  Coin Value: ₱${status.coinValue}`);
  } else {
    console.log('Coin Acceptor: Not initialized');
  }
  
  console.log();
  
  if (relayController) {
    console.log('USB Relay:');
    console.log(`  Connected: ✓`);
    console.log(`  Port: ${config.relay.portPath}`);
  } else {
    console.log('USB Relay: Not initialized');
  }
  
  console.log();
}

/**
 * List available serial ports
 */
async function listSerialPorts() {
  const { SerialPort } = require('serialport');
  
  console.log('\n=== Available Serial Ports ===\n');
  
  try {
    const ports = await SerialPort.list();
    
    if (ports.length === 0) {
      console.log('No serial ports found');
      return;
    }
    
    ports.forEach((port, index) => {
      console.log(`${index + 1}. ${port.path}`);
      if (port.manufacturer) console.log(`   Manufacturer: ${port.manufacturer}`);
      if (port.serialNumber) console.log(`   Serial: ${port.serialNumber}`);
      if (port.vendorId) console.log(`   Vendor ID: ${port.vendorId}`);
      if (port.productId) console.log(`   Product ID: ${port.productId}`);
      console.log();
    });
    
  } catch (error) {
    console.error('Failed to list serial ports:', error.message);
  }
}

/**
 * Handle user input
 */
function handleInput(input) {
  const choice = input.trim();
  
  switch (choice) {
    case '1':
      testRelay(TEST_UNIT_ID);
      break;
    case '2':
      simulateCoinInsertion(1);
      break;
    case '3':
      simulateCoinInsertion(5);
      break;
    case '4':
      checkStatus();
      break;
    case '5':
      listSerialPorts();
      break;
    case '0':
      cleanup();
      process.exit(0);
      break;
    default:
      console.log('Invalid choice');
  }
}

/**
 * Cleanup on exit
 */
async function cleanup() {
  console.log('\n=== Cleaning up ===\n');
  
  if (coinAcceptor) {
    await coinAcceptor.disconnect();
    console.log('✓ Coin acceptor disconnected');
  }
  
  console.log('✓ Cleanup complete');
}

/**
 * Main function
 */
async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  PISONET HARDWARE TEST TOOL           ║');
  console.log('║  Coin Acceptor + USB Relay            ║');
  console.log('╚═══════════════════════════════════════╝');
  
  // Initialize hardware
  await initializeHardware();
  
  // Display menu
  displayMenu();
  
  // Set up input handling
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.on('line', (input) => {
    handleInput(input);
  });
  
  // Handle exit
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, exiting...');
    await cleanup();
    process.exit(0);
  });
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  initializeHardware,
  testRelay,
  simulateCoinInsertion,
  checkStatus,
  listSerialPorts
};
