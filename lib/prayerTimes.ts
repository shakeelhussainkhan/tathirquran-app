import { Coordinates, CalculationMethod, PrayerTimes } from 'adhan';

export function calculatePrayerTimes(latitude: number, longitude: number, date: Date) {
  const coords = new Coordinates(latitude, longitude);
  const params = CalculationMethod.Tehran();
  const times = new PrayerTimes(coords, date, params);
  return {
    fajr: times.fajr,
    sunrise: times.sunrise,
    dhuhr: times.dhuhr,
    asr: times.asr,
    maghrib: times.maghrib,
    isha: times.isha,
  };
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
