import WidgetKit
import SwiftUI

struct TathirQuranEntry: TimelineEntry {
    enum Kind {
        case verse
        case quote
    }

    let date: Date
    let kind: Kind
    // Verse fields (empty for quote entries)
    let arabic: String
    let translation: String
    let surahRef: String
    let hijriDate: String
    // Quote fields (empty/0 for verse entries)
    let quoteText: String
    let quoteNumber: Int

    static func verse(date: Date, arabic: String, translation: String, surahRef: String, hijriDate: String) -> TathirQuranEntry {
        TathirQuranEntry(
            date: date, kind: .verse,
            arabic: arabic, translation: translation, surahRef: surahRef, hijriDate: hijriDate,
            quoteText: "", quoteNumber: 0
        )
    }

    static func quote(date: Date, quote: NahjulBalaghaQuote) -> TathirQuranEntry {
        TathirQuranEntry(
            date: date, kind: .quote,
            arabic: "", translation: "", surahRef: "", hijriDate: "",
            quoteText: quote.text, quoteNumber: quote.number
        )
    }
}

struct TathirQuranProvider: TimelineProvider {
    func placeholder(in context: Context) -> TathirQuranEntry {
        .verse(
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
                let calendar = Calendar.current
                let startOfDay = calendar.startOfDay(for: Date())
                let nextMidnight = calendar.date(byAdding: .day, value: 1, to: startOfDay)!

                func verseEntry(at date: Date) -> TathirQuranEntry {
                    .verse(
                        date: date,
                        arabic: data.arabic,
                        translation: data.translation,
                        surahRef: "\(data.surahName.uppercased()) \(data.surahNumber):\(data.ayahNumber)",
                        hijriDate: data.hijriDate
                    )
                }

                // Rotation (suggestion #8): across the day the widget
                // alternates verse and quote — verse at 00:00 and 12:00,
                // the day's Nahjul Balagha quote at 06:00 and 18:00. The
                // quote is the same one the app shows (same bundled data,
                // same UTC-day selection rule). When no quote data exists
                // the timeline is the verse alone, exactly as before.
                if let quote = WidgetDataFetcher.shared.todayQuote() {
                    func at(hour: Int) -> Date {
                        calendar.date(byAdding: .hour, value: hour, to: startOfDay)!
                    }
                    let entries: [TathirQuranEntry] = [
                        verseEntry(at: at(hour: 0)),
                        .quote(date: at(hour: 6), quote: quote),
                        verseEntry(at: at(hour: 12)),
                        .quote(date: at(hour: 18), quote: quote),
                    ]
                    completion(Timeline(entries: entries, policy: .after(nextMidnight)))
                } else {
                    completion(Timeline(entries: [verseEntry(at: Date())], policy: .after(nextMidnight)))
                }
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
                if entry.kind == .quote {
                    Text(entry.quoteText)
                        .font(.system(size: 9, weight: .light, design: .serif))
                        .italic()
                        .foregroundColor(Color(red: 0.1, green: 0.12, blue: 0.03))
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                        .minimumScaleFactor(0.7)

                    Text("NAHJUL BALAGHA · SAYING \(entry.quoteNumber)")
                        .font(.system(size: 7, weight: .regular))
                        .foregroundColor(Color(red: 0.79, green: 0.64, blue: 0.15))
                        .kerning(1)
                } else {
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

                if entry.kind == .quote {
                    quoteContent
                } else {
                    verseContent
                }

                Rectangle()
                    .fill(Color(red: 0.79, green: 0.64, blue: 0.15))
                    .frame(height: 2)
            }
        }
    }

    private var ornament: some View {
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
    }

    private var verseContent: some View {
        VStack(spacing: 6) {
            Text(entry.arabic)
                .font(.custom("AmiriQuran", size: 20))
                .environment(\.layoutDirection, .rightToLeft)
                .multilineTextAlignment(.center)
                .foregroundColor(Color(red: 0.05, green: 0.04, blue: 0.02))
                .lineLimit(2)
                .minimumScaleFactor(0.6)

            ornament

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
    }

    private var quoteContent: some View {
        VStack(spacing: 6) {
            Text("FROM NAHJUL BALAGHA")
                .font(.system(size: 8, weight: .regular))
                .foregroundColor(Color(red: 0.79, green: 0.64, blue: 0.15))
                .kerning(1.5)

            ornament

            Text(entry.quoteText)
                .font(.system(size: 11, weight: .light, design: .serif))
                .italic()
                .foregroundColor(Color(red: 0.1, green: 0.12, blue: 0.03))
                .multilineTextAlignment(.center)
                .lineLimit(4)
                .minimumScaleFactor(0.7)

            Text("SAYING \(entry.quoteNumber) — IMAM ALI IBN ABI TALIB (AS)")
                .font(.system(size: 8, weight: .regular))
                .foregroundColor(Color(red: 0.79, green: 0.64, blue: 0.15))
                .kerning(1)

            Text("Translation by Syed Ali Raza")
                .font(.system(size: 7, weight: .light, design: .serif))
                .italic()
                .foregroundColor(Color(red: 0.1, green: 0.12, blue: 0.03).opacity(0.7))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
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
