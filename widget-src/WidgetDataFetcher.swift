import Foundation

struct AyahData: Codable {
    let arabic: String
    let translation: String
    let surahName: String
    let surahNumber: Int
    let ayahNumber: Int
    let scholarName: String
    let hijriDate: String
}

class WidgetDataFetcher {
    static let shared = WidgetDataFetcher()

    func fetchTodayAyah() async throws -> AyahData {
        guard let url = URL(string: "https://tathirquran.com/api/today") else {
            throw URLError(.badURL)
        }

        let (data, _) = try await URLSession.shared.data(from: url)
        let json = try JSONDecoder().decode(TodayAPIResponse.self, from: data)

        return AyahData(
            arabic: json.ayah.arabic_uthmani,
            translation: json.translation.text,
            surahName: json.surah.name_english,
            surahNumber: json.ayah.surah_number,
            ayahNumber: json.ayah.ayah_number,
            scholarName: json.translation.scholar_name,
            hijriDate: json.hijri_date
        )
    }
}

struct TodayAPIResponse: Codable {
    let ayah: AyahResponse
    let surah: SurahResponse
    let translation: TranslationResponse
    let hijri_date: String
}

struct AyahResponse: Codable {
    let arabic_uthmani: String
    let surah_number: Int
    let ayah_number: Int
}

struct SurahResponse: Codable {
    let name_english: String
}

struct TranslationResponse: Codable {
    let text: String
    let scholar_name: String
}

// MARK: - Nahjul Balagha quotes (bundled, offline)

struct NahjulBalaghaQuote: Codable {
    let number: Int
    let text: String
    let sourceUrl: String
}

struct NahjulBalaghaQuotesFile: Codable {
    let sayings: [NahjulBalaghaQuote]
}

extension WidgetDataFetcher {
    /// Today's Nahjul Balagha quote from the bundled JSON. The plugin
    /// (plugins/withTathirQuranWidget.js) copies the app's canonical
    /// lib/nahjulBalaghaQuotes.json into this widget target at prebuild —
    /// one source of truth for app + widget. (There is no App Group in
    /// this project; the widget's data channels are the /api/today fetch
    /// and files the plugin copies in.)
    ///
    /// Selection mirrors lib/nahjulBalagha.ts exactly: index = (whole days
    /// since 1970-01-01 UTC) mod count — the same UTC-date basis as the
    /// ayah of the day, so app and widget always agree. Returns nil when
    /// the bundle is missing or empty; the widget then keeps its
    /// verse-only behaviour.
    func todayQuote() -> NahjulBalaghaQuote? {
        guard let url = Bundle.main.url(forResource: "nahjulBalaghaQuotes", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(NahjulBalaghaQuotesFile.self, from: data),
              !file.sayings.isEmpty else {
            return nil
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let components = calendar.dateComponents([.year, .month, .day], from: Date())
        guard let utcMidnight = calendar.date(from: components) else { return nil }
        let dayNumber = Int(floor(utcMidnight.timeIntervalSince1970 / 86400))
        let count = file.sayings.count
        let index = ((dayNumber % count) + count) % count
        return file.sayings[index]
    }
}
