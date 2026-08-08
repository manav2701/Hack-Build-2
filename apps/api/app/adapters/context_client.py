import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


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

    async def scrape_markdown(self, url: str, max_age_ms: int = 60_000, wait_for_ms: int = 0,
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

    async def extract(
        self,
        url: str,
        schema: dict,
        instructions: str,
        max_age_ms: int = 60_000,
        max_pages: int = 1,
        stop_after_ms: int = 20_000,
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
