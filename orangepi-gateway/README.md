# Orange Pi Gateway Service

Gateway service for reading coin acceptor and button matrix, then sending events to the central server.

## Setup on Orange Pi

### 1. Transfer files to Orange Pi

From your Mac, compress and transfer:
```bash
cd /Users/bilyunir/pisonet
tar -czf orangepi-gateway.tar.gz orangepi-gateway/
scp orangepi-gateway.tar.gz root@192.168.254.108:~/
```

### 2. On Orange Pi, extract and install

```bash
cd ~
tar -xzf orangepi-gateway.tar.gz
cd orangepi-gateway
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
nano .env
```

Update the SERVER_URL to your server's IP address.

### 4. Find USB serial port

```bash
ls /dev/ttyUSB*
# or
dmesg | grep tty
```

Update SERIAL_PORT in .env with the correct device path.

### 5. Test run

```bash
npm start
```

Use keyboard to test:
- Press 1-9 to select unit
- Press T to simulate coin
- Press R to reset
- Press Q to quit

### 6. Run as service (systemd)

Create service file:
```bash
sudo nano /etc/systemd/system/pisonet-gateway.service
```

Add:
```ini
[Unit]
Description=Pisonet Gateway Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/orangepi-gateway
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pisonet-gateway
sudo systemctl start pisonet-gateway
sudo systemctl status pisonet-gateway
```

View logs:
```bash
sudo journalctl -u pisonet-gateway -f
```

## Hardware Connections

### Coin Acceptor (USB-Serial)
- Connect to Orange Pi USB port
- Check device with: `ls /dev/ttyUSB*`

### 4x3 Button Matrix (GPIO)
Coming soon - will use GPIO pins for button matrix reading.

## Testing

Test mode allows keyboard input:
- **1-9**: Select unit number
- **T**: Simulate coin pulse
- **R**: Reset counters
- **Q**: Quit

## API Endpoint

The gateway sends POST requests to:
```
POST http://SERVER_IP:3000/api/coin-events
```

Payload:
```json
{
  "unitNumber": 1,
  "amount": 10,
  "timestamp": "2026-03-06T10:30:00.000Z",
  "gateway": "orangepi-001"
}
```
