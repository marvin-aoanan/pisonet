using System.Collections.Generic;
using System.Threading.Tasks;
using PisoNet.Core.Models;

namespace PisoNet.Core.Interfaces
{
    public interface IHardwareService
    {
        Task ConnectAsync(string portName);
        void Disconnect();
        
        void TurnOn(int unitId);
        void TurnOff(int unitId);
        void ShutdownPC(int unitId);
        void SelectUnit(int unitId);
        
        event System.EventHandler<CoinInsertEventArgs> CoinInserted;
    }

    public class CoinInsertEventArgs : System.EventArgs
    {
        public int UnitId { get; set; }
        public decimal Amount { get; set; }
    }
}
