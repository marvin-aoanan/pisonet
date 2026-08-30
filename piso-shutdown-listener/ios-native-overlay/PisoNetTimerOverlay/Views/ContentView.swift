import SwiftUI

struct ContentView: View {
    @EnvironmentObject var service: OverlayService

    @State private var showSetup = false
    @State private var showUnlockPrompt = false
    @State private var unlockPasswordInput = ""
    @State private var unlockError = ""

    var body: some View {
        ZStack {
            backgroundColor
                .ignoresSafeArea()

            VStack(spacing: 14) {
                if !service.isLockSession {
                    header
                }

                Spacer()

                timerSection

                Spacer()

                footer
            }
            .padding(14)
        }
        .onAppear {
            if !service.ensureConfigured() {
                service.openSetupReset()
                showSetup = true
            }
        }
        .sheet(isPresented: $showSetup) {
            SetupView(isPresented: $showSetup)
                .environmentObject(service)
        }
        .statusBar(hidden: service.isLockSession)
        .alert("Admin Unlock", isPresented: $showUnlockPrompt) {
            SecureField("Unlock password", text: $unlockPasswordInput)
            Button("Unlock") {
                let ok = service.tryAdminUnlock(password: unlockPasswordInput)
                if !ok {
                    unlockError = "Incorrect password or unlock is unavailable."
                } else {
                    unlockError = ""
                }
                unlockPasswordInput = ""
            }
            Button("Cancel", role: .cancel) {
                unlockPasswordInput = ""
            }
        } message: {
            Text("Enter unlock password")
        }
        .alert("Unlock Failed", isPresented: Binding(get: { !unlockError.isEmpty }, set: { if !$0 { unlockError = "" } })) {
            Button("OK", role: .cancel) {
                unlockError = ""
            }
        } message: {
            Text(unlockError)
        }
    }

    private var header: some View {
        HStack {
            Text("PC \(service.config?.unitId ?? 0)")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Spacer()

            HStack(spacing: 8) {
                Button("Fullscreen") {
                    // iOS app view already fills screen; this keeps parity with Android UX.
                }
                .buttonStyle(.bordered)

                Button("Setup") {
                    service.openSetupReset()
                    showSetup = true
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var timerSection: some View {
        VStack(spacing: 12) {
            if service.isLockSession {
                Text("PC \(service.config?.unitId ?? 0)")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }

            Text(service.timerText)
                .font(.system(size: 90, weight: .bold, design: .monospaced))
                .minimumScaleFactor(0.4)
                .lineLimit(1)
                .foregroundStyle(timerColor.opacity(service.flashActive ? 0.6 : 1.0))
                .shadow(color: timerColor.opacity(0.5), radius: 16)

            Text(service.statusText)
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .foregroundStyle(statusColor)
                .multilineTextAlignment(.center)

            Text(service.messageText)
                .font(.system(size: 20, weight: .medium, design: .rounded))
                .foregroundStyle(Color(red: 1.0, green: 0.84, blue: 0.42))
                .multilineTextAlignment(.center)
                .frame(minHeight: 56)
        }
    }

    private var footer: some View {
        HStack {
            Circle()
                .fill(service.isConnected ? Color.green : Color.red)
                .frame(width: 12, height: 12)

            Text(service.isConnected ? "Connected" : "Disconnected")
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.8))

            if !service.isLockSession {
                Spacer()
            }

            if service.showUnlockButton {
                Button("Admin Unlock") {
                    showUnlockPrompt = true
                }
                .buttonStyle(.bordered)
                .tint(.white)
            }
        }
    }

    private var backgroundColor: Color {
        switch service.visualState {
        case .normal:
            return Color(red: 0.01, green: 0.08, blue: 0.15)
        case .lowTime:
            return Color(red: 0.2, green: 0.13, blue: 0.0)
        case .critical, .locked:
            return Color(red: 0.23, green: 0.05, blue: 0.05)
        case .openTime:
            return Color(red: 0.1, green: 0.3, blue: 0.18)
        }
    }

    private var timerColor: Color {
        switch service.visualState {
        case .normal, .openTime:
            return Color(red: 0.0, green: 1.0, blue: 0.4)
        case .lowTime:
            return Color.orange
        case .critical, .locked:
            return Color.red
        }
    }

    private var statusColor: Color {
        switch service.visualState {
        case .normal:
            return .green
        case .lowTime:
            return .orange
        case .critical, .locked:
            return .red
        case .openTime:
            return .green
        }
    }
}
