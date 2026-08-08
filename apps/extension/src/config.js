/**
 * Deployment constants for the extension.
 *
 * The production API URL is hardcoded rather than configurable. An extension has no
 * build step and no env file, and `host_permissions` in the manifest must name the
 * exact origin anyway — a URL the user could edit at runtime would simply be blocked
 * by the manifest. To point a build at a different backend, change BOTH this constant
 * and the `host_permissions` entry in manifest.json.
 */
export const API_BASE = 'https://hack-build-2-production.up.railway.app';

/** Shared secret for the /v1/tools/* surface. Not user auth — that is a bearer token. */
export const DALAL_KEY = 'dalal-secret-123';

/** Where the full experience lives; the side panel links out to it. */
export const WEB_APP = 'https://hack-build-2.vercel.app';

/**
 * The ElevenLabs voice agent.
 *
 * A public identifier, not a secret — the web app already ships it to every browser as
 * NEXT_PUBLIC_ELEVENLABS_AGENT_ID, and the agent is public, so `startSession` needs no
 * signed URL. If you make the agent private, this has to become a token minted by the
 * backend instead.
 */
export const AGENT_ID = 'agent_1401kzetahref6nb0pvsc85ennaf';

/** chrome.storage.local keys, named in one place so nothing drifts. */
export const STORAGE = {
  token: 'daleelbites.token',
  user: 'daleelbites.user',
  lastJob: 'daleelbites.lastJob',
  lastVerdict: 'daleelbites.lastVerdict',
  lastCraving: 'daleelbites.lastCraving',
};

/**
 * Hosts an order link may point at — the same allow-list the web app enforces.
 *
 * The deep link in a verdict originates from an LLM turn over scraped page content, so
 * it is untrusted input. Without this gate a prompt injection hidden in a menu or a
 * review could send a click anywhere.
 */
export const ALLOWED_ORDER_HOSTS = [
  'talabat.com',
  'deliveroo.ae',
  'deliveroo.com',
  'eateasy.ae',
  'noon.com',
  'food.noon.com',
  'careem.com',
];

/** True when `url` is an https link to a known delivery app. */
export function isSafeOrderUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  // Anchored on a dot so "eviltalabat.com" cannot pass as "talabat.com".
  return ALLOWED_ORDER_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}
