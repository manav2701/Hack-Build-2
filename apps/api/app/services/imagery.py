"""Order-page imagery — the picture that goes on the verdict card.

The card the user actually looks at needs a photo of the thing they are about to
order. Three layers, tried in order, each strictly more of a guess than the last:

  1. the dish photo the MENU page published next to that dish (context.dev
     extraction — see delivery_app.MENU_SCHEMA). This is the real item.
  2. the restaurant's own ``og:image`` / ``twitter:image``, read straight off the
     deep link we are about to send the user to. This is what the app itself
     shows as that page's picture, so it is still that restaurant, not stock art.
  3. nothing — ``image_url`` stays ``None`` and the client falls back to its own
     labelled artwork.

Layer 2 is a plain HTML GET, not a context.dev call: it costs no credits, and a
delivery app that blocks it simply yields ``None``, which is layer 3. Nothing
here may ever *invent* a URL; an absent photo is an honest absent photo.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Iterable, Optional
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)

# The og:image fetch sits on the critical path of a live craving, so it gets a short
# leash: a slow delivery-app render must cost us the picture, never the verdict.
OG_TIMEOUT_S = 6.0
OG_MAX_BYTES = 250_000          # og tags live in <head>; no need to read a whole SPA payload
OG_CONCURRENCY = 4

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# <meta property="og:image" content="..."> in either attribute order, plus the
# twitter:* and itemprop variants the delivery apps actually emit.
_META_IMAGE = re.compile(
    r"<meta[^>]+(?:property|name|itemprop)\s*=\s*[\"'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?|image)[\"'][^>]*>",
    re.IGNORECASE,
)
_CONTENT = re.compile(r"content\s*=\s*[\"']([^\"']+)[\"']", re.IGNORECASE)

# Logos/sprites/placeholders masquerading as a page image. A 1px tracking pixel or the
# app's own wordmark on a food card looks broken, so it is worse than no picture.
_JUNK_HINTS = ("sprite", "placeholder", "default-", "logo", "favicon", "icon-", "1x1", "blank.")

_IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".avif")


def is_usable_image(url: Optional[str]) -> bool:
    """True when ``url`` is an absolute http(s) image we are willing to render."""
    if not url or not isinstance(url, str):
        return False
    candidate = url.strip()
    if not candidate.lower().startswith(("http://", "https://")):
        return False
    if len(candidate) > 1000:
        return False
    lowered = candidate.lower()
    if any(hint in lowered for hint in _JUNK_HINTS):
        return False
    # A CDN URL often has no extension at all (query-string transforms), so an extension
    # is a bonus signal rather than a requirement — we only reject obvious non-images.
    path = urlparse(lowered).path
    if "." in path.rsplit("/", 1)[-1] and not path.endswith(_IMAGE_EXT):
        return False
    return True


def first_usable(*candidates: Optional[str]) -> Optional[str]:
    """The first candidate that survives :func:`is_usable_image`, else None."""
    for candidate in candidates:
        if is_usable_image(candidate):
            return candidate.strip()
    return None


async def og_image(url: str, client: Optional[httpx.AsyncClient] = None) -> Optional[str]:
    """The page's own social-preview image, or None.

    Never raises: every failure mode (block, timeout, no tag, junk tag) is the same
    answer — we do not have a picture for this page.
    """
    if not url or not url.startswith("http"):
        return None

    owns_client = client is None
    try:
        client = client or httpx.AsyncClient(
            timeout=OG_TIMEOUT_S, follow_redirects=True,
            headers={"User-Agent": _BROWSER_UA, "Accept": "text/html,application/xhtml+xml"},
        )
        try:
            resp = await client.get(url)
        finally:
            if owns_client:
                await client.aclose()
    except Exception as exc:  # noqa: BLE001 — imagery is never load-bearing
        logger.info("og:image fetch failed for %s: %r", url, exc)
        return None

    if resp.status_code != 200 or "html" not in resp.headers.get("content-type", "").lower():
        return None

    head = resp.text[:OG_MAX_BYTES]
    for tag in _META_IMAGE.findall(head):
        match = _CONTENT.search(tag)
        if not match:
            continue
        found = match.group(1).strip()
        # Protocol-relative and root-relative srcs are common; resolve against the page.
        if found.startswith("//"):
            found = f"https:{found}"
        elif found.startswith("/"):
            found = urljoin(url, found)
        if is_usable_image(found):
            return found
    return None


async def og_images(urls: Iterable[str]) -> dict:
    """``{url: image_url}`` for every url that had one, fetched concurrently.

    Bounded by :data:`OG_CONCURRENCY` so enriching a verdict never turns into a burst
    of requests at the delivery apps.
    """
    unique = list(dict.fromkeys(u for u in urls if u and u.startswith("http")))
    if not unique:
        return {}

    semaphore = asyncio.Semaphore(OG_CONCURRENCY)
    async with httpx.AsyncClient(
        timeout=OG_TIMEOUT_S, follow_redirects=True,
        headers={"User-Agent": _BROWSER_UA, "Accept": "text/html,application/xhtml+xml"},
    ) as client:

        async def one(target: str):
            async with semaphore:
                return target, await og_image(target, client=client)

        pairs = await asyncio.gather(*[one(u) for u in unique], return_exceptions=True)

    return {
        url: image
        for pair in pairs
        if not isinstance(pair, Exception)
        for url, image in [pair]
        if image
    }
