// Qibla calculations — pure geography, no religious text.
//
// The direction to the Kaaba from any point on Earth is the initial
// bearing of the great-circle path to the Kaaba's coordinates. This is
// the standard formula used by prayer-time libraries (cross-checked in
// scripts/verify-qibla.js against the `adhan` package's Qibla() and
// published bearings for known cities).

export const KAABA_LATITUDE = 21.4225;
export const KAABA_LONGITUDE = 39.8262;

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Normalise any angle to the range [0, 360). */
export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Initial great-circle bearing from (latitude, longitude) to the Kaaba,
 * in degrees clockwise from true north, in the range [0, 360).
 *
 *   y = sin(Δλ)
 *   x = cos(φ1)·tan(φ2) − sin(φ1)·cos(Δλ)
 *   θ = atan2(y, x)
 */
export function qiblaBearing(latitude: number, longitude: number): number {
  const phi1 = toRadians(latitude);
  const phi2 = toRadians(KAABA_LATITUDE);
  const deltaLambda = toRadians(KAABA_LONGITUDE - longitude);

  const y = Math.sin(deltaLambda);
  const x =
    Math.cos(phi1) * Math.tan(phi2) - Math.sin(phi1) * Math.cos(deltaLambda);

  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

/** Great-circle (haversine) distance to the Kaaba, in kilometres. */
export function distanceToKaabaKm(latitude: number, longitude: number): number {
  const phi1 = toRadians(latitude);
  const phi2 = toRadians(KAABA_LATITUDE);
  const deltaPhi = phi2 - phi1;
  const deltaLambda = toRadians(KAABA_LONGITUDE - longitude);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

const CARDINALS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/** 16-wind compass point for a bearing, e.g. 19.5 -> "NNE". */
export function cardinalDirection(bearing: number): string {
  const index = Math.round(normalizeDegrees(bearing) / 22.5) % 16;
  return CARDINALS[index];
}

/**
 * Signed smallest angle from the device heading to the qibla bearing,
 * in the range (-180, 180]. Positive means the qibla is to the right
 * (clockwise) of where the device is pointing.
 */
export function relativeBearing(qibla: number, heading: number): number {
  const diff = normalizeDegrees(qibla - heading);
  return diff > 180 ? diff - 360 : diff;
}

/** e.g. 13206.4 -> "13,206 km" */
export function formatDistanceKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`;
}
