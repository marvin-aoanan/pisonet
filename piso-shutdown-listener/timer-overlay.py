#!/usr/bin/env python3
"""
PisoNet Client Timer Overlay
A lightweight always-on-top timer display for client PCs
"""

import tkinter as tk
from tkinter import font as tkfont
import json
import threading
import time
import argparse
import sys

try:
    import websocket
except ImportError:
    print("Error: websocket-client not installed")
    print("Install with: pip install websocket-client")
    sys.exit(1)


class TimerOverlay:
    def __init__(self, unit_id, server_host, ws_port=8081):
        self.unit_id = unit_id
        self.server_host = server_host
        self.ws_port = ws_port
        self.remaining_seconds = 0
        self.connected = False
        self.ws = None
        
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
        
        # Make window draggable
        self.root.bind('<Button-1>', self.start_drag)
        self.root.bind('<B1-Motion>', self.on_drag)
        
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
        
        # Connection indicator (small dot)
        self.connection_indicator = tk.Label(
            self.root,
            text="●",
            font=tkfont.Font(size=8),
            fg='#ff0000',
            bg=self.bg_normal
        )
        self.connection_indicator.place(x=10, y=10)
        
        # Close button (small X in corner)
        close_btn = tk.Label(
            self.root,
            text="✕",
            font=tkfont.Font(size=12),
            fg='#666666',
            bg=self.bg_normal,
            cursor='hand2'
        )
        close_btn.place(x=260, y=5)
        close_btn.bind('<Button-1>', lambda e: self.root.quit())
        
    def start_drag(self, event):
        self.drag_x = event.x
        self.drag_y = event.y
        
    def on_drag(self, event):
        x = self.root.winfo_x() + (event.x - self.drag_x)
        y = self.root.winfo_y() + (event.y - self.drag_y)
        self.root.geometry(f"+{x}+{y}")
        
    def format_time(self, seconds):
        if seconds < 0:
            seconds = 0
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes:02d}:{secs:02d}"
    
    def update_display(self):
        """Update the timer display (called from main thread)"""
        self.timer_label.config(text=self.format_time(self.remaining_seconds))
        
        # Update colors and status based on remaining time
        if self.remaining_seconds <= 0:
            self.root.configure(bg=self.bg_critical)
            self.pc_label.configure(bg=self.bg_critical)
            self.timer_label.configure(fg=self.fg_critical, bg=self.bg_critical)
            self.status_label.configure(text="TIME EXPIRED", fg=self.fg_critical, bg=self.bg_critical)
            self.connection_indicator.configure(bg=self.bg_critical)
        elif self.remaining_seconds <= 10:
            self.root.configure(bg=self.bg_critical)
            self.pc_label.configure(bg=self.bg_critical)
            self.timer_label.configure(fg=self.fg_critical, bg=self.bg_critical)
            self.status_label.configure(text="⚠️ SAVE YOUR WORK!", fg=self.fg_critical, bg=self.bg_critical)
            self.connection_indicator.configure(bg=self.bg_critical)
        elif self.remaining_seconds <= 60:
            self.root.configure(bg=self.bg_warning)
            self.pc_label.configure(bg=self.bg_warning)
            self.timer_label.configure(fg=self.fg_warning, bg=self.bg_warning)
            self.status_label.configure(text="⚠️ Low Time", fg=self.fg_warning, bg=self.bg_warning)
            self.connection_indicator.configure(bg=self.bg_warning)
        else:
            self.root.configure(bg=self.bg_normal)
            self.pc_label.configure(bg=self.bg_normal)
            self.timer_label.configure(fg=self.fg_normal, bg=self.bg_normal)
            self.status_label.configure(text="Active Session", fg='#00ff00', bg=self.bg_normal)
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
                # Schedule UI update in main thread
                self.root.after(0, self.update_display)
    
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
    
    def on_ws_open(self, ws):
        print("Connected to sync server")
        self.connected = True
        self.root.after(0, self.update_display)
    
    def on_ws_message(self, ws, message):
        try:
            data = json.loads(message)
            
            if data['type'] == 'initial_state':
                # Load initial state
                for unit in data['data']:
                    if unit['unit_id'] == self.unit_id:
                        self.remaining_seconds = unit['remaining_seconds']
                        self.root.after(0, self.update_display)
                        break
                        
            elif data['type'] == 'timer_update':
                # Update from server
                if data['data']['unit_id'] == self.unit_id:
                    self.remaining_seconds = data['data']['remaining_seconds']
                    self.root.after(0, self.update_display)
                    
            elif data['type'] == 'coin_insert':
                # Coin inserted
                if data['data']['unit_id'] == self.unit_id:
                    coin_value = data['data']['coin_value']
                    self.remaining_seconds += coin_value * 60
                    self.root.after(0, self.update_display)
                    print(f"+{coin_value} minute(s) added")
                    
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
    parser.add_argument('--server', type=str, required=True, help='Management PC IP address')
    parser.add_argument('--wsport', type=int, default=8081, help='WebSocket port (default: 8081)')
    
    args = parser.parse_args()
    
    if args.unit < 1 or args.unit > 10:
        print("Error: Unit number must be between 1 and 10")
        sys.exit(1)
    
    print(f"Starting timer overlay for PC {args.unit}")
    print(f"Server: {args.server}:{args.wsport}")
    print("Press Ctrl+C to exit or click the X button")
    
    overlay = TimerOverlay(args.unit, args.server, args.wsport)
    
    try:
        overlay.run()
    except KeyboardInterrupt:
        print("\nShutting down...")
        sys.exit(0)


if __name__ == '__main__':
    main()
