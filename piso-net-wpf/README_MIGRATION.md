# PisoNet System - .NET / WPF Migration Guide

This project is a complete rewrite of the PisoNet management system using **C# and WPF (Windows Presentation Foundation)**.

## ⚠️ Important Requirement
**This project requires a Windows PC to build and run.**
WPF is a native Windows technology. You cannot run `dotnet run` on macOS or Linux for this specific project.

## Project Structure
The solution is architected for stability and testability (MVVM Pattern):

1. **PisoNet.Core** (.NET Standard 2.0)
   - Contains all business logic and data models.
   - Pure C# code, no UI dependencies.

2. **PisoNet.Infrastructure** (.NET 8.0)
   - Handles hardware communication (Serial Port).
   - Handles database storage (SQLite).
   - Handles file system operations.

3. **PisoNet.UI** (.NET 8.0 - Windows)
   - The main WPF application.
   - Contains Views (XAML windows) and ViewModels.
   - Handles user interaction.

## How to Run (on Windows)

1. **Install .NET 8.0 SDK**
   Download from: https://dotnet.microsoft.com/download/dotnet/8.0

2. **Open in Visual Studio 2022**
   - Open `PisoNet.sln`
   - Right-click `PisoNet.UI` project -> "Set as Startup Project"
   - Press F5 to run

3. **Dependencies**
   The project uses these NuGet packages (restore them first):
   - `CommunityToolkit.Mvvm` (for ViewModels)
   - `System.IO.Ports` (for USB Relay/Coin Slot)
   - `Microsoft.Data.Sqlite` (for robust database)

## Hardware Support
The system is designed to use `System.IO.Ports.SerialPort`, which is the native, reliable way to communicate with COM ports on Windows. It avoids the stability issues of Node.js serialport bindings.
