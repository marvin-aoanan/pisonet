import WidgetKit
import SwiftUI

private let appGroupId = "group.com.pisonet.timeroverlay"
private let widgetSnapshotKey = "pisonet_widget_snapshot"

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

struct OverlayWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct OverlayWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> OverlayWidgetEntry {
        OverlayWidgetEntry(date: Date(), snapshot: .defaults)
    }

    func getSnapshot(in context: Context, completion: @escaping (OverlayWidgetEntry) -> Void) {
        completion(OverlayWidgetEntry(date: Date(), snapshot: readSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OverlayWidgetEntry>) -> Void) {
        let entry = OverlayWidgetEntry(date: Date(), snapshot: readSnapshot())
        let next = Calendar.current.date(byAdding: .second, value: 30, to: Date()) ?? Date().addingTimeInterval(30)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func readSnapshot() -> WidgetSnapshot {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let data = defaults.data(forKey: widgetSnapshotKey),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else {
            return .defaults
        }

        return snapshot
    }
}

struct OverlayWidgetEntryView: View {
    var entry: OverlayWidgetProvider.Entry

    var body: some View {
        if entry.snapshot.isActiveSession {
            VStack(alignment: .leading, spacing: 6) {
                Text("PC \(entry.snapshot.unitId)")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text(entry.snapshot.timerText)
                    .font(.system(size: 32, weight: .bold, design: .monospaced))
                    .foregroundStyle(timerColor)

                Text(entry.snapshot.statusText)
                    .font(.caption)
                    .foregroundStyle(timerColor)

                HStack(spacing: 6) {
                    Circle()
                        .fill(entry.snapshot.isConnected ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                    Text(entry.snapshot.isConnected ? "Connected" : "Disconnected")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(12)
            .containerBackground(backgroundColor, for: .widget)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("PisoNet Timer")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("No active session")
                    .font(.headline)
                Text("Open app to monitor")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(12)
            .containerBackground(Color(.systemBackground), for: .widget)
        }
    }

    private var backgroundColor: Color {
        switch entry.snapshot.visualState {
        case "openTime":
            return Color(red: 0.1, green: 0.3, blue: 0.18)
        case "lowTime":
            return Color(red: 0.2, green: 0.13, blue: 0.0)
        case "critical", "locked":
            return Color(red: 0.23, green: 0.05, blue: 0.05)
        default:
            return Color(red: 0.01, green: 0.08, blue: 0.15)
        }
    }

    private var timerColor: Color {
        switch entry.snapshot.visualState {
        case "lowTime":
            return .orange
        case "critical", "locked":
            return .red
        default:
            return .green
        }
    }
}

struct PisoNetTimerWidget: Widget {
    let kind: String = "PisoNetTimerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: OverlayWidgetProvider()) { entry in
            OverlayWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("PisoNet Active Timer")
        .description("Shows timer on Home screen during active sessions.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct PisoNetTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        PisoNetTimerWidget()
    }
}
