/**
 * The one place that knows where the backend is and what a call to it looks like.
 *
 * `NEXT_PUBLIC_API_URL` is inlined at BUILD time, so a bad value is baked into the
 * deployed bundle and every request fails silently from then on — the UI just never
 * updates, which reads as "the app is broken" rather than "the config is wrong". Two
 * values are therefore rejected in favour of the known-good default:
 *
 *   * a **placeholder** copied out of .env.example. A Vercel deployment ran for days
 *     with `https://<your-railway-app-url>.up.railway.app` baked in; nothing could
 *     reach the backend and the verdict panel sat empty forever.
 *   * a **localhost** URL, unless the page is itself served from localhost. A build
 *     carrying a developer's local URL ships a site that can only ever talk to a
 *     machine that isn't there.
 *
 * Anything else is honoured — pointing a build at a staging backend must still work.
 */

export const RAILWAY_API = 'https://hack-build-2-production.up.railway.app';

/** True when `value` could not possibly be a reachable backend. */
function isUnusableUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return true; // not a URL at all
  }
  if (!/^https?:$/.test(parsed.protocol)) return true;

  const host = parsed.hostname;
  // Placeholder markers: angle brackets survive in the hostname of
  // "https://<your-railway-app-url>.up.railway.app", and "your-" is the convention
  // .env.example uses for every fill-me-in value.
  if (/[<>{}\s]/.test(value) || /(^|\.)your-|example\.com$|changeme/i.test(host)) return true;
  // A bare word with no dot is not a deployable host (localhost is handled separately).
  if (!host.includes('.') && !/^localhost$/i.test(host)) return true;

  return false;
}

function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return RAILWAY_API;

  if (isUnusableUrl(configured)) {
    // Loud, because the symptom (a UI that never updates) points nowhere near the cause.
    if (typeof console !== 'undefined') {
      console.error(
        `[DaleelBites] NEXT_PUBLIC_API_URL is not a usable backend URL (${configured}). ` +
          `Falling back to ${RAILWAY_API}. Fix or remove the variable in your deployment.`
      );
    }
    return RAILWAY_API;
  }

  // A local API is only reachable from a local page.
  if (/localhost|127\.0\.0\.1/.test(configured)) {
    if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
      return configured;
    }
    return RAILWAY_API;
  }

  return configured;
}

export const API_BASE = resolveApiBase();

/** Shared secret for the `/v1/tools/*` webhook surface (not user auth). */
export const DALAL_KEY = process.env.NEXT_PUBLIC_DALAL_KEY || 'dalal-secret-123';

const TOKEN_STORAGE_KEY = 'daleelbites.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be denied outright (private mode, blocked cookies). An anonymous
    // session is a working session here, so this is not worth surfacing.
    return null;
  }
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* see getToken */
  }
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return {
    'X-Dalal-Key': DALAL_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * `fetch` with the shared headers, JSON handling and a real Error on a 4xx/5xx.
 *
 * The backend answers auth failures with `{detail: "..."}`; that message is written
 * for a person, so it is what surfaces in the UI rather than a generic string.
 */
export async function api<T = any>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, ...rest } = options;

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: authHeaders({
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...((headers as Record<string, string>) || {}),
    }),
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const detail =
      (body && typeof body === 'object' && (body.detail || body.message)) ||
      (typeof body === 'string' && body) ||
      `Request failed (${response.status})`;
    throw new ApiError(String(detail), response.status);
  }
  return body as T;
}
