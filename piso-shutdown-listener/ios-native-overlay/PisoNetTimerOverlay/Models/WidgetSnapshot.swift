import Foundation

struct WidgetSnapshot: Codable {
    var unitId: Int
    var timerText: String
    var statusText: String
    var messageText: String
    var visualState: String
    var isConnected: Bool
    var isActiveSession: Bool
    var isLockSession: Bool
    var updatedAt: TimeInterval

    static let defaults = WidgetSnapshot(
        unitId: 0,
        timerText: "--:--",
        statusText: "Disconnected",
        messageText: "",
        visualState: "normal",
        isConnected: false,
        isActiveSession: false,
        isLockSession: false,
        updatedAt: Date().timeIntervalSince1970
    )
}
