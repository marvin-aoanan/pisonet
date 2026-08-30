import Foundation

struct AppConfig: Codable, Equatable {
    var unitId: Int
    var serverHost: String
    var wsPort: Int
    var apiPort: Int
    var graceSeconds: Int
    var unlockPassword: String
    var requestGuidedAccessOnLock: Bool

    static let `default` = AppConfig(
        unitId: 1,
        serverHost: "192.168.254.102",
        wsPort: 5001,
        apiPort: 5001,
        graceSeconds: 60,
        unlockPassword: "",
        requestGuidedAccessOnLock: true
    )

    enum CodingKeys: String, CodingKey {
        case unitId
        case serverHost
        case wsPort
        case apiPort
        case graceSeconds
        case unlockPassword
        case requestGuidedAccessOnLock
    }

    init(
        unitId: Int,
        serverHost: String,
        wsPort: Int,
        apiPort: Int,
        graceSeconds: Int,
        unlockPassword: String,
        requestGuidedAccessOnLock: Bool
    ) {
        self.unitId = unitId
        self.serverHost = serverHost
        self.wsPort = wsPort
        self.apiPort = apiPort
        self.graceSeconds = graceSeconds
        self.unlockPassword = unlockPassword
        self.requestGuidedAccessOnLock = requestGuidedAccessOnLock
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        unitId = try container.decode(Int.self, forKey: .unitId)
        serverHost = try container.decode(String.self, forKey: .serverHost)
        wsPort = try container.decode(Int.self, forKey: .wsPort)
        apiPort = try container.decode(Int.self, forKey: .apiPort)
        graceSeconds = try container.decode(Int.self, forKey: .graceSeconds)
        unlockPassword = try container.decodeIfPresent(String.self, forKey: .unlockPassword) ?? ""
        requestGuidedAccessOnLock = try container.decodeIfPresent(Bool.self, forKey: .requestGuidedAccessOnLock) ?? true
    }
}
