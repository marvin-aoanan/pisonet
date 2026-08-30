import SwiftUI

@main
struct PisoNetTimerOverlayApp: App {
    @StateObject private var overlayService = OverlayService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(overlayService)
                .onAppear {
                    #if os(iOS)
                    UIApplication.shared.isIdleTimerDisabled = false
                    #endif
                }
        }
    }
}
