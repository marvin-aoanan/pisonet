using System;
using System.IO.Ports;
using System.Threading.Tasks;
using PisoNet.Core.Interfaces;

namespace PisoNet.Infrastructure.Services 
{
    public class SerialPortService : IHardwareService
    {
        private SerialPort _serialPort;
        private bool _isConnected;

        public event EventHandler<CoinInsertEventArgs> CoinInserted;

        public async Task ConnectAsync(string portName)
        {
            try 
            {
                if (_isConnected) return;

                _serialPort = new SerialPort(portName, 9600, Parity.None, 8, StopBits.One);
                _serialPort.DataReceived += SerialPort_DataReceived;
                _serialPort.Open();
                
                _isConnected = true;
                Console.WriteLine($"Simulated connection to {portName}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error connecting to port: {ex.Message}");
                // In production, log this or rethrow
            }
        }

        private void SerialPort_DataReceived(object sender, SerialDataReceivedEventArgs e)
        {
            // Simulate reading coin data: "COIN:1:5" (Unit 1, 5 Pesos)
            string data = _serialPort.ReadLine();
            
            // Parse logic here (simplified for example)
            if (data.StartsWith("COIN"))
            {
               var parts = data.Split(':');
               if (parts.Length == 3 && int.TryParse(parts[1], out int unitId) && decimal.TryParse(parts[2], out decimal amount))
               {
                   CoinInserted?.Invoke(this, new CoinInsertEventArgs { UnitId = unitId, Amount = amount });
               }
            }
        }

        public void Disconnect()
        {
            if (_serialPort != null && _serialPort.IsOpen)
            {
                _serialPort.Close();
                _serialPort.Dispose();
            }
            _isConnected = false;
        }

        public void TurnOn(int unitId)
        {
            if (_isConnected)
            {
                // Send command to Arduino/Relay: "ON:1"
                _serialPort.WriteLine($"ON:{unitId}");
            }
        }

        public void TurnOff(int unitId)
        {
             if (_isConnected)
            {
                // Send command to Arduino/Relay: "OFF:1"
                _serialPort.WriteLine($"OFF:{unitId}");
            }
        }

        public void ShutdownPC(int unitId)
        {
             if (_isConnected)
            {
                // Send command to Arduino/Relay: "SHUTDOWN:1"
                _serialPort.WriteLine($"SHUTDOWN:{unitId}");
            }
        }

        public void SelectUnit(int unitId)
        {
            if (_isConnected && _serialPort != null)
            {
                // Send command to microcontroller: "SELECT:1"
                _serialPort.WriteLine($"SELECT:{unitId}");
            }
        }
    }
}
