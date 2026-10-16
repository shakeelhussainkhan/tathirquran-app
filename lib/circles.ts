import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceId } from './device';
import { localToday } from './streaks';

/**
 * Family circles — client for the web API in tathirquran-web
 * (app/api/circles/*) plus the local membership record.
 *
 * A circle is a small, trusted group whose members can see whether the
 * others have read today's verse. There is no account and no email:
 * this device's random UUID (lib/device.ts) plus the circle's invite
 * code are the whole identity model. Anyone who has the code can join
 * and see display names + read status — the Circles screen says this
 * plainly, and so does the API PR. Keep circles for family and close
 * friends, and share the code like a house key.
 *
 * Local state: AsyncStorage key `circle_membership`
 *   { circle_id, invite_code, name, display_name }
 * written only after the server confirms a create/join. Nothing about
 * other members is stored locally — the member list always comes from
 * the server, so what the screen shows is never stale demo data. If
 * the API is unreachable or not deployed yet (the tables come from
 * migration 014, which is run separately), calls fail with a
 * CirclesApiError and the screen shows an honest "Circles aren't
 * available yet" state.
 */

export const CIRCLE_MEMBERSHIP_KEY = 'circle_membership';

/** The website is the API host — the same base the iOS widget uses. */
export const CIRCLES_API_BASE = 'https://tathirquran.com';

const REQUEST_TIMEOUT_MS = 12000;

export interface CircleMembership {
  circle_id: string;
  invite_code: string;
  name: string;
  display_name: string;
}

export interface CircleMember {
  display_name: string;
  is_you: boolean;
  /** Present on the today/checkin responses; absent on join. */
  checked_in?: boolean;
}

export interface CircleToday {
  circle_id: string;
  name: string;
  invite_code: string;
  date: string;
  members: CircleMember[];
}

export interface CircleInfo {
  circle_id: string;
  name: string;
  invite_code: string;
  members: CircleMember[];
}

/**
 * An API failure the UI can act on. `status` is the HTTP status, or 0
 * when the request never completed (offline, timeout, non-JSON reply —
 * e.g. the route does not exist yet on the deployed site). `unavailable`
 * is true exactly for the cases where the honest message is "Circles
 * aren't available yet": no route / no tables / no connection.
 */
export class CirclesApiError extends Error {
  status: number;
  unavailable: boolean;

  constructor(message: string, status: number, unavailable?: boolean) {
    super(message);
    this.name = 'CirclesApiError';
    this.status = status;
    // "Unavailable" means the service itself is not there yet: no
    // connection (0), the API's own 503 (migration not run), or a 404
    // with no JSON error body (the route is not deployed — an old or
    // non-API 404 page). A 404 WITH a server message is a real answer
    // (e.g. join: "No circle found for that invite code") and must be
    // shown as-is, never masked as unavailability.
    this.unavailable = unavailable ?? (status === 0 || status === 503);
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${CIRCLES_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new CirclesApiError("Circles aren't available yet.", 0);
  } finally {
    clearTimeout(timer);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const serverMessage =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : '';
    throw new CirclesApiError(
      serverMessage || `Request failed (${res.status}).`,
      res.status,
      res.status === 503 || (res.status === 404 && !serverMessage)
    );
  }
  if (!data || typeof data !== 'object') {
    throw new CirclesApiError("Circles aren't available yet.", 0);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Membership (local record of what the server already confirmed)
// ---------------------------------------------------------------------------

export async function loadMembership(): Promise<CircleMembership | null> {
  try {
    const raw = await AsyncStorage.getItem(CIRCLE_MEMBERSHIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CircleMembership>;
    if (
      typeof parsed.circle_id !== 'string' ||
      typeof parsed.invite_code !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.display_name !== 'string' ||
      !parsed.circle_id ||
      !parsed.invite_code
    ) {
      return null;
    }
    return {
      circle_id: parsed.circle_id,
      invite_code: parsed.invite_code,
      name: parsed.name,
      display_name: parsed.display_name,
    };
  } catch {
    return null;
  }
}

export async function saveMembership(m: CircleMembership): Promise<void> {
  await AsyncStorage.setItem(CIRCLE_MEMBERSHIP_KEY, JSON.stringify(m));
}

/**
 * Leave = forget the membership on THIS device only. There is no
 * server-side leave in this minimal version: the member row (display
 * name + past check-ins) stays in the circle, which the Leave
 * confirmation in the UI states plainly.
 */
export async function clearMembership(): Promise<void> {
  await AsyncStorage.removeItem(CIRCLE_MEMBERSHIP_KEY);
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function createCircle(
  name: string,
  displayName: string
): Promise<CircleMembership> {
  const deviceId = await getDeviceId();
  const data = await apiRequest<{ circle_id: string; invite_code: string; name: string }>(
    '/api/circles',
    {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        display_name: displayName.trim(),
        device_id: deviceId,
      }),
    }
  );
  const membership: CircleMembership = {
    circle_id: data.circle_id,
    invite_code: data.invite_code,
    name: data.name,
    display_name: displayName.trim(),
  };
  await saveMembership(membership);
  return membership;
}

export async function joinCircle(
  inviteCode: string,
  displayName: string
): Promise<CircleMembership> {
  const deviceId = await getDeviceId();
  const data = await apiRequest<CircleInfo>('/api/circles/join', {
    method: 'POST',
    body: JSON.stringify({
      invite_code: inviteCode.trim().toUpperCase(),
      display_name: displayName.trim(),
      device_id: deviceId,
    }),
  });
  const membership: CircleMembership = {
    circle_id: data.circle_id,
    invite_code: data.invite_code,
    name: data.name,
    display_name: displayName.trim(),
  };
  await saveMembership(membership);
  return membership;
}

export async function fetchCircleToday(
  circleId: string,
  date: string = localToday()
): Promise<CircleToday> {
  const deviceId = await getDeviceId();
  const query =
    `device_id=${encodeURIComponent(deviceId)}` +
    `&date=${encodeURIComponent(date)}`;
  return apiRequest<CircleToday>(`/api/circles/${circleId}/today?${query}`);
}

export async function postCheckin(
  circleId: string,
  scheduleDate: string = localToday()
): Promise<CircleToday> {
  const deviceId = await getDeviceId();
  return apiRequest<CircleToday>('/api/circles/checkin', {
    method: 'POST',
    body: JSON.stringify({
      circle_id: circleId,
      device_id: deviceId,
      schedule_date: scheduleDate,
    }),
  });
}

/**
 * Fire-and-forget check-in used by the Today screen: if this device is
 * in a circle, record that today's verse was opened, for the LOCAL
 * date. Any failure (offline, API not deployed, membership removed
 * server-side) is silent by design — reading the verse must never
 * depend on the circle.
 */
export async function maybeCheckInToCircle(): Promise<boolean> {
  try {
    const membership = await loadMembership();
    if (!membership) return false;
    await postCheckin(membership.circle_id, localToday());
    return true;
  } catch {
    return false;
  }
}
