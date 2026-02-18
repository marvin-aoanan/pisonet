using System.Windows;

namespace PisoNet.UI.Views
{
    public partial class CoinAcceptorDialog : Window
    {
        public int SelectedPcId { get; set; }
        public string SelectedPcName { get; set; }
        public decimal InsertedAmount { get; private set; }

        public CoinAcceptorDialog(int pcId, string pcName)
        {
            InitializeComponent();
            SelectedPcId = pcId;
            SelectedPcName = pcName;
            DataContext = this;
        }

        private void InsertCoin1_Click(object sender, RoutedEventArgs e)
        {
            InsertedAmount = 1m;
            DialogResult = true;
            Close();
        }

        private void InsertCoin5_Click(object sender, RoutedEventArgs e)
        {
            InsertedAmount = 5m;
            DialogResult = true;
            Close();
        }

        private void InsertCoin10_Click(object sender, RoutedEventArgs e)
        {
            InsertedAmount = 10m;
            DialogResult = true;
            Close();
        }

        private void Close_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }
    }
}
