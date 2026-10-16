import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device identity for family circles — no account, no email.
 *
 * The app generates ONE random UUID v4 the first time it is needed and
 * keeps it in AsyncStorage under `device_id`. That UUID, together with
 * knowing a circle's invite code, is the whole identity model for
 * circles (see lib/circles.ts and the web API's security notes):
 *
 * - It identifies this device/install, not a person. Reinstalling the
 *   app (or clearing its data) creates a NEW identity, and the old
 *   membership simply stays behind under the old id.
 * - It is generated locally with a UUID v4 template over Math.random
 *   (the app has no crypto dependency, and adding one for this alone
 *   was not worth a native module). It is an identifier for a
 *   trusted-family feature — not a password and not proof of identity,
 *   and nothing sensitive is ever keyed on it.
 */

export const DEVICE_ID_KEY = 'device_id';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

/**
 * Generate a UUID v4 from the standard template. `random` is injectable
 * so the generator can be exercised in tests/harnesses.
 */
export function generateUuidV4(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedDeviceId: string | null = null;

/**
 * Get this device's circles identity, generating and storing one on
 * first use. A stored value that is not a well-formed UUID v4 (corrupt
 * or hand-edited storage) is replaced with a fresh one.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null);
  if (isUuidV4(stored)) {
    cachedDeviceId = stored;
    return stored;
  }
  const fresh = generateUuidV4();
  cachedDeviceId = fresh;
  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh).catch(() => {
    // Best effort: the in-memory copy still works for this session.
  });
  return fresh;
}
