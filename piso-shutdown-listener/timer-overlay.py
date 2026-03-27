#!/usr/bin/env python3
"""
PisoNet Client Timer Overlay
A lightweight always-on-top timer display for client PCs
"""

import tkinter as tk
from tkinter import font as tkfont, messagebox
import json
import threading
import time
import argparse
import sys
import subprocess
import os
import urllib.request
import urllib.error

if sys.platform == 'win32':
    import ctypes
    from ctypes import wintypes

try:
    import websocket
except ImportError:
    print("Error: websocket-client not installed")
    print("Install with: pip install websocket-client")
    sys.exit(1)


class TimerOverlay:
    def __init__(self, unit_id, server_host, ws_port=5001, shutdown_grace_seconds=60, api_port=None, os_lock=False, unlock_password=None, background_image_path=None):
        self.unit_id = unit_id
        self.server_host = server_host
        self.ws_port = ws_port
        self.api_port = api_port if api_port is not None else ws_port
        self.remaining_seconds = 0
        self.shutdown_grace_seconds = shutdown_grace_seconds
        self.warning_seconds_left = shutdown_grace_seconds
        self.warning_threshold_seconds = 120
        self.critical_threshold_seconds = 60
        self.connected = False
        self.ws = None
        self.os_lock = os_lock
        self.unlock_password = unlock_password
        self.warning_active = False
        self.warning_transition_scheduled = False
        self.lock_triggered = False
        self.shutdown_triggered = False
        self.is_lockdown_ui = False
        self.admin_unlocked = False
        self.is_minimized = False
        self.is_fullscreen = False
        self.pre_fullscreen_geometry = None
        self.flash_job = None
        self.flash_state = False
        self.base_alpha = 0.90
        self.minimize_btn_visible = True
        self.password_prompt_active = False
        self.lock_layout_active = False
        self.background_image_path = background_image_path
        self.background_image = None
        self.background_label = None
        self.background_source_image = None
        self.background_use_pillow = False
        self.background_refresh_job = None
        self.key_block_active = False
        self.key_hook_handle = None
        self.key_hook_proc = None
        
        # Create main window
        self.root = tk.Tk()
        self.root.title(f"PC {unit_id} Timer")
        self.is_closing = False

        # Install a global keyboard hook on Windows. The hook only blocks keys
        # while key_block_active is True (during lock mode).
        self.install_windows_key_hook()
        
        # Window configuration
        self.root.attributes('-topmost', True)  # Always on top
        self.root.overrideredirect(True)  # Remove title bar and borders (headless overlay)
        
        # Set window size and position (top-right corner)
        window_width = 252
        window_height = 136
        self.default_window_width = window_width
        self.default_window_height = window_height
        self.low_time_window_width = window_width
        self.low_time_window_height = window_height
        screen_width = self.root.winfo_screenwidth()
        x_position = screen_width - window_width - 20
        y_position = 20
        
        self.root.geometry(f"{window_width}x{window_height}+{x_position}+{y_position}")
        self.default_geometry = f"{window_width}x{window_height}+{x_position}+{y_position}"
        self.warning_window_width = window_width
        self.warning_window_height = window_height
        self.pre_fullscreen_geometry = self.default_geometry
        self.last_geometry = self.default_geometry
        self.minimized_geometry = self.default_geometry
        
        # Make window draggable
        self.root.bind('<Button-1>', self.start_drag)
        self.root.bind('<B1-Motion>', self.on_drag)
        self.root.bind('<Map>', self.on_window_restore)
        self.root.bind('<Configure>', self.on_window_configure)

        # Allow normal close behavior while debugging
        self.root.protocol('WM_DELETE_WINDOW', self.close_window)
        self.root.bind('<Alt-F4>', self.handle_close_shortcut)
        self.root.bind('<Control-w>', self.handle_close_shortcut)
        self.root.bind('<Control-q>', self.handle_unlock_shortcut)
        self.root.bind('<Command-w>', self.handle_close_shortcut)
        self.root.bind('<Command-q>', self.close_window)
        self.root.bind('<Escape>', self.close_window)
        
        # Configure colors
        self.bg_normal = '#021526'
        self.bg_warning = '#021526'
        self.bg_critical = '#021526'
        self.fg_normal = '#00ff00'
        self.fg_warning = '#ff8800'
        self.fg_critical = '#ff0000'
        
        self.root.configure(bg=self.bg_normal)
        self.root.attributes('-alpha', self.base_alpha)

        # Optional background image for a themed UI.
        self.setup_background_image()
        
        # Create UI elements
        self.setup_ui()
        
        # Start WebSocket connection in separate thread
        self.ws_thread = threading.Thread(target=self.connect_websocket, daemon=True)
        self.ws_thread.start()
        
        # Start local countdown
        self.countdown_thread = threading.Thread(target=self.local_countdown, daemon=True)
        self.countdown_thread.start()

    def install_windows_key_hook(self):
        if sys.platform != 'win32':
            return

        try:
            user32 = ctypes.WinDLL('user32', use_last_error=True)

            wh_keyboard_ll = 13
            wm_keydown = 0x0100
            wm_syskeydown = 0x0104

            vk_tab = 0x09
            vk_escape = 0x1B
            vk_f4 = 0x73
            vk_w = 0x57
            vk_lwin = 0x5B
            vk_rwin = 0x5C
            vk_menu = 0x12
            vk_lmenu = 0xA4
            vk_rmenu = 0xA5
            vk_control = 0x11
            vk_lcontrol = 0xA2
            vk_rcontrol = 0xA3

            ulong_ptr = getattr(wintypes, 'ULONG_PTR', ctypes.c_size_t)
            lresult_t = ctypes.c_ssize_t

            class KBDLLHOOKSTRUCT(ctypes.Structure):
                _fields_ = [
                    ('vkCode', wintypes.DWORD),
                    ('scanCode', wintypes.DWORD),
                    ('flags', wintypes.DWORD),
                    ('time', wintypes.DWORD),
                    ('dwExtraInfo', ulong_ptr),
                ]

            low_level_keyboard_proc = ctypes.WINFUNCTYPE(
                lresult_t,
                ctypes.c_int,
                wintypes.WPARAM,
                wintypes.LPARAM,
            )

            user32.SetWindowsHookExW.argtypes = [
                ctypes.c_int,
                low_level_keyboard_proc,
                wintypes.HANDLE,
                wintypes.DWORD,
            ]
            user32.SetWindowsHookExW.restype = wintypes.HANDLE
            user32.CallNextHookEx.argtypes = [
                wintypes.HANDLE,
                ctypes.c_int,
                wintypes.WPARAM,
                wintypes.LPARAM,
            ]
            user32.CallNextHookEx.restype = lresult_t
            user32.UnhookWindowsHookEx.argtypes = [wintypes.HANDLE]
            user32.UnhookWindowsHookEx.restype = wintypes.BOOL

            def is_pressed(vk_code):
                return bool(user32.GetAsyncKeyState(vk_code) & 0x8000)

            def callback(n_code, w_param, l_param):
                lock_mode_active = self.warning_active and not self.admin_unlocked
                if n_code >= 0 and lock_mode_active and w_param in (wm_keydown, wm_syskeydown):
                    kb = ctypes.cast(l_param, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                    vk_code = kb.vkCode

                    llkhf_altdown = 0x20
                    alt_down = bool(kb.flags & llkhf_altdown) or is_pressed(vk_menu) or is_pressed(vk_lmenu) or is_pressed(vk_rmenu)
                    ctrl_down = is_pressed(vk_control) or is_pressed(vk_lcontrol) or is_pressed(vk_rcontrol)

                    # Block Windows key presses.
                    if vk_code in (vk_lwin, vk_rwin):
                        return 1

                    # Block Alt+Tab, Alt+F4, and Alt+Esc.
                    if alt_down and vk_code in (vk_tab, vk_f4, vk_escape):
                        return 1

                    # Block Ctrl+W and Ctrl+Esc.
                    if ctrl_down and vk_code in (vk_w, vk_escape):
                        return 1

                return user32.CallNextHookEx(None, n_code, w_param, l_param)

            self.key_hook_proc = low_level_keyboard_proc(callback)
            self.key_hook_handle = user32.SetWindowsHookExW(
                wh_keyboard_ll,
                self.key_hook_proc,
                None,
                0,
            )

            if not self.key_hook_handle:
                error_code = ctypes.get_last_error()
                print(
                    'Warning: failed to install keyboard hook; lock hotkeys remain enabled '
                    f'(WinError={error_code}).'
                )
            else:
                print('Windows lock keyboard hook installed.')
        except Exception as error:
            self.key_hook_handle = None
            self.key_hook_proc = None
            print(f"Warning: keyboard hook unavailable: {error}")

    def uninstall_windows_key_hook(self):
        if sys.platform != 'win32':
            return

        if self.key_hook_handle is None:
            return

        try:
            ctypes.windll.user32.UnhookWindowsHookEx(self.key_hook_handle)
        except Exception as error:
            print(f"Warning: failed to remove keyboard hook: {error}")
        finally:
            self.key_hook_handle = None
            self.key_hook_proc = None

    def enable_lock_key_block(self):
        if sys.platform != 'win32':
            return
        self.key_block_active = True

    def disable_lock_key_block(self):
        if sys.platform != 'win32':
            return
        self.key_block_active = False

    def handle_close_shortcut(self, event=None):
        # During lock mode, ignore close shortcuts even if global hook is unavailable.
        if self.warning_active and not self.admin_unlocked:
            return 'break'
        return self.close_window(event)

    def pick_font_family(self, preferred_families, fallback_family):
        """Pick the first available family from preferred list, else fallback."""
        try:
            available = {name.lower(): name for name in tkfont.families(self.root)}
            for family in preferred_families:
                found = available.get(family.lower())
                if found:
                    return found
        except Exception:
            pass
        return fallback_family
        
    def setup_ui(self):
        tech_display_font = self.pick_font_family(
            [
                'DS-Digital',
                'Digital-7',
                'DSEG7 Classic',
                'Orbitron',
                'Eurostile',
                'OCR A Extended',
                'Consolas',
            ],
            'Courier New'
        )
        tech_ui_font = self.pick_font_family(
            [
                'Orbitron',
                'Rajdhani',
                'Bahnschrift',
                'Segoe UI',
            ],
            'Arial'
        )

        # PC number label
        pc_label_font = tkfont.Font(family=tech_ui_font, size=14, weight='bold')
        status_font = tkfont.Font(family=tech_ui_font, size=10)
        self.timer_font_normal = tkfont.Font(family=tech_display_font, size=29, weight='bold')
        self.pc_font_normal = pc_label_font
        self.pc_font_lock = tkfont.Font(family=tech_ui_font, size=64, weight='bold')
        self.timer_font_lock = tkfont.Font(family=tech_display_font, size=44, weight='bold')
        self.timer_font_minimized = tkfont.Font(family=tech_display_font, size=12, weight='bold')
        self.minimize_btn_font_normal = tkfont.Font(size=18, weight='bold')
        self.minimize_btn_font_minimized = self.minimize_btn_font_normal
        self.pc_label_text = f"PC {self.unit_id}"
        self.pc_label = tk.Label(
            self.root,
            text=self.pc_label_text,
            font=self.pc_font_normal,
            fg='#4CAF50',
            bg=self.bg_normal
        )
        self.pc_label.pack(pady=(2, 0))
        
        # Timer display
        self.timer_label = tk.Label(
            self.root,
            text="--:--",
            font=self.timer_font_normal,
            fg=self.fg_normal,
            bg=self.bg_normal
        )
        self.timer_label.pack(pady=(0, 0))
        
        # Status label
        self.status_label = tk.Label(
            self.root,
            text="Connecting...",
            font=status_font,
            fg='#888888',
            bg=self.bg_normal
        )
        self.status_label.pack(pady=(0, 0))

        # Warning label for shutdown countdown
        self.warning_font_normal = tkfont.Font(family=tech_ui_font, size=10, weight='bold')
        self.warning_font_lock = tkfont.Font(family=tech_ui_font, size=13, weight='bold')
        self.warning_label = tk.Label(
            self.root,
            text="",
            font=self.warning_font_normal,
            fg='#ffcc00',
            bg=self.bg_normal,
            wraplength=228,
            justify='center'
        )
        self.warning_label.pack(pady=(0, 0), padx=3, fill='x')

        # Spacers used only during lock layout for vertical centering.
        self.top_spacer = tk.Frame(self.root, bg=self.bg_normal, height=1)
        self.bottom_spacer = tk.Frame(self.root, bg=self.bg_normal, height=1)
        
        # Connection indicator (small dot)
        self.connection_indicator = tk.Label(
            self.root,
            text="●",
            font=tkfont.Font(size=8),
            fg='#ff0000',
            bg=self.bg_normal
        )
        self.connection_indicator.place(x=10, y=10, relx=0.0, rely=0.0, anchor='nw')
        
        # Minimize button
        self.minimize_btn = tk.Label(
            self.root,
            text="-",
            font=self.minimize_btn_font_normal,
            fg='#666666',
            bg=self.bg_normal,
            width=2,
            anchor='center',
            cursor='hand2'
        )
        self.minimize_btn.place(relx=1.0, x=-8, y=2, rely=0.0, anchor='ne')
        self.minimize_btn.bind('<Button-1>', self.minimize_window)

    def setup_background_image(self):
        if not self.background_image_path:
            return

        if not os.path.exists(self.background_image_path):
            print(f"Background image not found: {self.background_image_path}")
            return

        pil_available = False
        pil_image = None
        pil_image_tk = None
        pil_image_ops = None

        try:
            pil_module = __import__('PIL', fromlist=['Image', 'ImageTk', 'ImageOps'])
            pil_image = pil_module.Image
            pil_image_tk = pil_module.ImageTk
            pil_image_ops = pil_module.ImageOps
            pil_available = True
        except Exception:
            pil_available = False

        try:
            if pil_available:
                self.background_source_image = pil_image.open(self.background_image_path).convert('RGBA')
                self.background_use_pillow = True
                screen_size = (self.root.winfo_screenwidth(), self.root.winfo_screenheight())
                fitted = pil_image_ops.fit(self.background_source_image, screen_size, method=pil_image.Resampling.LANCZOS)
                self.background_image = pil_image_tk.PhotoImage(fitted)
            else:
                self.background_image = tk.PhotoImage(file=self.background_image_path)
                self.background_use_pillow = False

            self.background_label = tk.Label(self.root, image=self.background_image, borderwidth=0)
            # Hidden by default; shown only during locked state.
            self.background_label.place_forget()
            if pil_available:
                print(f"Locked background image loaded: {self.background_image_path}")
            else:
                print(f"Locked background image loaded: {self.background_image_path}")
        except Exception as error:
            self.background_image = None
            self.background_label = None
            self.background_source_image = None
            self.background_use_pillow = False
            print(f"Failed to load background image: {error}")

    def refresh_lock_background(self):
        if self.background_label is None:
            return

        self.root.update_idletasks()

        if self.warning_active and not self.admin_unlocked:
            target_width = self.root.winfo_screenwidth()
            target_height = self.root.winfo_screenheight()
        else:
            target_width = max(1, self.root.winfo_width())
            target_height = max(1, self.root.winfo_height())

        if not self.background_use_pillow or self.background_source_image is None:
            self.background_label.place(x=0, y=0, width=target_width, height=target_height)
            return

        try:
            pil_module = __import__('PIL', fromlist=['Image', 'ImageTk', 'ImageOps'])
            pil_image = pil_module.Image
            pil_image_tk = pil_module.ImageTk
            pil_image_ops = pil_module.ImageOps

            width = target_width
            height = target_height
            fitted = pil_image_ops.fit(self.background_source_image, (width, height), method=pil_image.Resampling.LANCZOS)
            self.background_image = pil_image_tk.PhotoImage(fitted)
            self.background_label.configure(image=self.background_image)
        except Exception as error:
            print(f"Failed to refresh lock background: {error}")

        self.background_label.place(x=0, y=0, width=target_width, height=target_height)

    def show_lock_background(self):
        if self.background_label is None:
            return

        self.refresh_lock_background()
        self.background_label.lower()
        self.schedule_background_refresh()

    def hide_lock_background(self):
        if self.background_label is None:
            return
        if self.background_refresh_job is not None:
            self.root.after_cancel(self.background_refresh_job)
            self.background_refresh_job = None
        self.background_label.place_forget()

    def schedule_background_refresh(self):
        if self.background_label is None:
            return

        if self.background_refresh_job is not None:
            self.root.after_cancel(self.background_refresh_job)

        # Refresh after geometry settles (e.g., right after fullscreen transition).
        self.background_refresh_job = self.root.after(80, self._run_scheduled_background_refresh)

    def _run_scheduled_background_refresh(self):
        self.background_refresh_job = None
        if self.warning_active and not self.admin_unlocked:
            self.refresh_lock_background()

    def on_window_configure(self, event=None):
        if self.warning_active and not self.admin_unlocked:
            self.schedule_background_refresh()

    def set_default_layout(self):
        if not self.lock_layout_active and self.pc_label.winfo_manager():
            return

        self.lock_layout_active = False
        self.top_spacer.pack_forget()
        self.bottom_spacer.pack_forget()

        self.pc_label.pack_forget()
        self.timer_label.pack_forget()
        self.timer_label.place_forget()
        self.status_label.pack_forget()
        self.warning_label.pack_forget()
        self.warning_label.place_forget()

        self.pc_label.pack(pady=(2, 0))
        self.timer_label.pack(pady=(0, 0))
        self.status_label.pack(pady=(0, 0))
        self.warning_label.pack(pady=(0, 0), padx=3, fill='x')

    def set_lock_layout(self):
        if self.lock_layout_active:
            return

        self.lock_layout_active = True

        self.pc_label.pack_forget()
        self.pc_label.place_forget()
        self.status_label.pack_forget()
        self.timer_label.pack_forget()
        self.timer_label.place_forget()
        self.warning_label.pack_forget()
        self.warning_label.place_forget()
        self.top_spacer.pack_forget()
        self.bottom_spacer.pack_forget()

        self.pc_label.place(relx=0.5, rely=0.40, anchor='center')
        self.timer_label.place(relx=0.5, rely=0.49, anchor='center')
        self.warning_label.place(relx=0.5, rely=0.56, anchor='n')

    def apply_lock_text_style(self):
        self.pc_label.configure(fg='#4CAF50', font=self.pc_font_lock, borderwidth=0, highlightthickness=0, relief='flat')
        self.timer_label.configure(fg=self.fg_critical, font=self.timer_font_lock, borderwidth=0, highlightthickness=0, relief='flat')
        self.warning_label.configure(fg='#ffcc00', borderwidth=0, highlightthickness=0, relief='flat')

        # On some Tk builds, empty background acts as transparent for labels.
        for label in (self.pc_label, self.timer_label, self.warning_label):
            try:
                label.configure(bg='')
            except tk.TclError:
                # Keep current background if transparency isn't supported by this runtime.
                pass

        
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

    def close_window(self, event=None):
        self.stop_window_flash()
        if self.unlock_password:
            password = self.ask_password_dialog("Close Overlay", "Enter password to close:")

            if password is None:
                return "break"
            if password != self.unlock_password:
                messagebox.showerror("Access denied", "Incorrect password.")
                return "break"
        else:
            messagebox.showerror(
                "Close blocked",
                "No password configured. Set --unlock-password or PISONET_UNLOCK_PASSWORD to enable closing."
            )
            return "break"

        self.is_closing = True
        self.cancel_shutdown(reason="Overlay closed. Cancelling pending shutdown...")
        if self.ws is not None:
            try:
                self.ws.close()
            except Exception:
                pass
        self.disable_lock_key_block()
        self.uninstall_windows_key_hook()
        self.root.destroy()
        return "break"

    def minimize_window(self, event=None):
        if self.is_minimized:
            self.restore_from_minimized()
            return "break"

        self.last_geometry = self.root.geometry()
        x = self.root.winfo_x()
        y = self.root.winfo_y()
        self.minimized_geometry = f"190x36+{x}+{y}"

        # Hide all non-timer widgets across both pack/place layouts.
        self.pc_label.pack_forget()
        self.pc_label.place_forget()
        self.status_label.pack_forget()
        self.status_label.place_forget()
        self.warning_label.pack_forget()
        self.warning_label.place_forget()
        self.connection_indicator.place(x=12, y=18, relx=0.0, rely=0.0, anchor='center')
        self.pc_label.configure(text="")

        self.minimize_btn.configure(text="+", font=self.minimize_btn_font_normal)
        self.minimize_btn.place(relx=1.0, x=-8, y=18, rely=0.0, anchor='e')
        self.timer_label.place_forget()
        self.timer_label.pack_forget()
        self.timer_label.configure(font=self.timer_font_minimized)
        if self.warning_active:
            self.timer_label.configure(text=self.format_time(self.warning_seconds_left))
        else:
            self.timer_label.configure(text=self.format_time(self.remaining_seconds))
        self.timer_label.place(relx=0.5, y=18, rely=0.0, anchor='center')
        self.root.geometry(self.minimized_geometry)
        self.root.lift()
        self.is_minimized = True
        return "break"

    def restore_from_minimized(self):
        if not self.is_minimized:
            return

        self.root.geometry(self.last_geometry)
        if self.warning_active:
            self.set_lock_layout()
        else:
            self.set_default_layout()
        self.connection_indicator.place(x=10, y=10, relx=0.0, rely=0.0, anchor='nw')

        self.pc_label.configure(text=self.pc_label_text)
        self.timer_label.configure(font=self.timer_font_normal)
        self.minimize_btn.configure(text="-", font=self.minimize_btn_font_normal)
        self.minimize_btn.place(relx=1.0, x=-8, y=2, rely=0.0, anchor='ne')
        self.root.lift()
        self.is_minimized = False

    def ensure_main_widgets_visible(self):
        if self.is_minimized:
            return

        if self.lock_layout_active:
            if not self.pc_label.winfo_ismapped():
                self.pc_label.place(relx=0.5, rely=0.40, anchor='center')
            if not self.timer_label.winfo_ismapped():
                self.timer_label.place(relx=0.5, rely=0.49, anchor='center')
            if not self.warning_label.winfo_ismapped():
                self.warning_label.place(relx=0.5, rely=0.56, anchor='n')
            return

        if not self.pc_label.winfo_manager():
            self.pc_label.pack(pady=(2, 0))
        if not self.timer_label.winfo_manager():
            self.timer_label.pack(pady=(0, 0))
        if not self.status_label.winfo_manager():
            self.status_label.pack(pady=(0, 0))
        if not self.warning_label.winfo_manager():
            self.warning_label.pack(pady=(0, 0), padx=3, fill='x')

    def set_normal_window_size(self):
        if self.is_minimized or self.is_fullscreen or self.warning_active:
            return

        x = self.root.winfo_x()
        y = self.root.winfo_y()
        self.root.geometry(f"{self.default_window_width}x{self.default_window_height}+{x}+{y}")

    def set_low_time_window_size(self):
        if self.is_minimized or self.is_fullscreen or self.warning_active:
            return

        x = self.root.winfo_x()
        y = self.root.winfo_y()
        self.root.geometry(f"{self.low_time_window_width}x{self.low_time_window_height}+{x}+{y}")

    def hide_minimize_button(self):
        if not self.minimize_btn_visible:
            return
        self.minimize_btn.place_forget()
        self.minimize_btn_visible = False

    def show_minimize_button(self):
        if self.minimize_btn_visible:
            return

        if self.is_minimized:
            self.minimize_btn.configure(text="+", font=self.minimize_btn_font_normal)
            self.minimize_btn.place(relx=1.0, x=-8, y=18, rely=0.0, anchor='e')
        else:
            self.minimize_btn.configure(text="-", font=self.minimize_btn_font_normal)
            self.minimize_btn.place(relx=1.0, x=-8, y=2, rely=0.0, anchor='ne')

        self.minimize_btn_visible = True

    def on_window_restore(self, event=None):
        self.root.overrideredirect(True)
        self.root.attributes('-topmost', True)
        if self.is_fullscreen:
            screen_width = self.root.winfo_screenwidth()
            screen_height = self.root.winfo_screenheight()
            self.root.geometry(f"{screen_width}x{screen_height}+0+0")
        elif self.is_minimized:
            self.root.geometry(self.minimized_geometry)
        else:
            self.root.geometry(self.last_geometry)

        if self.warning_active:
            self.show_lock_background()
        self.root.lift()

    def enter_lockdown_ui(self):
        self.restore_from_minimized()
        self.is_lockdown_ui = True
        self.root.deiconify()
        self.root.attributes('-topmost', True)
        if self.warning_active and not self.admin_unlocked:
            self.enter_fullscreen_mode()
        else:
            self.exit_fullscreen_mode()
            x = self.root.winfo_x()
            y = self.root.winfo_y()
            self.root.geometry(f"{self.warning_window_width}x{self.warning_window_height}+{x}+{y}")
        self.root.lift()
        self.root.focus_force()

    def exit_lockdown_ui(self):
        if not self.is_lockdown_ui:
            return

        self.is_lockdown_ui = False
        self.exit_fullscreen_mode()
        self.root.attributes('-topmost', True)
        self.root.geometry(self.default_geometry)

    def enter_fullscreen_mode(self):
        if self.is_fullscreen:
            return

        self.pre_fullscreen_geometry = self.root.geometry()
        # Tk does not allow -fullscreen while overrideredirect is enabled.
        # Use explicit screen-sized geometry for a borderless fullscreen lock.
        self.root.overrideredirect(True)
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        self.root.geometry(f"{screen_width}x{screen_height}+0+0")
        self.root.lift()
        self.root.focus_force()
        self.schedule_background_refresh()
        self.is_fullscreen = True

    def exit_fullscreen_mode(self):
        if not self.is_fullscreen:
            return

        restore_geometry = self.pre_fullscreen_geometry or self.default_geometry
        self.root.geometry(restore_geometry)
        self.is_fullscreen = False

    def flash_window(self):
        self.flash_state = not self.flash_state

        # Flash text only (no window alpha/background flashing).
        if self.remaining_seconds > 0 and self.remaining_seconds <= self.warning_threshold_seconds and not self.warning_active:
            if self.flash_state:
                self.timer_label.configure(fg=self.fg_critical)
            else:
                self.timer_label.configure(fg=self.fg_warning)

        self.flash_job = self.root.after(350, self.flash_window)

    def start_window_flash(self):
        if self.flash_job is not None:
            return

        self.flash_state = False
        self.flash_window()

    def stop_window_flash(self):
        if self.flash_job is not None:
            self.root.after_cancel(self.flash_job)
            self.flash_job = None
        self.flash_state = False
        self.root.attributes('-alpha', self.base_alpha)

    def enforce_lockdown_ui(self):
        if not self.warning_active:
            return

        if self.password_prompt_active:
            self.root.after(500, self.enforce_lockdown_ui)
            return

        # Keep the warning window visible without trapping the desktop.
        self.root.deiconify()
        self.root.attributes('-topmost', True)
        self.root.lift()
        self.root.after(500, self.enforce_lockdown_ui)

    def ask_password_dialog(self, title, prompt):
        self.password_prompt_active = True
        result = {'value': None}

        try:
            self.root.attributes('-topmost', False)
            self.root.update_idletasks()

            dialog = tk.Toplevel(self.root)
            dialog.title(title)
            dialog.resizable(False, False)
            dialog.configure(bg='#f0f0f0')
            dialog.attributes('-topmost', True)

            width = 320
            height = 140
            x = (dialog.winfo_screenwidth() // 2) - (width // 2)
            y = (dialog.winfo_screenheight() // 2) - (height // 2)
            dialog.geometry(f"{width}x{height}+{x}+{y}")

            label = tk.Label(dialog, text=prompt, bg='#f0f0f0')
            label.pack(pady=(16, 8))

            entry = tk.Entry(dialog, show='*', width=30)
            entry.pack(pady=(0, 12), padx=14)

            btn_row = tk.Frame(dialog, bg='#f0f0f0')
            btn_row.pack(pady=(0, 12))

            def on_ok(event=None):
                result['value'] = entry.get()
                dialog.destroy()
                return "break"

            def on_cancel(event=None):
                result['value'] = None
                dialog.destroy()
                return "break"

            tk.Button(btn_row, text="OK", width=10, command=on_ok).pack(side=tk.LEFT, padx=6)
            tk.Button(btn_row, text="Cancel", width=10, command=on_cancel).pack(side=tk.LEFT, padx=6)

            dialog.protocol('WM_DELETE_WINDOW', on_cancel)
            dialog.bind('<Return>', on_ok)
            dialog.bind('<Escape>', on_cancel)

            dialog.transient(self.root)
            dialog.grab_set()
            dialog.lift()
            dialog.focus_force()
            dialog.after(20, lambda: entry.focus_force())

            self.root.wait_window(dialog)
        except Exception as error:
            print(f"Error showing password dialog: {error}")
            result['value'] = None
        finally:
            self.password_prompt_active = False
            self.root.attributes('-topmost', True)

        return result['value']

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

        password = self.ask_password_dialog("Admin Unlock", "Enter unlock password:")

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
            print("Timer expired. Soft lock mode: warning overlay only.")
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

        current_platform = sys.platform

        # Windows shows a system sign-out dialog for delayed shutdown (/t N).
        # Keep shutdown unscheduled on Windows and trigger it exactly at 0s.
        if current_platform == 'win32':
            print("Shutdown will execute when countdown reaches 0 seconds.")
            return

        self.shutdown_triggered = True
        print(f"Scheduling shutdown in {self.shutdown_grace_seconds} seconds...")

        try:
            if current_platform == 'darwin':
                minutes = max(1, self.shutdown_grace_seconds // 60)
                self.run_command(['sudo', 'shutdown', '-h', f'+{minutes}'])
            else:
                minutes = max(1, self.shutdown_grace_seconds // 60)
                self.run_command(['shutdown', '-h', f'+{minutes}'])
        except Exception as error:
            print(f"Failed to schedule shutdown: {error}")

    def execute_shutdown_now(self):
        if self.shutdown_triggered:
            return

        self.shutdown_triggered = True
        current_platform = sys.platform
        print("Countdown finished. Shutting down now...")

        try:
            if current_platform == 'win32':
                self.run_command(['shutdown', '/s', '/f', '/t', '0'])
            elif current_platform == 'darwin':
                self.run_command(['sudo', 'shutdown', '-h', 'now'])
            else:
                self.run_command(['shutdown', '-h', 'now'])
        except Exception as error:
            print(f"Failed to execute shutdown: {error}")

    def cancel_shutdown(self, reason="New time received. Cancelling pending shutdown..."):
        if not self.shutdown_triggered:
            return

        current_platform = sys.platform
        print(reason)

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
        self.warning_transition_scheduled = False
        if self.warning_active:
            return

        self.warning_active = True
        self.enable_lock_key_block()
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
        self.disable_lock_key_block()
        self.warning_seconds_left = self.shutdown_grace_seconds
        self.lock_triggered = False
        self.shutdown_triggered = False
        self.exit_lockdown_ui()
    
    def update_display(self):
        """Update the timer display (called from main thread)"""
        # Ensure warning and critical messages are visible by leaving compact mode.
        if self.is_minimized and (self.warning_active or self.remaining_seconds <= self.warning_threshold_seconds):
            self.restore_from_minimized()

        self.ensure_main_widgets_visible()

        is_zero_or_expired = self.remaining_seconds <= 0 and not self.admin_unlocked
        should_flash = self.remaining_seconds > 0 and self.remaining_seconds <= self.warning_threshold_seconds
        if should_flash:
            self.start_window_flash()
        else:
            self.stop_window_flash()

        if is_zero_or_expired:
            self.hide_minimize_button()
        else:
            self.show_minimize_button()

        if self.warning_active:
            self.timer_label.config(text=self.format_time(self.warning_seconds_left))
        else:
            self.timer_label.config(text=self.format_time(self.remaining_seconds))

        if self.is_minimized:
            # Preserve compact timer-only view during per-second updates.
            self.pc_label.configure(text="")
            self.connection_indicator.place(x=12, y=18, relx=0.0, rely=0.0, anchor='center')
            self.timer_label.place_forget()
            self.timer_label.pack_forget()
            self.timer_label.configure(font=self.timer_font_minimized)
            self.timer_label.place(relx=0.5, y=18, rely=0.0, anchor='center')
            self.minimize_btn.place(relx=1.0, x=-8, y=18, rely=0.0, anchor='e')

            # Keep connection indicator accurate while skipping full layout/style updates.
            if self.connected:
                self.connection_indicator.config(fg='#00ff00')
            else:
                self.connection_indicator.config(fg='#ff0000')
            return

        # Reset relative placement options after leaving minimized mode.
        self.connection_indicator.place(x=10, y=10, relx=0.0, rely=0.0, anchor='nw')
        if self.minimize_btn_visible:
            self.minimize_btn.place(relx=1.0, x=-8, y=2, rely=0.0, anchor='ne')

        if 0 < self.remaining_seconds <= self.warning_threshold_seconds:
            self.set_low_time_window_size()
        elif not self.is_lockdown_ui:
            self.set_normal_window_size()
        
        # Update colors and status based on remaining time
        if self.warning_active:
            self.enter_lockdown_ui()
            self.set_lock_layout()
            self.show_lock_background()
            self.root.configure(bg=self.bg_critical)
            self.apply_lock_text_style()
            self.status_label.configure(text="SESSION LOCKED", fg=self.fg_critical, bg=self.bg_critical)
            self.warning_label.configure(
                text=f"Please insert coin to unlock this PC or it will Shutdown in {self.warning_seconds_left}s.",
                font=self.warning_font_lock,
                wraplength=min(520, max(220, int(self.root.winfo_width() * 0.45)))
            )
            self.connection_indicator.configure(bg=self.bg_critical)
            self.top_spacer.configure(bg=self.bg_critical)
            self.bottom_spacer.configure(bg=self.bg_critical)
        elif self.admin_unlocked and self.remaining_seconds <= 0:
            self.exit_lockdown_ui()
            self.set_default_layout()
            self.hide_lock_background()
            self.root.configure(bg=self.bg_warning)
            self.pc_label.configure(bg=self.bg_warning, font=self.pc_font_normal)
            self.timer_label.configure(fg=self.fg_warning, bg=self.bg_warning, font=self.timer_font_normal)
            self.status_label.configure(text="ADMIN UNLOCK", fg='#ffffff', bg=self.bg_warning)
            self.warning_label.configure(text="Admin override active. Press minimize if needed, or add time to resume normal session.", fg='#ffcc00', bg=self.bg_warning, font=self.warning_font_normal)
            self.connection_indicator.configure(bg=self.bg_warning)
            self.top_spacer.configure(bg=self.bg_warning)
            self.bottom_spacer.configure(bg=self.bg_warning)
        elif self.remaining_seconds <= 0:
            self.exit_lockdown_ui()
            self.set_default_layout()
            self.hide_lock_background()
            self.root.configure(bg=self.bg_critical)
            self.pc_label.configure(bg=self.bg_critical, font=self.pc_font_normal)
            self.timer_label.configure(fg=self.fg_critical, bg=self.bg_critical, font=self.timer_font_normal)
            self.status_label.configure(text="TIME EXPIRED", fg=self.fg_critical, bg=self.bg_critical)
            self.warning_label.configure(text="Locking screen...", fg='#ffcc00', bg=self.bg_critical, font=self.warning_font_normal)
            self.connection_indicator.configure(bg=self.bg_critical)
            self.top_spacer.configure(bg=self.bg_critical)
            self.bottom_spacer.configure(bg=self.bg_critical)
        elif self.remaining_seconds <= self.critical_threshold_seconds:
            self.exit_lockdown_ui()
            self.set_default_layout()
            self.hide_lock_background()
            self.root.configure(bg=self.bg_critical)
            self.pc_label.configure(bg=self.bg_critical, font=self.pc_font_normal)
            self.timer_label.configure(fg=self.fg_critical, bg=self.bg_critical, font=self.timer_font_normal)
            self.status_label.configure(text="WARNING: SAVE YOUR WORK", fg=self.fg_critical, bg=self.bg_critical)
            self.warning_label.configure(
                text="Add time now to avoid lock and shutdown.",
                fg='#ffcc00',
                bg=self.bg_critical,
                font=self.warning_font_normal,
                wraplength=max(220, self.root.winfo_width() - 24)
            )
            self.connection_indicator.configure(bg=self.bg_critical)
            self.top_spacer.configure(bg=self.bg_critical)
            self.bottom_spacer.configure(bg=self.bg_critical)
        elif self.remaining_seconds <= self.warning_threshold_seconds:
            self.exit_lockdown_ui()
            self.set_default_layout()
            self.hide_lock_background()
            self.root.configure(bg=self.bg_warning)
            self.pc_label.configure(bg=self.bg_warning, font=self.pc_font_normal)
            self.timer_label.configure(fg=self.fg_warning, bg=self.bg_warning, font=self.timer_font_normal)
            self.status_label.configure(text="LOW TIME", fg=self.fg_warning, bg=self.bg_warning)
            self.warning_label.configure(
                text="Time is almost up. Insert coin soon.",
                fg='#ffcc00',
                bg=self.bg_warning,
                font=self.warning_font_normal,
                wraplength=max(220, self.root.winfo_width() - 24)
            )
            self.connection_indicator.configure(bg=self.bg_warning)
            self.top_spacer.configure(bg=self.bg_warning)
            self.bottom_spacer.configure(bg=self.bg_warning)
        else:
            self.exit_lockdown_ui()
            self.set_default_layout()
            self.hide_lock_background()
            self.root.configure(bg=self.bg_normal)
            self.pc_label.configure(bg=self.bg_normal, font=self.pc_font_normal)
            self.timer_label.configure(fg=self.fg_normal, bg=self.bg_normal, font=self.timer_font_normal)
            self.status_label.configure(text="Active Session", fg='#00ff00', bg=self.bg_normal)
            self.warning_label.configure(text="", fg='#ffcc00', bg=self.bg_normal, font=self.warning_font_normal)
            self.connection_indicator.configure(bg=self.bg_normal)
            self.top_spacer.configure(bg=self.bg_normal)
            self.bottom_spacer.configure(bg=self.bg_normal)
            
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
            elif self.warning_active and self.warning_seconds_left <= 0 and not self.admin_unlocked:
                self.execute_shutdown_now()
            elif self.remaining_seconds <= 0 and not self.warning_active and not self.admin_unlocked:
                if not self.warning_transition_scheduled:
                    self.warning_transition_scheduled = True
                    self.root.after(0, self.begin_shutdown_warning)
    
    def connect_websocket(self):
        """Connect to WebSocket server (runs in background thread)"""
        ws_url = f"ws://{self.server_host}:{self.ws_port}"
        
        while True:
            if self.is_closing:
                return
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
                if self.is_closing:
                    return
            
            # Reconnect after 3 seconds
            if self.is_closing:
                return
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
    parser.add_argument('--wsport', type=int, default=5001, help='WebSocket port (default: 5001)')
    parser.add_argument('--grace', type=int, default=60, help='Shutdown warning time in seconds after timer hits zero (default: 60)')
    parser.add_argument('--apiport', type=int, default=None, help='API port for initial state fetch (default: same as --wsport)')
    parser.add_argument('--oslock', action='store_true', help='Also lock the operating system at zero time (may hide overlay behind OS lock screen)')
    parser.add_argument('--unlock-password', type=str, default=os.environ.get('PISONET_UNLOCK_PASSWORD'), help='Password required for Ctrl+Q admin unlock (default: PISONET_UNLOCK_PASSWORD env var)')
    parser.add_argument('--bg-image', type=str, default=os.environ.get('PISONET_BG_IMAGE'), help='Optional lock-mode background image path. Normal mode keeps plain color (default: PISONET_BG_IMAGE env var)')
    
    args = parser.parse_args()
    
    if args.unit < 1 or args.unit > 10:
        print("Error: Unit number must be between 1 and 10")
        sys.exit(1)
    
    print(f"Starting timer overlay for PC {args.unit}")
    print(f"Server: {args.server}:{args.wsport}")
    print("Overlay started (window can be minimized or closed for debugging)")
    if args.unlock_password:
        print("Ctrl+Q admin unlock is enabled")
    else:
        print("Ctrl+Q admin unlock is disabled until an unlock password is configured")
    
    overlay = TimerOverlay(args.unit, args.server, args.wsport, args.grace, args.apiport, args.oslock, args.unlock_password, args.bg_image)
    
    try:
        overlay.run()
    except KeyboardInterrupt:
        print("\nShutting down...")
        sys.exit(0)


if __name__ == '__main__':
    main()
