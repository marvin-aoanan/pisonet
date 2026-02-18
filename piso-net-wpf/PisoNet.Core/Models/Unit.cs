using System;

namespace PisoNet.Core.Models
{
    public class Unit
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public int RemainingSeconds { get; set; }
        public decimal TotalRevenue { get; set; }
        public bool IsRunning => RemainingSeconds > 0;
        public string Status { get; set; } // "Active", "Idle", "Warning"
    }

    public class Transaction 
    {
        public int Id { get; set; }
        public int UnitId { get; set; }
        public decimal Amount { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
