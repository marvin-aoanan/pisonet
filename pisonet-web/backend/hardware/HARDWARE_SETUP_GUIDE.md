# Hardware Testing Guide

## Overview
This guide helps you test your pisonet system with real hardware:
- **Coin Acceptor** (pulse-based)
- **USB Relay** (PC power control)

## Hardware Setup

### 1. Coin Acceptor Connection

**Common Coin Acceptor Types:**
- CH-923/924 (most common in Philippines)
- JY-601 Multi-coin acceptor
- Pulse-based coin acceptors

**Wiring:**
```
Coin Acceptor → USB-to-Serial (CH340/FTDI)
├── VCC (12V)    → 12V Power Supply
├── GND          → Ground
├── COIN/PULSE   → RX Pin (Serial)
└── INHIBIT      → (Optional) Control pin
```

**Supported Connections:**
- USB-to-Serial adapter (CH340, FTDI, CP2102)
- Direct USB coin acceptor
- GPIO pins (Raspberry Pi)

**Port Detection:**
- **macOS**: `/dev/tty.usbserial-*` or `/dev/cu.usbserial-*`
- **Linux**: `/dev/ttyUSB*` or `/dev/ttyACM*`
- **Windows**: `COM3`, `COM4`, etc.

### 2. USB Relay Connection

**Your Current Setup:**
- Port: `/dev/tty.usbserial-10`
- Type: CH340 USB Serial Relay
- Already configured in `relay-control.js`

**Connection:**
```
USB Relay → Computer
├── USB Cable → USB Port
└── Relay Outputs → PC Power Buttons (via GPIO or ATX pins)
```

## Installation

### 1. Install Dependencies

```bash
cd /Users/bilyunir/pisonet/pisonet-web/backend
npm install serialport
```

### 2. Identify Serial Ports

Run the test tool to list available ports:

```bash
node hardware/test-hardware.js
```

Select option `5` to list all serial ports. You'll see output like:

```
=== Available Serial Ports ===

1. /dev/tty.usbserial-1
   Manufacturer: QinHeng Electronics
   Vendor ID: 1a86
   Product ID: 7523

2. /dev/tty.usbserial-10
   Manufacturer: QinHeng Electronics
   Vendor ID: 1a86
   Product ID: 7523
```

### 3. Configure Ports

Edit `hardware/test-hardware.js` and update the configuration:

```javascript
const config = {
  coinAcceptor: {
    portPath: '/dev/tty.usbserial-1', // ← Your coin acceptor port
    coinValue: 1, // 1 peso per pulse
    debounceMs: 50
  },
  relay: {
    portPath: '/dev/tty.usbserial-10' // ← Your relay port (already set)
  }
};
```

**Port Permissions (Linux/macOS):**
```bash
# Add your user to dialout group (Linux)
sudo usermod -a -G dialout $USER

# Or change port permissions
sudo chmod 666 /dev/ttyUSB0
sudo chmod 666 /dev/tty.usbserial-1
```

## Testing

### Start the Backend Server

```bash
cd /Users/bilyunir/pisonet/pisonet-web/backend
npm start
```

Server should be running on http://localhost:5001

### Run Hardware Test Tool

In a separate terminal:

```bash
cd /Users/bilyunir/pisonet/pisonet-web/backend
node hardware/test-hardware.js
```

### Test Menu

```
╔════════════════════════════════════════╗
║   HARDWARE TEST MENU                   ║
╠════════════════════════════════════════╣
║ 1. Test Relay (ON → OFF)              ║
║ 2. Simulate 1 Coin Insert             ║
║ 3. Simulate 5 Coins Insert            ║
║ 4. Check Hardware Status              ║
║ 5. List Available Serial Ports        ║
║ 0. Exit                                ║
╚════════════════════════════════════════╝
```

### Test Scenarios

#### 1. Test Relay Control
Press `1` to test relay:
- Turns ON Unit 1 (PC powers on)
- Waits 3 seconds
- Turns OFF Unit 1 (PC powers off)

Expected output:
```
=== Testing Relay Control for Unit 1 ===

Turning ON Unit 1...
✓ Unit turned ON

Turning OFF Unit 1...
✓ Unit turned OFF
```

#### 2. Test Coin Insertion (Simulated)
Press `2` to simulate 1 coin:
```
>>> Simulating 1 coin insertion(s)...

💰 COIN EVENT: 1 coin(s) = ₱1
   Timestamp: 2025-02-01T08:30:45.123Z
✓ Added ₱1 to Unit 1
  New remaining time: 15 minutes
✓ Unit 1 powered ON
```

Press `3` to simulate 5 coins:
```
>>> Simulating 5 coin insertion(s)...

💰 COIN EVENT: 5 coin(s) = ₱5
   Timestamp: 2025-02-01T08:31:12.456Z
✓ Added ₱5 to Unit 1
  New remaining time: 20 minutes
✓ Unit 1 powered ON
```

#### 3. Test Real Coin Acceptor
Insert actual coins into the coin acceptor. You should see:
```
Coin pulse detected (count: 1)
Coin pulse detected (count: 2)
...

💰 COIN EVENT: 5 coin(s) = ₱5
   Timestamp: 2025-02-01T08:32:00.789Z
✓ Added ₱5 to Unit 1
  New remaining time: 25 minutes
✓ Unit 1 powered ON
```

#### 4. Check Hardware Status
Press `4` to see current status:
```
=== Hardware Status ===

Coin Acceptor:
  Connected: ✓
  Port: /dev/tty.usbserial-1
  Coin Value: ₱1

USB Relay:
  Connected: ✓
  Port: /dev/tty.usbserial-10
```

## Troubleshooting

### Coin Acceptor Not Detected

**Problem:** `Failed to connect coin acceptor: Error: Port not found`

**Solutions:**
1. Check USB cable connection
2. Verify port path: `ls /dev/tty.*` or `ls /dev/ttyUSB*`
3. Install CH340 drivers (macOS/Windows)
4. Check port permissions: `sudo chmod 666 /dev/tty.usbserial-1`

### No Pulses Detected

**Problem:** Coin inserted but no pulse detected

**Solutions:**
1. Check coin acceptor wiring (especially COIN/PULSE pin)
2. Verify coin acceptor is powered (12V)
3. Test with multimeter: COIN pin should pulse HIGH/LOW
4. Increase debounce time in config: `debounceMs: 100`
5. Check coin acceptor compatibility (pulse vs. serial protocol)

### Relay Not Working

**Problem:** Relay doesn't turn on/off PC

**Solutions:**
1. Verify relay port: `/dev/tty.usbserial-10`
2. Test relay with LED (relay should click ON/OFF)
3. Check PC power button wiring to relay
4. Verify relay commands in `relay-control.js`

### Multiple Coins Counted as One

**Problem:** Rapid coin insertion counted as single coin

**Solutions:**
1. Reduce debounce time: `debounceMs: 30`
2. Check coin acceptor pulse width
3. Add logging to see pulse timing

## Integration with Backend

### Auto-Start Hardware on Server Launch

Edit `/Users/bilyunir/pisonet/pisonet-web/backend/server.js`:

```javascript
const CoinAcceptor = require('./hardware/coin-acceptor');
const RelayController = require('../../piso-shutdown-listener/relay-control');

// Initialize hardware
let coinAcceptor;
let relayController;

async function initializeHardware() {
  try {
    // Coin acceptor
    coinAcceptor = new CoinAcceptor({
      portPath: '/dev/tty.usbserial-1',
      coinValue: 1
    });
    
    coinAcceptor.on('coin', async (event) => {
      console.log(`Coin inserted: ₱${event.amount}`);
      
      // Add time to unit (you'll need to determine which unit)
      // Example: Route coin to specific unit based on button press
    });
    
    await coinAcceptor.connect();
    console.log('✓ Coin acceptor ready');
    
    // Relay controller
    relayController = new RelayController('/dev/tty.usbserial-10');
    await relayController.connect();
    console.log('✓ Relay controller ready');
    
  } catch (error) {
    console.error('Hardware initialization failed:', error.message);
  }
}

// Call after server starts
initializeHardware();
```

## Next Steps

1. **Test Each Component Separately**
   - First test relay only (option 1)
   - Then test coin acceptor simulation (option 2, 3)
   - Finally test real coin acceptor

2. **Calibrate Coin Values**
   - Adjust `coinValue` for ₱1, ₱5, ₱10 coins
   - Multi-coin acceptors may send different pulse counts

3. **Add Unit Selection**
   - Implement button matrix to select which unit receives coins
   - Or use automatic routing based on customer selection

4. **Monitor Logs**
   - Check console output for pulse detection
   - Verify API calls to add time
   - Monitor relay state changes

5. **Production Deployment**
   - Auto-start hardware on server boot
   - Add error recovery and reconnection
   - Implement hardware health monitoring

## Support

If you encounter issues:
1. Check hardware connections and power
2. Verify serial port paths with option 5
3. Test with simulation mode first (options 2, 3)
4. Review console logs for errors
5. Test each component independently

## Configuration Examples

### Different Coin Values
```javascript
// ₱5 per coin
coinValue: 5

// ₱10 per coin  
coinValue: 10
```

### Multi-Coin Acceptor
```javascript
// Map pulse counts to denominations
coinAcceptor.on('coin', (event) => {
  const denominations = {
    1: 1,   // 1 pulse = ₱1
    2: 5,   // 2 pulses = ₱5
    3: 10   // 3 pulses = ₱10
  };
  
  const amount = denominations[event.coins] || event.coins;
  console.log(`Amount: ₱${amount}`);
});
```

### Faster Response
```javascript
// Reduce debounce for faster coin detection
debounceMs: 30
```
