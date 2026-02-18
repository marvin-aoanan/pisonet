using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using System.Windows.Threading;
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
        private readonly ITransactionRepository _transactionRepository;
        private readonly DispatcherTimer _countdownTimer;

        [ObservableProperty]
        private ObservableCollection<Unit> _units;

        [ObservableProperty]
        private decimal _totalRevenue;

        [ObservableProperty]
        private string _statusMessage;

        [ObservableProperty]
        private int _selectedUnitId = 1;

        public MainViewModel()
        {
            Units = new ObservableCollection<Unit>();
            StatusMessage = "System Ready - Waiting for Hardware...";

            try
            {
                _hardwareService = new SerialPortService();
                _hardwareService.CoinInserted += OnCoinInserted;
            }
            catch (Exception ex)
            {
                StatusMessage = $"Hardware init failed: {ex.Message}";
                _hardwareService = new SerialPortService();
            }

            _transactionRepository = new SqliteTransactionRepository();

            InitializeUnits();
            LoadRevenueFromStorage();

            _countdownTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(1)
            };
            _countdownTimer.Tick += OnCountdownTick;
            _countdownTimer.Start();
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
                    TotalRevenue = 0,
                    IsSelected = (i == 1)
                });
            }
        }

        private void LoadRevenueFromStorage()
        {
            try
            {
                TotalRevenue = _transactionRepository.GetTotalRevenue();
                foreach (var unit in Units)
                {
                    unit.TotalRevenue = _transactionRepository.GetUnitRevenue(unit.Id);
                }
            }
            catch (Exception ex)
            {
                StatusMessage = $"Failed to load revenue: {ex.Message}";
            }
        }

        private void OnCoinInserted(object? sender, CoinInsertEventArgs e)
        {
            ApplyCoin(e.UnitId, e.Amount);
        }

        private void ApplyCoin(int unitId, decimal amount)
        {
            // Update UI/Logic on UI Thread
            System.Windows.Application.Current.Dispatcher.Invoke(() =>
            {
                var unit = Units.FirstOrDefault(u => u.Id == unitId);
                if (unit == null)
                {
                    return;
                }

                try
                {
                    _transactionRepository.AddTransaction(new Transaction
                    {
                        UnitId = unitId,
                        Amount = amount,
                        Timestamp = DateTime.UtcNow
                    });
                }
                catch (Exception ex)
                {
                    StatusMessage = $"Failed to save transaction: {ex.Message}";
                }

                unit.TotalRevenue += amount;
                unit.RemainingSeconds += (int)(amount * 60); // 1 Peso = 1 Minute example
                unit.Status = "Active";
                TotalRevenue += amount;
            });
        }

        private void OnCountdownTick(object? sender, EventArgs e)
        {
            foreach (var unit in Units)
            {
                if (unit.RemainingSeconds <= 0)
                {
                    if (unit.Status == "Active")
                    {
                        unit.Status = "Idle";
                    }
                    continue;
                }

                unit.RemainingSeconds -= 1;
                if (unit.RemainingSeconds == 0)
                {
                    unit.Status = "Idle";
                }
            }
        }

        [RelayCommand]
        public async Task ConnectHardware()
        {
            StatusMessage = "Connecting...";
            await _hardwareService.ConnectAsync("COM3"); // Example Port
            StatusMessage = "Connected to COM3";
            
            // Send initial selected PC to hardware
            _hardwareService.SelectUnit(SelectedUnitId);
        }

        partial void OnSelectedUnitIdChanged(int value)
        {
            _hardwareService.SelectUnit(value);
            StatusMessage = $"Selected PC {value} for coin acceptor";
        }

        [RelayCommand]
        private void SelectUnit(int unitId)
        {
            // Update all units IsSelected property
            foreach (var unit in Units)
            {
                unit.IsSelected = (unit.Id == unitId);
            }
            SelectedUnitId = unitId;

            // Open coin acceptor dialog
            var selectedUnit = Units.FirstOrDefault(u => u.Id == unitId);
            if (selectedUnit != null)
            {
                var dialog = new Views.CoinAcceptorDialog(selectedUnit.Id, selectedUnit.Name);
                var result = dialog.ShowDialog();
                
                if (result == true)
                {
                    // User inserted a coin
                    ApplyCoin(selectedUnit.Id, dialog.InsertedAmount);
                    StatusMessage = $"Inserted ₱{dialog.InsertedAmount} to {selectedUnit.Name}";
                }
            }
        }

        [RelayCommand]
        private void TurnOn(Unit? unit)
        {
            if (unit == null)
            {
                return;
            }

            _hardwareService.TurnOn(unit.Id);
            unit.Status = "Active";
            StatusMessage = $"Turned on {unit.Name}";
        }

        [RelayCommand]
        private void TurnOff(Unit? unit)
        {
            if (unit == null)
            {
                return;
            }

            _hardwareService.TurnOff(unit.Id);
            unit.Status = "Idle";
            StatusMessage = $"Turned off {unit.Name}";
        }

        [RelayCommand]
        private void Shutdown(Unit? unit)
        {
            if (unit == null)
            {
                return;
            }

            _hardwareService.ShutdownPC(unit.Id);
            unit.Status = "Shutting down";
            StatusMessage = $"Shutdown command sent to {unit.Name}";
        }

        [RelayCommand]
        private void AddTestCoin()
        {
            ApplyCoin(SelectedUnitId, 1m);
            StatusMessage = $"Test coin added to PC {SelectedUnitId}";
        }
    }
}
