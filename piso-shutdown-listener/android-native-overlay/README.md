# PisoNet Native Android Timer Overlay

This is a native Android app version of timer-overlay.py.
It connects directly to the same PisoNet backend server and WebSocket.

## What It Uses

- WebSocket: ws://<server>:<wsport>
- Initial state API: http://<server>:<apiport>/api/units

Message compatibility implemented:

- initial_state
- timer_update
- coin_insert
- UNIT_UPDATE
- COIN_INSERTED
- HARDWARE_CONTROL (visual handling)

## Feature Coverage vs timer-overlay.py

Implemented:

- Unit-based timer display
- Local countdown between server updates
- Low-time and critical warning states
- Zero-time lock warning countdown (grace seconds)
- Open-time mode with elapsed time and amount
- Auto reconnect to WebSocket
- Admin unlock using configured password
- Fullscreen immersive mode
- Keep screen awake while app is running
- Auto-detect unit from IP range 192.168.254.151-160 (if available)

Platform differences (Android):

- App cannot force system shutdown/restart unless device-owner/kiosk policy is added.
- App cannot globally block all Android system navigation without dedicated kiosk provisioning.

## Build Requirements

- Android Studio Hedgehog or newer
- Android SDK 34
- JDK 17

## Build Steps

1. Open folder:
   piso-shutdown-listener/android-native-overlay
2. Let Gradle sync finish.
3. Build APK from Android Studio.
4. Install on phone/tablet.

## First Launch Setup

Enter:

- Unit ID
- Server Host/IP (example: 192.168.254.201)
- WebSocket Port (default: 5001)
- API Port (default: 5001)
- Grace Seconds (default: 60)
- Unlock Password (optional)

Settings are stored in app preferences and can be changed from Setup button.

## Suggested Deployment

- Put the Android device on the same LAN as backend.
- Pin app in Android kiosk mode for better lock behavior.
- Keep backend at pisonet-web/backend running on port 5001.
