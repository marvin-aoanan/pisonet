#!/usr/bin/env python3
"""
PisoNet Client Timer Overlay
A lightweight always-on-top timer display for client PCs
"""

import tkinter as tk
from tkinter import font as tkfont, messagebox, simpledialog
import json
import threading
import time
import argparse
import sys
import subprocess
import os
import urllib.request
import urllib.error

try:
    import websocket
except ImportError:
    print("Error: websocket-client not installed")
    print("Install with: pip install websocket-client")
    sys.exit(1)


class TimerOverlay:
    def __init__(self, unit_id, server_host, ws_port=8081, shutdown_grace_seconds=60, api_port=None, os_lock=False, unlock_password=None):
        self.unit_id = unit_id
        self.server_host = server_host
        self.ws_port = ws_port
        self.api_port = api_port if api_port is not None else ws_port
        self.remaining_seconds = 0
        self.shutdown_grace_seconds = shutdown_grace_seconds
        self.warning_seconds_left = shutdown_grace_seconds
        self.connected = False
        self.ws = None
        self.os_lock = os_lock
        self.unlock_password = unlock_password
        self.warning_active = False
        self.lock_triggered = False
        self.shutdown_triggered = False
        self.is_lockdown_ui = False
        self.admin_unlocked = False
        
        # Create main window
        self.root = tk.Tk()
        self.root.title(f"PC {unit_id} Timer")
        
        # Window configuration
        self.root.attributes('-topmost', True)  # Always on top
        self.root.overrideredirect(True)  # Remove window decorations
        
        # Set window size and position (top-right corner)
        window_width = 280
        window_height = 160
        screen_width = self.root.winfo_screenwidth()
        x_position = screen_width - window_width - 20
        y_position = 20
        
        self.root.geometry(f"{window_width}x{window_height}+{x_position}+{y_position}")
        self.default_geometry = f"{window_width}x{window_height}+{x_position}+{y_position}"
        
        # Make window draggable
        self.root.bind('<Button-1>', self.start_drag)
        self.root.bind('<B1-Motion>', self.on_drag)
        self.root.bind('<Map>', self.on_window_restore)

        # Prevent close shortcuts / close button behavior
        self.root.protocol('WM_DELETE_WINDOW', self.on_close_attempt)
        self.root.bind('<Alt-F4>', self.on_close_attempt)
        self.root.bind('<Control-w>', self.on_close_attempt)
        self.root.bind('<Control-q>', self.handle_unlock_shortcut)
        self.root.bind('<Command-w>', self.on_close_attempt)
        self.root.bind('<Command-q>', self.on_close_attempt)
        
        # Configure colors
        self.bg_normal = '#1a1a2e'
        self.bg_warning = '#3d2200'
        self.bg_critical = '#3d0000'
        self.fg_normal = '#00ff00'
        self.fg_warning = '#ff8800'
        self.fg_critical = '#ff0000'
        
        self.root.configure(bg=self.bg_normal)
        
        # Create UI elements
        self.setup_ui()
        
        # Start WebSocket connection in separate thread
        self.ws_thread = threading.Thread(target=self.connect_websocket, daemon=True)
        self.ws_thread.start()
        
        # Start local countdown
        self.countdown_thread = threading.Thread(target=self.local_countdown, daemon=True)
        self.countdown_thread.start()
        
    def setup_ui(self):
        # PC number label
        pc_label_font = tkfont.Font(family='Arial', size=14, weight='bold')
        self.pc_label = tk.Label(
            self.root,
            text=f"PC {self.unit_id}",
            font=pc_label_font,
            fg='#4CAF50',
            bg=self.bg_normal
        )
        self.pc_label.pack(pady=(10, 5))
        
        # Timer display
        timer_font = tkfont.Font(family='Courier New', size=42, weight='bold')
        self.timer_label = tk.Label(
            self.root,
            text="--:--",
            font=timer_font,
            fg=self.fg_normal,
            bg=self.bg_normal
        )
        self.timer_label.pack(pady=5)
        
        # Status label
        status_font = tkfont.Font(family='Arial', size=10)
        self.status_label = tk.Label(
            self.root,
            text="Connecting...",
            font=status_font,
            fg='#888888',
            bg=self.bg_normal
        )
        self.status_label.pack(pady=5)

        # Warning label for shutdown countdown
        warning_font = tkfont.Font(family='Arial', size=10, weight='bold')
        self.warning_label = tk.Label(
            self.root,
            text="",
            font=warning_font,
            fg='#ffcc00',
            bg=self.bg_normal,
            wraplength=240,
            justify='center'
        )
        self.warning_label.pack(pady=(0, 5))
        
        # Connection indicator (small dot)
        self.connection_indicator = tk.Label(
            self.root,
            text="●",
            font=tkfont.Font(size=8),
            fg='#ff0000',
            bg=self.bg_normal
        )
        self.connection_indicator.place(x=10, y=10)
        
        # Minimize button
        self.minimize_btn = tk.Label(
            self.root,
            text="—",
            font=tkfont.Font(size=12),
            fg='#666666',
            bg=self.bg_normal,
            cursor='hand2'
        )
        self.minimize_btn.place(x=260, y=5)
        self.minimize_btn.bind('<Button-1>', self.minimize_window)
        
    def start_drag(self, event):
        if self.warning_active:
            return
        self.drag_x = event.x
        self.drag_y = event.y
        
    def on_drag(self, event):
        if self.warning_active:
            return
        x = self.root.winfo_x() + (event.x - self.drag_x)
        y = self.root.winfo_y() + (event.y - self.drag_y)
        self.root.geometry(f"+{x}+{y}")

    def on_close_attempt(self, event=None):
        if self.warning_active:
            return "break"

        self.minimize_window()
        return "break"

    def minimize_window(self, event=None):
        if self.warning_active:
            return "break"

        self.root.overrideredirect(False)
        self.root.iconify()
        return "break"

    def on_window_restore(self, event=None):
        if self.warning_active:
            self.enter_lockdown_ui()
            return

        self.root.overrideredirect(True)
        self.root.attributes('-topmost', True)

    def enter_lockdown_ui(self):
        self.is_lockdown_ui = True
        self.root.deiconify()
        self.root.overrideredirect(True)
        self.root.attributes('-topmost', True)
        try:
            self.root.state('zoomed')
        except tk.TclError:
            pass
        self.root.attributes('-fullscreen', True)
        self.root.geometry(f"{self.root.winfo_screenwidth()}x{self.root.winfo_screenheight()}+0+0")
        self.root.lift()
        self.root.focus_force()
        self.minimize_btn.place_forget()

    def exit_lockdown_ui(self):
        if not self.is_lockdown_ui:
            return

        self.is_lockdown_ui = False
        self.root.attributes('-fullscreen', False)
        try:
            self.root.state('normal')
        except tk.TclError:
            pass
        self.root.overrideredirect(True)
        self.root.attributes('-topmost', True)
        self.root.geometry(self.default_geometry)
        self.minimize_btn.place(x=260, y=5)

    def enforce_lockdown_ui(self):
        if not self.warning_active:
            return

        # Keep enforcing fullscreen/always-on-top in case OS or user attempts to minimize.
        self.enter_lockdown_ui()
        self.root.after(500, self.enforce_lockdown_ui)

    def handle_unlock_shortcut(self, event=None):
        if not self.warning_active:
            return "break"

        self.prompt_unlock_password()
        return "break"

    def prompt_unlock_password(self):
        if not self.unlock_password:
            messagebox.showerror(
                "Unlock unavailable",
                "No unlock password is configured. Set --unlock-password or PISONET_UNLOCK_PASSWORD."
            )
            self.enter_lockdown_ui()
            return

        try:
            self.root.attributes('-topmost', False)
            password = simpledialog.askstring(
                "Admin Unlock",
                "Enter unlock password:",
                parent=self.root,
                show='*'
            )
        finally:
            self.root.attributes('-topmost', True)

        if password is None:
            self.enter_lockdown_ui()
            return

        if password == self.unlock_password:
            self.perform_admin_unlock()
            return

        messagebox.showerror("Access denied", "Incorrect unlock password.")
        self.enter_lockdown_ui()

    def perform_admin_unlock(self):
        self.admin_unlocked = True
        self.reset_expired_state()
        self.root.after(0, self.update_display)
        
    def format_time(self, seconds):
        if seconds < 0:
            seconds = 0
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes:02d}:{secs:02d}"

    def run_command(self, command):
        try:
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception as error:
            print(f"Command failed ({' '.join(command)}): {error}")
            return False

    def lock_screen(self):
        if self.lock_triggered:
            return

        self.lock_triggered = True
        if not self.os_lock:
            print("Timer expired. Soft lock mode: fullscreen overlay only.")
            return

        current_platform = sys.platform
        print("Timer expired. Locking screen...")

        try:
            if current_platform == 'win32':
                import ctypes
                ctypes.windll.user32.LockWorkStation()
            elif current_platform == 'darwin':
                self.run_command([
                    'osascript',
                    '-e',
                    'tell application "System Events" to start current screen saver'
                ])
            else:
                if not self.run_command(['loginctl', 'lock-session']):
                    self.run_command(['xdg-screensaver', 'lock'])
        except Exception as error:
            print(f"Failed to lock screen: {error}")

    def schedule_shutdown(self):
        if self.shutdown_triggered:
            return

        self.shutdown_triggered = True
        current_platform = sys.platform
        print(f"Scheduling shutdown in {self.shutdown_grace_seconds} seconds...")

        try:
            if current_platform == 'win32':
                self.run_command([
                    'shutdown', '/s', '/f', '/t', str(self.shutdown_grace_seconds),
                    '/c', f'PisoNet time expired. PC will shut down in {self.shutdown_grace_seconds} seconds.'
                ])
            elif current_platform == 'darwin':
                minutes = max(1, self.shutdown_grace_seconds // 60)
                self.run_command(['sudo', 'shutdown', '-h', f'+{minutes}'])
            else:
                minutes = max(1, self.shutdown_grace_seconds // 60)
                self.run_command(['shutdown', '-h', f'+{minutes}'])
        except Exception as error:
            print(f"Failed to schedule shutdown: {error}")

    def cancel_shutdown(self):
        if not self.shutdown_triggered:
            return

        current_platform = sys.platform
        print("New time received. Cancelling pending shutdown...")

        try:
            if current_platform == 'win32':
                self.run_command(['shutdown', '/a'])
            elif current_platform in ('darwin', 'linux'):
                self.run_command(['sudo', 'shutdown', '-c'])
        except Exception as error:
            print(f"Failed to cancel shutdown: {error}")
        finally:
            self.shutdown_triggered = False

    def begin_shutdown_warning(self):
        if self.warning_active:
            return

        self.warning_active = True
        self.warning_seconds_left = self.shutdown_grace_seconds
        self.enter_lockdown_ui()
        self.lock_screen()
        self.schedule_shutdown()
        self.enforce_lockdown_ui()
        self.root.after(0, self.update_display)

    def reset_expired_state(self):
        if self.warning_active:
            self.cancel_shutdown()

        self.warning_active = False
        self.warning_seconds_left = self.shutdown_grace_seconds
        self.lock_triggered = False
        self.shutdown_triggered = False
        self.exit_lockdown_ui()
    
    def update_display(self):
        """Update the timer display (called from main thread)"""
        if self.warning_active:
            self.timer_label.config(text=self.format_time(self.warning_seconds_left))
        else:
            self.timer_label.config(text=self.format_time(self.remaining_seconds))
        
        # Update colors and status based on remaining time
        if self.warning_active:
            self.enter_lockdown_ui()
            self.root.configure(bg=self.bg_critical)
            self.pc_label.configure(bg=self.bg_critical)
            self.timer_label.configure(fg=self.fg_critical, bg=self.bg_critical)
            self.status_label.configure(text="SESSION LOCKED", fg=self.fg_critical, bg=self.bg_critical)
            self.warning_label.configure(
                text=f"Your time is up! Please insert coin to unlock this PC or it will Shutdown in {self.warning_seconds_left}s.",
                fg='#ffcc00',
                bg=self.bg_critical,
                wraplength=max(400, int(self.root.winfo_screenwidth() * 0.8))
            )
            self.connection_indicator.configure(bg=self.bg_critical)
        elif self.admin_unlocked and self.remaining_seconds <= 0:
            self.exit_lockdown_ui()
            self.root.configure(bg=self.bg_warning)
            self.pc_label.configure(bg=self.bg_warning)
            self.timer_label.configure(fg=self.fg_warning, bg=self.bg_warning)
            self.status_label.configure(text="ADMIN UNLOCK", fg='#ffffff', bg=self.bg_warning)
            self.warning_label.configure(text="Admin override active. Press minimize if needed, or add time to resume normal session.", fg='#ffcc00', bg=self.bg_warning)
            self.connection_indicator.configure(bg=self.bg_warning)
        elif self.remaining_seconds <= 0:
            self.exit_lockdown_ui()
            self.root.configure(bg=self.bg_critical)
            self.pc_label.configure(bg=self.bg_critical)
            self.timer_label.configure(fg=self.fg_critical, bg=self.bg_critical)
            self.status_label.configure(text="TIME EXPIRED", fg=self.fg_critical, bg=self.bg_critical)
            self.warning_label.configure(text="Locking screen...", fg='#ffcc00', bg=self.bg_critical)
            self.connection_indicator.configure(bg=self.bg_critical)
        elif self.remaining_seconds <= 10:
            self.exit_lockdown_ui()
            self.root.configure(bg=self.bg_critical)
            self.pc_label.configure(bg=self.bg_critical)
            self.timer_label.configure(fg=self.fg_critical, bg=self.bg_critical)
            self.status_label.configure(text="⚠️ SAVE YOUR WORK!", fg=self.fg_critical, bg=self.bg_critical)
            self.warning_label.configure(text="Add time now to avoid lock and shutdown", fg='#ffcc00', bg=self.bg_critical)
            self.connection_indicator.configure(bg=self.bg_critical)
        elif self.remaining_seconds <= 60:
            self.exit_lockdown_ui()
            self.root.configure(bg=self.bg_warning)
            self.pc_label.configure(bg=self.bg_warning)
            self.timer_label.configure(fg=self.fg_warning, bg=self.bg_warning)
            self.status_label.configure(text="⚠️ Low Time", fg=self.fg_warning, bg=self.bg_warning)
            self.warning_label.configure(text="Time is almost up", fg='#ffcc00', bg=self.bg_warning)
            self.connection_indicator.configure(bg=self.bg_warning)
        else:
            self.exit_lockdown_ui()
            self.root.configure(bg=self.bg_normal)
            self.pc_label.configure(bg=self.bg_normal)
            self.timer_label.configure(fg=self.fg_normal, bg=self.bg_normal)
            self.status_label.configure(text="Active Session", fg='#00ff00', bg=self.bg_normal)
            self.warning_label.configure(text="", fg='#ffcc00', bg=self.bg_normal)
            self.connection_indicator.configure(bg=self.bg_normal)
            
        # Update connection indicator
        if self.connected:
            self.connection_indicator.config(fg='#00ff00')
        else:
            self.connection_indicator.config(fg='#ff0000')
    
    def local_countdown(self):
        """Local countdown timer (runs in background thread)"""
        while True:
            time.sleep(1)
            if self.remaining_seconds > 0:
                self.remaining_seconds -= 1
                if self.admin_unlocked:
                    self.admin_unlocked = False
                # Schedule UI update in main thread
                self.root.after(0, self.update_display)
            elif self.warning_active and self.warning_seconds_left > 0:
                self.warning_seconds_left -= 1
                self.root.after(0, self.update_display)
            elif self.remaining_seconds <= 0 and not self.warning_active and not self.admin_unlocked:
                self.begin_shutdown_warning()
    
    def connect_websocket(self):
        """Connect to WebSocket server (runs in background thread)"""
        ws_url = f"ws://{self.server_host}:{self.ws_port}"
        
        while True:
            try:
                print(f"Connecting to {ws_url}...")
                self.ws = websocket.WebSocketApp(
                    ws_url,
                    on_open=self.on_ws_open,
                    on_message=self.on_ws_message,
                    on_error=self.on_ws_error,
                    on_close=self.on_ws_close
                )
                self.ws.run_forever()
            except Exception as e:
                print(f"Connection error: {e}")
            
            # Reconnect after 3 seconds
            print("Reconnecting in 3 seconds...")
            time.sleep(3)

    def load_initial_state(self):
        """Load initial unit state from API endpoint."""
        api_url = f"http://{self.server_host}:{self.api_port}/api/units"
        try:
            with urllib.request.urlopen(api_url, timeout=3) as response:
                payload = json.loads(response.read().decode('utf-8'))

            for unit in payload:
                if int(unit.get('id', 0)) == self.unit_id:
                    self.remaining_seconds = int(unit.get('remaining_seconds', 0) or 0)
                    if self.remaining_seconds > 0:
                        self.reset_expired_state()
                    self.root.after(0, self.update_display)
                    return
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TypeError) as error:
            print(f"Initial state fetch failed: {error}")
    
    def on_ws_open(self, ws):
        print("Connected to sync server")
        self.connected = True
        self.load_initial_state()
        self.root.after(0, self.update_display)
    
    def on_ws_message(self, ws, message):
        try:
            data = json.loads(message)
            
            if data['type'] == 'initial_state':
                # Load initial state
                for unit in data['data']:
                    if unit['unit_id'] == self.unit_id:
                        self.remaining_seconds = unit['remaining_seconds']
                        if self.remaining_seconds > 0:
                            self.admin_unlocked = False
                        self.root.after(0, self.update_display)
                        break
                        
            elif data['type'] == 'timer_update':
                # Update from server
                if data['data']['unit_id'] == self.unit_id:
                    self.remaining_seconds = data['data']['remaining_seconds']
                    if self.remaining_seconds > 0:
                        self.admin_unlocked = False
                        self.reset_expired_state()
                    self.root.after(0, self.update_display)
                    
            elif data['type'] == 'coin_insert':
                # Coin inserted
                if data['data']['unit_id'] == self.unit_id:
                    coin_value = data['data']['coin_value']
                    self.remaining_seconds += coin_value * 60
                    if self.remaining_seconds > 0:
                        self.admin_unlocked = False
                        self.reset_expired_state()
                    self.root.after(0, self.update_display)
                    print(f"+{coin_value} minute(s) added")

            elif data.get('type') == 'UNIT_UPDATE':
                unit = data.get('unit', {})
                if int(unit.get('id', 0)) == self.unit_id:
                    self.remaining_seconds = int(unit.get('remaining_seconds', 0) or 0)
                    if self.remaining_seconds > 0:
                        self.admin_unlocked = False
                        self.reset_expired_state()
                    self.root.after(0, self.update_display)

            elif data.get('type') == 'COIN_INSERTED':
                unit = data.get('unit', {})
                if int(unit.get('id', 0)) == self.unit_id:
                    self.remaining_seconds = int(unit.get('remaining_seconds', 0) or 0)
                    if self.remaining_seconds > 0:
                        self.admin_unlocked = False
                        self.reset_expired_state()
                    self.root.after(0, self.update_display)
                    
        except Exception as e:
            print(f"Error processing message: {e}")
    
    def on_ws_error(self, ws, error):
        print(f"WebSocket error: {error}")
        self.connected = False
        self.root.after(0, self.update_display)
    
    def on_ws_close(self, ws, close_status_code, close_msg):
        print("Disconnected from sync server")
        self.connected = False
        self.root.after(0, self.update_display)
    
    def run(self):
        """Start the application"""
        self.root.mainloop()


def main():
    parser = argparse.ArgumentParser(description='PisoNet Client Timer Overlay')
    parser.add_argument('--unit', type=int, required=True, help='PC unit number (1-10)')
    parser.add_argument('--server', type=str, required=True, help='Management PC host or IP (no protocol)')
    parser.add_argument('--wsport', type=int, default=8081, help='WebSocket port (default: 8081)')
    parser.add_argument('--grace', type=int, default=60, help='Shutdown warning time in seconds after timer hits zero (default: 60)')
    parser.add_argument('--apiport', type=int, default=None, help='API port for initial state fetch (default: same as --wsport)')
    parser.add_argument('--oslock', action='store_true', help='Also lock the operating system at zero time (may hide overlay behind OS lock screen)')
    parser.add_argument('--unlock-password', type=str, default=os.environ.get('PISONET_UNLOCK_PASSWORD'), help='Password required for Ctrl+Q admin unlock (default: PISONET_UNLOCK_PASSWORD env var)')
    
    args = parser.parse_args()
    
    if args.unit < 1 or args.unit > 10:
        print("Error: Unit number must be between 1 and 10")
        sys.exit(1)
    
    print(f"Starting timer overlay for PC {args.unit}")
    print(f"Server: {args.server}:{args.wsport}")
    print("Overlay started (minimize allowed only while time is active)")
    if args.unlock_password:
        print("Ctrl+Q admin unlock is enabled")
    else:
        print("Ctrl+Q admin unlock is disabled until an unlock password is configured")
    
    overlay = TimerOverlay(args.unit, args.server, args.wsport, args.grace, args.apiport, args.oslock, args.unlock_password)
    
    try:
        overlay.run()
    except KeyboardInterrupt:
        print("\nShutting down...")
        sys.exit(0)


if __name__ == '__main__':
    main()
