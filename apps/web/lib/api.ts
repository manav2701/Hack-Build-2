/**
 * The one place that knows where the backend is and what a call to it looks like.
 *
 * Base-URL rule: a `NEXT_PUBLIC_API_URL` pointing at localhost is ignored in the
 * browser. Vercel builds have repeatedly been produced with a developer's local URL
 * baked in, which ships a site that can only ever talk to a machine that isn't there.
 * A localhost value is honoured only when the page is itself being served from
 * localhost, i.e. when it is actually true.
 */

export const RAILWAY_API = 'https://hack-build-2-production.up.railway.app';

function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  const isLocal = /localhost|127\.0\.0\.1/.test(configured);

  if (!configured) return RAILWAY_API;
  if (!isLocal) return configured;

  // A local API is only reachable from a local page.
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return configured;
  }
  return RAILWAY_API;
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
