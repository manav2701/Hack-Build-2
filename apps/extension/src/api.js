/**
 * Backend calls, shared by the popup and the service worker.
 *
 * The session token lives in `chrome.storage.local` rather than `localStorage`: the
 * popup is torn down every time it closes and the service worker is evicted when idle,
 * so neither has a persistent JS context to hold it in. `chrome.storage` is also the
 * only store both contexts can see.
 */

import { API_BASE, DALAL_KEY, STORAGE } from './config.js';

export async function getStored(keys) {
  return chrome.storage.local.get(keys);
}

export async function setStored(values) {
  return chrome.storage.local.set(values);
}

export async function getToken() {
  const stored = await getStored(STORAGE.token);
  return stored[STORAGE.token] || null;
}

export async function setSession(token, user) {
  await setStored({ [STORAGE.token]: token, [STORAGE.user]: user });
}

export async function clearSession() {
  await chrome.storage.local.remove([STORAGE.token, STORAGE.user]);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** `fetch` with the shared headers, JSON handling and a real Error on failure. */
export async function api(path, { method = 'GET', json, auth = true } = {}) {
  const headers = { 'X-Dalal-Key': DALAL_KEY };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch (err) {
    // A network-level failure and an HTTP error should surface the same way to callers.
    throw new ApiError('Cannot reach the DaleelBites backend.', 0);
  }

  const text = await response.text();
  let body = null;
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
  return body;
}

// -- accounts ---------------------------------------------------------------

export async function login(email, password) {
  const data = await api('/v1/auth/login', { method: 'POST', json: { email, password }, auth: false });
  await setSession(data.token, data.user);
  return data.user;
}

export async function signup(email, password, name) {
  const data = await api('/v1/auth/signup', {
    method: 'POST',
    json: { email, password, name },
    auth: false,
  });
  await setSession(data.token, data.user);
  return data.user;
}

/**
 * The signed-in user, or null.
 *
 * A rejected token is cleared rather than kept: otherwise every subsequent request for
 * the life of the install carries a header that can only ever 401.
 */
export async function me() {
  if (!(await getToken())) return null;
  try {
    const data = await api('/v1/auth/me');
    await setStored({ [STORAGE.user]: data.user });
    return data.user;
  } catch (err) {
    if (err.status === 401) await clearSession();
    return null;
  }
}

// -- research ---------------------------------------------------------------

export async function startResearch(dish, area = 'Dubai') {
  return api('/v1/tools/start_research', {
    method: 'POST',
    json: { session_id: 'daleelbites-extension', dish, mode: 'delivery', area },
  });
}

/**
 * The verdict for `jobId`, or null while it is still running.
 *
 * The backend answers 200 `{status:"running"}` before the pipeline finishes — never a
 * 404 — so "not ready" is an ordinary body to branch on, not an error to catch.
 */
export async function getVerdict(jobId) {
  const data = await api(`/v1/tools/get_verdict?job_id=${encodeURIComponent(jobId)}`);
  if (data?.status === 'done' || data?.pick) return data;
  return null;
}

export async function history(limit = 10) {
  const data = await api(`/v1/auth/history?limit=${limit}`);
  return data.jobs || [];
}
