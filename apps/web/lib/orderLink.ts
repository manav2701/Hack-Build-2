/**
 * Host allow-list for the `open_order_page` client tool.
 *
 * The voice agent hands us a URL and we navigate the user's browser to it. The URL
 * originates from an LLM turn, so it is untrusted input: without this gate a prompt
 * injection in a scraped menu or review could redirect the user anywhere. We therefore
 * allow ONLY the delivery apps we actually source offers from.
 */

// Matches DELIVERY_APPS in apps/api/app/adapters/registry.py — the only domains an
// offer's deep_link can legitimately point at.
export const ALLOWED_ORDER_HOSTS = ["talabat.com", "deliveroo.ae", "eateasy.ae"] as const;

export type OrderLinkCheck =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Validate a deep link before navigating.
 *
 * Host matching is anchored on a dot so a look-alike domain cannot pass: "eviltalabat.com"
 * ends with "talabat.com" as a plain string but is a different registrable domain.
 */
export function checkOrderLink(raw: unknown): OrderLinkCheck {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "no url supplied" };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, reason: `not a valid url: ${String(raw).slice(0, 80)}` };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: `refused non-https url (${parsed.protocol})` };
  }

  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_ORDER_HOSTS.some(
    (d) => host === d || host.endsWith(`.${d}`)
  );
  if (!allowed) {
    return { ok: false, reason: `refused host "${host}" — not a known delivery app` };
  }

  return { ok: true, url: parsed.toString() };
}
