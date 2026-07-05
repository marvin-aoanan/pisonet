#!/usr/bin/env powershell
# Installs PisoNet into the current user's Windows Startup folder.

$scriptPath = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'PisoNet AutoStart.lnk'
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$scriptPath\startup.ps1`""
$shortcut.WorkingDirectory = $scriptPath
$shortcut.Description = 'Launch PisoNet backend and frontend at logon'
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,1"
$shortcut.Save()

Write-Host "Created startup shortcut at: $shortcutPath" -ForegroundColor Green
Write-Host "PisoNet will now start automatically when this user logs in." -ForegroundColor Cyan