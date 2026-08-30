import Foundation
import SwiftUI
import UIKit
import Darwin
#if canImport(WidgetKit)
import WidgetKit
#endif

@MainActor
final class OverlayService: ObservableObject {
    @Published var config: AppConfig?
    @Published var isConnected = false
    @Published var timerText = "--:--"
    @Published var statusText = "Connecting..."
    @Published var messageText = ""
    @Published var visualState: OverlayVisualState = .normal
    @Published var showUnlockButton = false
    @Published var flashActive = false
    @Published var isLockSession = false
    @Published var isActiveSession = false

    private var wsTask: URLSessionWebSocketTask?
    private var reconnectTask: Task<Void, Never>?
    private var tickerTask: Task<Void, Never>?

    private var remainingSeconds = 0
    private var openTimeActive = false
    private var openTimeElapsed = 0
    private var openTimeAmount = 0.0
    private var warningActive = false
    private var warningSecondsLeft = 60
    private var adminUnlocked = false

    private let warningThresholdSeconds = 300
    private let criticalThresholdSeconds = 120

    private let defaultsKey = "pisonet_ios_overlay_config"
    private let appGroupId = "group.com.pisonet.timeroverlay"
    private let widgetSnapshotKey = "pisonet_widget_snapshot"

    init() {
        let loaded = loadConfig()
        if let loaded {
            applyConfig(loaded)
            connect()
        }
        startTicker()
        refreshDisplay()
    }

    deinit {
        wsTask?.cancel(with: .normalClosure, reason: nil)
        reconnectTask?.cancel()
        tickerTask?.cancel()
    }

    func ensureConfigured() -> Bool {
        config != nil
    }

    func saveAndConnect(_ newConfig: AppConfig) {
        saveConfig(newConfig)
        applyConfig(newConfig)
        connect()
        refreshDisplay()
    }

    func openSetupReset() {
        if config == nil {
            let autoUnit = detectUnitFromIpRange() ?? 1
            applyConfig(
                AppConfig(
                    unitId: autoUnit,
                    serverHost: AppConfig.default.serverHost,
                    wsPort: 5001,
                    apiPort: 5001,
                    graceSeconds: 60,
                    unlockPassword: "",
                    requestGuidedAccessOnLock: true
                )
            )
        }
    }

    func tryAdminUnlock(password: String) -> Bool {
        guard warningActive, let cfg = config, !cfg.unlockPassword.isEmpty else {
            return false
        }

        if password == cfg.unlockPassword {
            performAdminUnlock()
            return true
        }

        return false
    }

    func reconnect() {
        connect()
    }

    private func applyConfig(_ cfg: AppConfig) {
        config = cfg
        warningSecondsLeft = cfg.graceSeconds
    }

    private func saveConfig(_ cfg: AppConfig) {
        do {
            let data = try JSONEncoder().encode(cfg)
            UserDefaults.standard.set(data, forKey: defaultsKey)
        } catch {
            print("Failed to save config: \(error)")
        }
    }

    private func loadConfig() -> AppConfig? {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey) else {
            return nil
        }

        do {
            return try JSONDecoder().decode(AppConfig.self, from: data)
        } catch {
            print("Failed to decode config: \(error)")
            return nil
        }
    }

    private func connect() {
        guard let cfg = config else {
            return
        }

        reconnectTask?.cancel()
        wsTask?.cancel(with: .normalClosure, reason: nil)

        guard let url = URL(string: "ws://\(cfg.serverHost):\(cfg.wsPort)") else {
            scheduleReconnect()
            return
        }

        let session = URLSession(configuration: .default)
        wsTask = session.webSocketTask(with: url)
        wsTask?.resume()

        isConnected = true
        loadInitialState()
        receiveLoop()
        refreshDisplay()
    }

    private func receiveLoop() {
        wsTask?.receive { [weak self] result in
            Task { @MainActor in
                guard let self else { return }

                switch result {
                case .success(let message):
                    self.isConnected = true
                    switch message {
                    case .string(let text):
                        self.handleMessage(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self.handleMessage(text)
                        }
                    @unknown default:
                        break
                    }
                    self.receiveLoop()

                case .failure:
                    self.isConnected = false
                    self.scheduleReconnect()
                    self.refreshDisplay()
                }
            }
        }
    }

    private func scheduleReconnect() {
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            await self?.connect()
        }
    }

    private func loadInitialState() {
        guard let cfg = config,
              let url = URL(string: "http://\(cfg.serverHost):\(cfg.apiPort)/api/units")
        else {
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            guard let self else { return }
            guard error == nil,
                  let data,
                  let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode)
            else {
                return
            }

            do {
                guard let array = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                    return
                }

                guard let cfg = self.config else {
                    return
                }

                if let unit = array.first(where: { ($0["id"] as? Int) == cfg.unitId }) {
                    let seconds = unit["remaining_seconds"] as? Int ?? 0
                    Task { @MainActor in
                        self.remainingSeconds = seconds
                        if self.remainingSeconds > 0 {
                            self.adminUnlocked = false
                            self.resetExpiredState()
                        }
                        self.refreshDisplay()
                    }
                }
            } catch {
                // Keep running from websocket updates.
            }
        }.resume()
    }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String
        else {
            return
        }

        guard let cfg = config else {
            return
        }

        switch type {
        case "initial_state":
            guard let payload = json["data"] as? [[String: Any]] else { return }
            if let unit = payload.first(where: { ($0["unit_id"] as? Int) == cfg.unitId }) {
                remainingSeconds = unit["remaining_seconds"] as? Int ?? 0
                if remainingSeconds > 0 {
                    adminUnlocked = false
                    resetExpiredState()
                }
                refreshDisplay()
            }

        case "timer_update":
            guard let payload = json["data"] as? [String: Any] else { return }
            if (payload["unit_id"] as? Int) == cfg.unitId {
                remainingSeconds = payload["remaining_seconds"] as? Int ?? 0
                if remainingSeconds > 0 {
                    adminUnlocked = false
                    resetExpiredState()
                }
                refreshDisplay()
            }

        case "coin_insert":
            guard let payload = json["data"] as? [String: Any] else { return }
            if (payload["unit_id"] as? Int) == cfg.unitId {
                let coinValue = payload["coin_value"] as? Int ?? 0
                remainingSeconds += coinValue * 60
                if remainingSeconds > 0 {
                    adminUnlocked = false
                    resetExpiredState()
                }
                refreshDisplay()
            }

        case "UNIT_UPDATE":
            guard let unit = json["unit"] as? [String: Any] else { return }
            applyUnitPayload(unit, unitId: cfg.unitId)
            refreshDisplay()

        case "COIN_INSERTED":
            guard let unit = json["unit"] as? [String: Any] else { return }
            applyUnitPayload(unit, unitId: cfg.unitId)
            refreshDisplay()

        case "HARDWARE_CONTROL":
            let unitId = json["unit_id"] as? Int ?? 0
            if unitId == cfg.unitId {
                let action = json["action"] as? String ?? ""
                if action == "shutdown" {
                    beginShutdownWarning()
                    messageText = "Remote shutdown command received."
                } else if action == "restart" {
                    messageText = "Remote restart command received."
                }
                refreshDisplay()
            }

        default:
            break
        }
    }

    private func applyUnitPayload(_ unit: [String: Any], unitId: Int) {
        let id = (unit["id"] as? Int) ?? (unit["unit_id"] as? Int) ?? 0
        if id != unitId {
            return
        }

        remainingSeconds = unit["remaining_seconds"] as? Int ?? 0

        let isOpenTime = (unit["open_time"] as? Int ?? 0) == 1
        openTimeActive = isOpenTime

        if isOpenTime {
            openTimeElapsed = unit["open_time_elapsed"] as? Int ?? 0
            openTimeAmount = unit["open_time_amount"] as? Double ?? 0.0
        } else {
            openTimeElapsed = 0
            openTimeAmount = 0
        }

        if remainingSeconds > 0 || isOpenTime {
            adminUnlocked = false
            resetExpiredState()
        }
    }

    private func startTicker() {
        tickerTask?.cancel()
        tickerTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                await self.tick()
            }
        }
    }

    private func tick() {
        if openTimeActive {
            openTimeElapsed += 1
        } else if remainingSeconds > 0 {
            remainingSeconds -= 1
            if adminUnlocked {
                adminUnlocked = false
            }
        } else if warningActive && warningSecondsLeft > 0 {
            warningSecondsLeft -= 1
        } else if !warningActive && remainingSeconds <= 0 && !adminUnlocked && !openTimeActive {
            beginShutdownWarning()
        }

        refreshDisplay()
    }

    private func beginShutdownWarning() {
        if warningActive {
            return
        }

        warningActive = true
        warningSecondsLeft = config?.graceSeconds ?? 60
        showUnlockButton = true
        flashActive = false
        setLockSession(active: true)
        triggerHapticWarning()
    }

    private func resetExpiredState() {
        warningActive = false
        warningSecondsLeft = config?.graceSeconds ?? 60
        showUnlockButton = false
        setLockSession(active: false)
    }

    private func performAdminUnlock() {
        adminUnlocked = true
        warningActive = false
        warningSecondsLeft = config?.graceSeconds ?? 60
        showUnlockButton = false
        refreshDisplay()
    }

    private func refreshDisplay() {
        flashActive = remainingSeconds > 0 && remainingSeconds <= warningThresholdSeconds && !warningActive ? !flashActive : false

        if !isConnected {
            // Keep current state visible while disconnected.
        }

        if openTimeActive {
            visualState = .openTime
            isActiveSession = true
            timerText = formatTime(openTimeElapsed)
            statusText = "OPEN TIME"
            messageText = String(format: "Amount: PHP %.2f", openTimeAmount)
            publishWidgetSnapshot()
            return
        }

        if warningActive {
            visualState = .locked
            isActiveSession = false
            timerText = formatTime(warningSecondsLeft)
            statusText = "SESSION LOCKED"
            messageText = "Please insert coin to unlock this unit or it will shutdown in \(warningSecondsLeft)s."
            showUnlockButton = true
            setLockSession(active: true)
            publishWidgetSnapshot()
            return
        }

        if adminUnlocked && remainingSeconds <= 0 {
            visualState = .critical
            isActiveSession = false
            timerText = "00:00"
            statusText = "ADMIN UNLOCK"
            messageText = "Admin override active. Add time to resume normal session."
            publishWidgetSnapshot()
            return
        }

        if remainingSeconds <= 0 {
            visualState = .critical
            isActiveSession = false
            timerText = "00:00"
            statusText = "TIME EXPIRED"
            messageText = "Locking screen..."
            publishWidgetSnapshot()
            return
        }

        if remainingSeconds <= criticalThresholdSeconds {
            visualState = .critical
            isActiveSession = true
            timerText = formatTime(remainingSeconds)
            statusText = "WARNING: SAVE YOUR WORK"
            messageText = "Add time now to avoid lock and shutdown."
            publishWidgetSnapshot()
            return
        }

        if remainingSeconds <= warningThresholdSeconds {
            visualState = .lowTime
            isActiveSession = true
            timerText = formatTime(remainingSeconds)
            statusText = "LOW TIME"
            messageText = "Time is almost up. Insert coin soon."
            publishWidgetSnapshot()
            return
        }

        visualState = .normal
        isActiveSession = true
        timerText = formatTime(remainingSeconds)
        statusText = "Active Session"
        messageText = ""
        publishWidgetSnapshot()
    }

    private func setLockSession(active: Bool) {
        if isLockSession == active {
            return
        }

        isLockSession = active

        #if os(iOS)
        UIApplication.shared.isIdleTimerDisabled = active
        if config?.requestGuidedAccessOnLock == true {
            UIAccessibility.requestGuidedAccessSession(enabled: active) { success in
                if !success && active {
                    print("Guided Access request was not accepted.")
                }
            }
        }
        #endif
    }

    private func publishWidgetSnapshot() {
        guard let cfg = config else {
            return
        }

        let snapshot = WidgetSnapshot(
            unitId: cfg.unitId,
            timerText: timerText,
            statusText: statusText,
            messageText: messageText,
            visualState: visualStateKey(visualState),
            isConnected: isConnected,
            isActiveSession: isActiveSession,
            isLockSession: isLockSession,
            updatedAt: Date().timeIntervalSince1970
        )

        guard let defaults = UserDefaults(suiteName: appGroupId),
              let data = try? JSONEncoder().encode(snapshot)
        else {
            return
        }

        defaults.set(data, forKey: widgetSnapshotKey)
        defaults.synchronize()

        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    private func visualStateKey(_ state: OverlayVisualState) -> String {
        switch state {
        case .normal:
            return "normal"
        case .lowTime:
            return "lowTime"
        case .critical:
            return "critical"
        case .locked:
            return "locked"
        case .openTime:
            return "openTime"
        }
    }

    private func formatTime(_ seconds: Int) -> String {
        let safe = max(0, seconds)
        let minutes = safe / 60
        let secs = safe % 60
        return String(format: "%02d:%02d", minutes, secs)
    }

    private func triggerHapticWarning() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.warning)
    }

    private func detectUnitFromIpRange() -> Int? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?

        guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else {
            return nil
        }

        defer {
            freeifaddrs(ifaddr)
        }

        for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
            let interface = ptr.pointee
            let addrFamily = interface.ifa_addr.pointee.sa_family
            if addrFamily == UInt8(AF_INET) {
                var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                getnameinfo(interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len), &hostname, socklen_t(hostname.count), nil, socklen_t(0), NI_NUMERICHOST)
                let ip = String(cString: hostname)
                if ip.hasPrefix("192.168.254.") {
                    address = ip
                    break
                }
            }
        }

        guard let ip = address,
              let last = Int(ip.split(separator: ".").last ?? "")
        else {
            return nil
        }

        if (151...160).contains(last) {
            return last - 150
        }

        return nil
    }
}
