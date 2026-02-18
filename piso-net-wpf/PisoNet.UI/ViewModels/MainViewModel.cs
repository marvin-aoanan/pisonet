using System.Collections.ObjectModel;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PisoNet.Core.Models;
using PisoNet.Core.Interfaces;
using PisoNet.Infrastructure.Services; 

namespace PisoNet.UI.ViewModels
{
    public partial class MainViewModel : ObservableObject
    {
        private readonly IHardwareService _hardwareService;

        [ObservableProperty]
        private ObservableCollection<Unit> _units;

        [ObservableProperty]
        private decimal _totalRevenue;

        [ObservableProperty]
        private string _statusMessage;

        public MainViewModel()
        {
            // Dependency Injection would be better here, but initializing manually for simplicity
            _hardwareService = new SerialPortService();
            _hardwareService.CoinInserted += OnCoinInserted;

            Units = new ObservableCollection<Unit>();
            InitializeUnits();

            StatusMessage = "System Ready - Waiting for Hardware...";
        }

        private void InitializeUnits()
        {
            for (int i = 1; i <= 10; i++)
            {
                Units.Add(new Unit 
                { 
                    Id = i, 
                    Name = $"PC {i}", 
                    Status = "Idle",
                    RemainingSeconds = 0,
                    TotalRevenue = 0
                });
            }
        }

        private void OnCoinInserted(object sender, CoinInsertEventArgs e)
        {
            // Update UI/Logic on UI Thread
            System.Windows.Application.Current.Dispatcher.Invoke(() => 
            {
                var unit = Units.FirstOrDefault(u => u.Id == e.UnitId);
                if (unit != null)
                {
                    unit.TotalRevenue += e.Amount;
                    unit.RemainingSeconds += (int)(e.Amount * 60); // 1 Peso = 1 Minute example
                    unit.Status = "Active";
                    TotalRevenue += e.Amount;
                }
            });
        }

        [RelayCommand]
        public async Task ConnectHardware()
        {
            StatusMessage = "Connecting...";
            await _hardwareService.ConnectAsync("COM3"); // Example Port
            StatusMessage = "Connected to COM3";
        }
    }
}
