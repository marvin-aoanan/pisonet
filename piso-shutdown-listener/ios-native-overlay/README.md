# PisoNet Native iOS Timer Overlay (iPhone/iPad)

This is a native SwiftUI iOS app version of timer-overlay.py.
It connects directly to the same PisoNet backend WebSocket and API.

## Protocol Compatibility

Implemented websocket message handling:

- initial_state
- timer_update
- coin_insert
- UNIT_UPDATE
- COIN_INSERTED
- HARDWARE_CONTROL (visual handling)

Initial unit bootstrap:

- GET /api/units

## Behavior Compatibility

Implemented:

- Unit-based timer display
- Local countdown between server updates
- Low-time and critical states
- Zero-time lock warning grace countdown
- Open-time mode (elapsed + amount)
- Reconnect on websocket loss
- Admin unlock via password
- Home Screen widget for active session visibility
- Lock session fullscreen mode with Guided Access request (optional)

Platform limits on iOS:

- No forced OS shutdown/restart from app sandbox
- No full system-level lockout without supervised/kiosk management
- No floating overlay on top of Home screen or other apps (iOS does not allow this for normal apps)
- When app goes to background, iOS can suspend websocket updates

## Important iOS UX Note

On iPhone/iPad, this runs as a normal foreground app screen, not as a desktop-style always-on-top overlay.

For timer visibility outside the app, this project now supports:

- Home Screen Widget (active session timer snapshot)

Optional future upgrades:

- Live Activities (Lock Screen / Dynamic Island)
- Push notifications from server for low-time/expired events

## Build (XcodeGen + Xcode)

1. Install XcodeGen if needed:

   brew install xcodegen

2. Generate Xcode project:

   cd piso-shutdown-listener/ios-native-overlay
   xcodegen generate

3. Open generated project:

   open PisoNetTimerOverlay.xcodeproj

4. Select a physical iPhone/iPad (recommended) or simulator.
5. Build and run.

## Add Home Screen Widget

1. Long press Home Screen and tap Edit.
2. Tap Add Widget.
3. Search for PisoNet Active Timer.
4. Add the widget (small or medium).

The widget shows active sessions. If no active session exists, it shows "No active session".

## First Launch Setup

Enter these values in Setup screen:

- Unit ID
- Server Host/IP (example: 192.168.254.201)
- WebSocket Port (default: 5001)
- API Port (default: 5001)
- Grace Seconds (default: 60)
- Unlock Password (optional)

Saved settings are stored in UserDefaults.

For lock behavior:

- Enable Guided Access in iOS settings first.
- Keep "Request Guided Access on Lock" enabled in app Setup.
- During lock session, app requests Guided Access and hides status bar for fullscreen lock UI.

## Suggested Deployment

- Use Guided Access or Single App Mode for kiosk-like usage.
- Keep iPhone/iPad on the same LAN as the backend server.
- Keep backend pisonet-web/backend service running on port 5001.
