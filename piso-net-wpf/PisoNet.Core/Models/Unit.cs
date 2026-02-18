using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace PisoNet.Core.Models
{
    public class Unit : INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler? PropertyChanged;
        private void OnPropertyChanged([CallerMemberName] string? name = null)
            => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));

        public int Id { get; set; }

        private string _name = string.Empty;
        public string Name { get => _name; set { _name = value; OnPropertyChanged(); } }

        private int _remainingSeconds;
        public int RemainingSeconds { get => _remainingSeconds; set { _remainingSeconds = value; OnPropertyChanged(); OnPropertyChanged(nameof(IsRunning)); } }

        private decimal _totalRevenue;
        public decimal TotalRevenue { get => _totalRevenue; set { _totalRevenue = value; OnPropertyChanged(); } }

        public bool IsRunning => RemainingSeconds > 0;

        private string _status = "Idle";
        public string Status { get => _status; set { _status = value; OnPropertyChanged(); } }

        private bool _isSelected;
        public bool IsSelected { get => _isSelected; set { _isSelected = value; OnPropertyChanged(); } }
    }

    public class Transaction 
    {
        public int Id { get; set; }
        public int UnitId { get; set; }
        public decimal Amount { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
