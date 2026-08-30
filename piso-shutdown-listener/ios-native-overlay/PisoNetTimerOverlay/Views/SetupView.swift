import SwiftUI

struct SetupView: View {
    @EnvironmentObject var service: OverlayService
    @Binding var isPresented: Bool

    @State private var unitId = ""
    @State private var serverHost = ""
    @State private var wsPort = "5001"
    @State private var apiPort = "5001"
    @State private var graceSeconds = "60"
    @State private var unlockPassword = ""
    @State private var requestGuidedAccessOnLock = true
    @State private var errorText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Connection") {
                    TextField("Unit ID", text: $unitId)
                        .keyboardType(.numberPad)
                    TextField("Server Host/IP", text: $serverHost)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    TextField("WebSocket Port", text: $wsPort)
                        .keyboardType(.numberPad)
                    TextField("API Port", text: $apiPort)
                        .keyboardType(.numberPad)
                }

                Section("Behavior") {
                    TextField("Grace Seconds", text: $graceSeconds)
                        .keyboardType(.numberPad)
                    SecureField("Unlock Password (optional)", text: $unlockPassword)
                    Toggle("Request Guided Access on Lock", isOn: $requestGuidedAccessOnLock)
                }

                if !errorText.isEmpty {
                    Section {
                        Text(errorText)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Overlay Setup")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                }
            }
            .onAppear {
                loadFromCurrentConfig()
            }
        }
    }

    private func loadFromCurrentConfig() {
        let cfg = service.config ?? AppConfig.default
        unitId = String(cfg.unitId)
        serverHost = cfg.serverHost
        wsPort = String(cfg.wsPort)
        apiPort = String(cfg.apiPort)
        graceSeconds = String(cfg.graceSeconds)
        unlockPassword = cfg.unlockPassword
        requestGuidedAccessOnLock = cfg.requestGuidedAccessOnLock
    }

    private func save() {
        guard let parsedUnit = Int(unitId), parsedUnit > 0,
              let parsedWs = Int(wsPort), parsedWs > 0,
              let parsedApi = Int(apiPort), parsedApi > 0,
              let parsedGrace = Int(graceSeconds), parsedGrace > 0
        else {
            errorText = "Please enter valid numeric values."
            return
        }

        let host = serverHost.trimmingCharacters(in: .whitespacesAndNewlines)
        if host.isEmpty {
            errorText = "Server host/IP is required."
            return
        }

        let cfg = AppConfig(
            unitId: parsedUnit,
            serverHost: host,
            wsPort: parsedWs,
            apiPort: parsedApi,
            graceSeconds: parsedGrace,
            unlockPassword: unlockPassword,
            requestGuidedAccessOnLock: requestGuidedAccessOnLock
        )

        service.saveAndConnect(cfg)
        errorText = ""
        isPresented = false
    }
}
