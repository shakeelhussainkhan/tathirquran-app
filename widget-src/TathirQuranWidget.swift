import WidgetKit
import SwiftUI

struct TathirQuranEntry: TimelineEntry {
    let date: Date
    let arabic: String
    let translation: String
    let surahRef: String
    let hijriDate: String
}

struct TathirQuranProvider: TimelineProvider {
    func placeholder(in context: Context) -> TathirQuranEntry {
        TathirQuranEntry(
            date: Date(),
            arabic: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ",
            translation: "All praise is due to Allah, the Lord of the Worlds.",
            surahRef: "AL-FATIHAH 1:2",
            hijriDate: "Rabi al-Awwal 1448"
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (TathirQuranEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TathirQuranEntry>) -> Void) {
        Task {
            do {
                let data = try await WidgetDataFetcher.shared.fetchTodayAyah()
                let entry = TathirQuranEntry(
                    date: Date(),
                    arabic: data.arabic,
                    translation: data.translation,
                    surahRef: "\(data.surahName.uppercased()) \(data.surahNumber):\(data.ayahNumber)",
                    hijriDate: data.hijriDate
                )
                let midnight = Calendar.current.startOfDay(for: Date().addingTimeInterval(86400))
                let timeline = Timeline(entries: [entry], policy: .after(midnight))
                completion(timeline)
            } catch {
                completion(Timeline(entries: [placeholder(in: context)], policy: .after(Date().addingTimeInterval(3600))))
            }
        }
    }
}

// MARK: - Lock Screen Widget View

struct TathirQuranLockScreenView: View {
    let entry: TathirQuranEntry

    var body: some View {
        ZStack {
            Color(red: 0.98, green: 0.96, blue: 0.92)

            VStack(spacing: 4) {
                Text(entry.arabic)
                    .font(.custom("AmiriQuran", size: 14))
                    .environment(\.layoutDirection, .rightToLeft)
                    .multilineTextAlignment(.center)
                    .foregroundColor(Color(red: 0.05, green: 0.04, blue: 0.02))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)

                Text(entry.translation)
                    .font(.system(size: 9, weight: .light, design: .serif))
                    .italic()
                    .foregroundColor(Color(red: 0.1, green: 0.12, blue: 0.03))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)

                Text(entry.surahRef)
                    .font(.system(size: 7, weight: .regular))
                    .foregroundColor(Color(red: 0.79, green: 0.64, blue: 0.15))
                    .kerning(1)
            }
            .padding(8)
        }
    }
}

// MARK: - Home Screen Medium Widget View

struct TathirQuranMediumView: View {
    let entry: TathirQuranEntry

    var body: some View {
        ZStack {
            Color(red: 0.98, green: 0.96, blue: 0.92)

            VStack(spacing: 0) {
                Rectangle()
                    .fill(Color(red: 0.79, green: 0.64, blue: 0.15))
                    .frame(height: 2)

                VStack(spacing: 6) {
                    Text(entry.arabic)
                        .font(.custom("AmiriQuran", size: 20))
                        .environment(\.layoutDirection, .rightToLeft)
                        .multilineTextAlignment(.center)
                        .foregroundColor(Color(red: 0.05, green: 0.04, blue: 0.02))
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)

                    HStack(spacing: 8) {
                        Rectangle()
                            .fill(Color(red: 0.79, green: 0.64, blue: 0.15).opacity(0.4))
                            .frame(width: 24, height: 0.5)
                        Text("◆")
                            .font(.system(size: 6))
                            .foregroundColor(Color(red: 0.79, green: 0.64, blue: 0.15))
                        Rectangle()
                            .fill(Color(red: 0.79, green: 0.64, blue: 0.15).opacity(0.4))
                            .frame(width: 24, height: 0.5)
                    }

                    Text(entry.translation)
                        .font(.system(size: 11, weight: .light, design: .serif))
                        .italic()
                        .foregroundColor(Color(red: 0.1, green: 0.12, blue: 0.03))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)

                    Text(entry.surahRef)
                        .font(.system(size: 8, weight: .regular))
                        .foregroundColor(Color(red: 0.79, green: 0.64, blue: 0.15))
                        .kerning(1.5)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)

                Rectangle()
                    .fill(Color(red: 0.79, green: 0.64, blue: 0.15))
                    .frame(height: 2)
            }
        }
    }
}

// MARK: - Widget Entry Point

@main
struct TathirQuranWidget: Widget {
    let kind: String = "TathirQuranWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TathirQuranProvider()) { entry in
            TathirQuranMediumView(entry: entry)
                .widgetURL(URL(string: "tathirquran://today"))
        }
        .configurationDisplayName("TathirQuran")
        .description("Daily Quran verse with Shia translation")
        .supportedFamilies([
            .systemMedium,
            .systemLarge,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}
