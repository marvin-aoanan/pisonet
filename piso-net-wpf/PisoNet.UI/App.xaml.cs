using System.Windows;
using PisoNet.UI.Views;
using PisoNet.UI.ViewModels;

namespace PisoNet.UI
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            MainWindow = new MainWindow();
            MainWindow.Show();
        }
    }
}
