import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Cache window for every fetch. NEVER pass 0: cache-bypass forces a cold render of a
# JS-heavy delivery-app page, which times out (Cloudflare 524) or serves the
# location-gated homepage. Verified 2026-08-08 — docs/VENDOR-CONTRACTS.md §0.3.
DAY_MS = 86_400_000

# A Talabat restaurant URL without a valid ``?aid=<areaId>`` 302s to the homepage
# location-picker, yet still answers HTTP 200 with ~4KB of homepage markdown and zero
# prices. Detecting that sentinel is the only way to tell this silent failure from a
# genuine empty menu (docs/VENDOR-CONTRACTS.md §0.2).
LOCATION_GATE_SENTINEL = "Fast delivery of food, groceries and more"


def is_location_gated(text: str) -> bool:
    """True when a fetch was silently redirected to the app's location picker."""
    return bool(text) and LOCATION_GATE_SENTINEL in text


class ContextDevClient:
    """Client wrapper for context.dev web scraping and extraction APIs.

    Endpoints are verified against the primary docs AND a live spike — see
    docs/VENDOR-CONTRACTS.md. (Previously this called a non-existent ``POST /scrape``
    that 404s; the correct endpoints are ``GET /web/scrape/markdown`` and ``POST /web/extract``.)

    Spike note: ``/web/extract`` on a SEARCH url returns nothing useful and wanders to
    unrelated pages; on a single PRODUCT url with ``maxPages=1`` it returns clean structured
    fields. So ``extract`` defaults to ``max_pages=1``.
    """

    def __init__(self, api_key: str = settings.CONTEXT_DEV_API_KEY):
        self.api_key = api_key
        self.base_url = "https://api.context.dev/v1"
        # A browser UA avoids the Cloudflare edge block (error 1010) that rejects default
        # library user-agents before the request ever reaches the context.dev API.
        self._headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
        }

    def is_live(self) -> bool:
        """True only when a real key is configured and fixtures aren't forced.

        When False, callers should return clearly-labelled fixture data
        (``is_fixture=True``) — never present it as a live fetch.
        """
        return (
            bool(self.api_key)
            and not self.api_key.startswith("ctxt_demo")
            and not settings.USE_FIXTURES
        )

    async def scrape_markdown(self, url: str, max_age_ms: int = DAY_MS, wait_for_ms: int = 0,
                              main_content_only: bool = True) -> str:
        """GET /web/scrape/markdown — fast single-page markdown (reviews/community/warranty).

        Pass a large ``max_age_ms`` (or pre-warm the URL before the demo) so the on-stage
        fetch is a fast warm-cache hit rather than a cold several-second scrape. For pages
        whose content is JS-rendered (e.g. search grids) pass ``wait_for_ms`` and
        ``main_content_only=False``.
        """
        if not self.is_live():
            return f"[FIXTURE] Simulated markdown content for {url}"

        params = {"url": url, "useMainContentOnly": str(main_content_only).lower(), "maxAgeMs": max_age_ms}
        if wait_for_ms:
            params["waitForMs"] = wait_for_ms
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{self.base_url}/web/scrape/markdown", headers=self._headers, params=params)
        if resp.status_code == 200:
            return resp.json().get("markdown", "")
        logger.warning("context.dev scrape failed %s: HTTP %s", url, resp.status_code)
        return f"[context.dev error {resp.status_code}] {url}"

    async def search(
        self,
        query: str,
        num_results: int = 10,
        include_domains: Optional[list] = None,
        country: str = "ae",
    ) -> list:
        """POST /web/search — find real URLs from a natural-language craving.

        This endpoint is why Dalal needs no pinned demo URLs. It also returns Talabat
        restaurant links **with the ``?aid=<areaId>`` already attached**, which is the only
        way past Talabat's location gate (the area id is not transferable between
        restaurants — see docs/VENDOR-CONTRACTS.md §0.2).

        Returns the raw result dicts (``url``/``title``/``snippet``); [] on failure.
        """
        if not self.is_live():
            return []

        body = {"query": query, "numResults": num_results, "country": country}
        if include_domains:
            body["includeDomains"] = include_domains
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(f"{self.base_url}/web/search", headers=self._headers, json=body)
        except Exception as exc:
            logger.warning("context.dev search error %r: %s", query, exc)
            return []
        if resp.status_code == 200:
            return resp.json().get("results") or []
        logger.warning("context.dev search failed %r: HTTP %s", query, resp.status_code)
        return []

    async def screenshot(self, url: str, max_age_ms: int = DAY_MS, wait_for_ms: int = 4_000) -> Optional[str]:
        """GET /web/screenshot — returns a hosted PNG url for the page, or None.

        Verified live: responds ``{status, domain, screenshot, ...}``. Note this is a GET
        with ``directUrl``; the ``POST /web/screenshot`` path assumed by the original plan
        does not exist (403).
        """
        if not self.is_live():
            return None
        params = {"directUrl": url, "maxAgeMs": max_age_ms, "waitForMs": wait_for_ms,
                  "handleCookiePopup": "true"}
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.get(f"{self.base_url}/web/screenshot", headers=self._headers, params=params)
        except Exception as exc:
            logger.warning("context.dev screenshot error %s: %s", url, exc)
            return None
        if resp.status_code == 200:
            return resp.json().get("screenshot")
        logger.warning("context.dev screenshot failed %s: HTTP %s", url, resp.status_code)
        return None

    async def brand(self, domain: str) -> dict:
        """POST /brand/retrieve — logo + colour palette for a delivery app / restaurant domain.

        Verified live: ``{"type": "by_domain", "domain": ...}`` returns ``{brand: {logos, colors, ...}}``.
        (The ``POST /brand`` path assumed by the original plan does not exist.)
        """
        if not self.is_live():
            return {}
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(f"{self.base_url}/brand/retrieve", headers=self._headers,
                                         json={"type": "by_domain", "domain": domain})
        except Exception as exc:
            logger.warning("context.dev brand error %s: %s", domain, exc)
            return {}
        if resp.status_code == 200:
            return resp.json().get("brand") or {}
        logger.warning("context.dev brand failed %s: HTTP %s", domain, resp.status_code)
        return {}

    async def extract(
        self,
        url: str,
        schema: dict,
        instructions: str,
        max_age_ms: int = DAY_MS,
        max_pages: int = 1,
        stop_after_ms: int = 40_000,
    ) -> Optional[dict]:
        """POST /web/extract — schema-guided structured extraction of ONE product page.

        Returns the ``data`` object matching ``schema``, or None on failure / fixture mode.
        ``max_pages=1`` keeps extraction on the given product URL (a higher value makes the
        crawler follow links off-page — verified in the spike). Payload shape confirmed live
        (docs/VENDOR-CONTRACTS.md §1.2): ``{status, url, urls_analyzed, data, metadata, key_metadata}``.
        """
        if not self.is_live():
            return None

        body = {
            "url": url,
            "schema": schema,
            "instructions": instructions,
            "maxAgeMs": max_age_ms,
            "maxPages": max_pages,
            "stopAfterMs": stop_after_ms,
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(f"{self.base_url}/web/extract", headers=self._headers, json=body)
        if resp.status_code == 200:
            return resp.json().get("data")
        logger.warning("context.dev extract failed %s: HTTP %s", url, resp.status_code)
        return None


context_client = ContextDevClient()
