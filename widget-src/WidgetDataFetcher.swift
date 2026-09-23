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
