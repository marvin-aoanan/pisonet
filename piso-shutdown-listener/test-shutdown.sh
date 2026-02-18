#!/bin/bash

# Test Graceful Shutdown Feature
# This script helps you test the shutdown functionality without waiting for timers

echo "==================================="
echo "PisoNet Graceful Shutdown Test"
echo "==================================="
echo ""

# Test 1: Local shutdown (will affect this Mac)
echo "Test 1: Local Shutdown Command"
echo "This will test if shutdown commands work on your Mac"
echo "WARNING: This will actually try to shut down your Mac!"
read -p "Continue? (yes/no): " confirm

if [ "$confirm" == "yes" ]; then
    echo "Sending shutdown command (with 60 second delay for safety)..."
    osascript -e 'tell app "System Events" to display dialog "TEST: This Mac will shutdown in 60 seconds. Run 'sudo killall shutdown' to cancel." buttons {"OK"} default button 1 giving up after 10'
    sudo shutdown -h +1 "PisoNet shutdown test"
    echo ""
    echo "✓ Shutdown command sent!"
    echo "  To cancel: sudo killall shutdown"
    echo ""
else
    echo "Skipped local shutdown test"
fi

# Test 2: SSH connection test
echo ""
echo "Test 2: SSH Connection Test"
echo "This tests if you can connect to a remote PC"
read -p "Enter client PC IP address (e.g., 192.168.1.101): " client_ip

if [ ! -z "$client_ip" ]; then
    read -p "Enter SSH username: " ssh_user
    
    echo "Testing SSH connection..."
    ssh -o ConnectTimeout=5 $ssh_user@$client_ip "echo 'SSH connection successful!'"
    
    if [ $? -eq 0 ]; then
        echo "✓ SSH connection works!"
        echo ""
        read -p "Test shutdown command on remote PC? (yes/no): " test_remote
        
        if [ "$test_remote" == "yes" ]; then
            echo "Sending shutdown command to $client_ip..."
            ssh $ssh_user@$client_ip "echo 'password' | sudo -S shutdown -h +1 'PisoNet test shutdown'"
            echo "✓ Remote shutdown command sent!"
            echo "  The remote PC will shutdown in 1 minute"
            echo "  To cancel on remote: ssh to it and run 'sudo shutdown -c'"
        fi
    else
        echo "✗ SSH connection failed"
        echo "  Make sure:"
        echo "    1. Remote PC is on and connected to network"
        echo "    2. SSH is enabled on remote PC"
        echo "    3. Firewall allows SSH (port 22)"
    fi
else
    echo "Skipped SSH test"
fi

# Test 3: USB Relay device detection
echo ""
echo "Test 3: USB Relay Device Detection"
echo "Checking for USB serial devices..."

serial_devices=$(ls /dev/tty.usbserial-* 2>/dev/null)

if [ ! -z "$serial_devices" ]; then
    echo "✓ Found USB serial device(s):"
    echo "$serial_devices"
    echo ""
    echo "Your relay should be one of these devices"
else
    echo "✗ No USB serial devices found"
    echo "  Make sure:"
    echo "    1. USB relay is plugged in"
    echo "    2. CH340 drivers are installed"
    echo "    3. Device has power"
fi

# Test 4: Windows Remote (if on Windows network)
echo ""
echo "Test 4: Windows Remote Shutdown Test"
echo "This only works if you have Windows PCs on your network"
read -p "Test Windows remote shutdown? (yes/no): " test_windows

if [ "$test_windows" == "yes" ]; then
    read -p "Enter Windows PC IP: " win_ip
    echo "Attempting Windows remote shutdown..."
    echo "Note: This requires proper permissions on the Windows PC"
    
    # This won't work from Mac, but shows the command
    echo "Command that would run on Windows:"
    echo "  shutdown /s /m \\\\$win_ip /t 60 /c \"PisoNet test\""
    echo ""
    echo "To enable Windows Remote Shutdown:"
    echo "  1. Run as Admin on Windows PC:"
    echo "     reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System\" /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f"
    echo "  2. Enable firewall rule:"
    echo "     netsh advfirewall firewall set rule group=\"Remote Shutdown\" new enable=yes"
fi

echo ""
echo "==================================="
echo "Test Complete!"
echo "==================================="
echo ""
echo "Next Steps:"
echo "1. If local shutdown works → Software commands are working"
echo "2. If SSH works → You can control Linux/Mac clients"
echo "3. If relay detected → Hardware backup is ready"
echo "4. Configure PCs in the app: Settings > PC Shutdown Configuration"
echo ""
echo "Quick Start:"
echo "  npm start  # Start the app"
echo "  # Go to Settings tab"
echo "  # Click 'Auto-configure All PCs' button"
echo "  # Or configure each PC individually"
