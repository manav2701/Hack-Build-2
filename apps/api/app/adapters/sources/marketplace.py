import asyncio
import time
import logging
from typing import List, Optional

from app.adapters.base import SourceAdapter
from app.domain.models import ProductQuery, SourceResult, Offer
from app.adapters.context_client import context_client
from app.adapters.registry import get_category_spec

logger = logging.getLogger(__name__)

# Schema handed to context.dev /web/extract for a single product page (verified live in the spike).
PRODUCT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "price_aed": {"type": "number"},
        "seller": {"type": "string"},
        "seller_is_official_or_third_party": {"type": "string"},
        "warranty": {"type": "string"},
        "availability": {"type": "string"},
    },
}
EXTRACT_INSTRUCTIONS = (
    "From this single product page, extract: the product title; the current price in AED as a number; "
    "the seller/store name; whether it is sold by the official store or a third-party marketplace seller; "
    "the warranty text (note local UAE vs international); and availability/stock status."
)

# Demo cache window: a fetch stays warm for 6h, so pre-warming the URLs before the demo makes the
# on-stage extract a fast warm-cache hit (still real — the UI shows the capture time). See VENDOR-CONTRACTS.md §1.4.
DEMO_MAX_AGE_MS = 6 * 60 * 60 * 1000


def _seller_type(raw: Optional[str], seller: Optional[str]) -> str:
    s = f"{raw or ''} {seller or ''}".lower()
    if "third" in s or "3rd" in s or "marketplace" in s:
        return "marketplace_3p"
    if "official" in s:
        return "official"
    if (seller or "").strip().lower() in ("amazon.ae", "amazon", "noon"):
        return "official"
    return "unknown"


# Labelled sample data — used ONLY when there's no live context.dev key or a live fetch fails.
# Never presented as live: SourceResult.is_fixture=True flows through to a UI "sample data" badge.
_FIXTURE_OFFERS = {
    "laptop": [
        Offer(title="Apple MacBook Air M3 15-inch 16GB 512GB", price_aed=4699.00, retailer="noon",
              url="https://www.noon.com/uae-en/macbook-air-m3-15/N70023451A/p/", seller="Noon",
              seller_type="official", warranty="1-year local UAE warranty", is_fixture=True),
        Offer(title="Lenovo Legion Slim 5 16\" Ryzen 7 16GB RTX 4060", price_aed=4350.00, retailer="amazon_ae",
              url="https://www.amazon.ae/dp/B0C77G17C4", seller="third-party",
              seller_type="marketplace_3p", warranty="Verify Middle East spec", is_fixture=True),
    ],
    "vacuum": [
        Offer(title="Dyson V15 Detect Cordless Vacuum", price_aed=2799.00, retailer="amazon_ae",
              url="https://www.amazon.ae/dp/B09575L21S", seller="Amazon.ae", seller_type="official",
              warranty="Dyson UAE Official 2-Year Warranty", is_fixture=True),
        Offer(title="Roborock S8 Robot Vacuum and Mop", price_aed=2399.00, retailer="noon",
              url="https://www.noon.com/uae-en/roborock-s8-robot-vacuum/N53392100A/p/", seller="Noon",
              seller_type="official", warranty="Noon 1-Year Express Warranty", is_fixture=True),
    ],
    "headphones": [
        Offer(title="Sony WH-1000XM5 Wireless Noise Canceling Headphones", price_aed=1149.00, retailer="noon",
              url="https://www.noon.com/uae-en/sony-wh-1000xm5/N53381240A/p/", seller="Noon Supermall",
              seller_type="official", warranty="1-Year Local Warranty (Jumbo)", is_fixture=True),
        Offer(title="Apple AirPods Max Wireless Over-Ear Headphones", price_aed=1899.00, retailer="amazon_ae",
              url="https://www.amazon.ae/dp/B08PZHYWJS", seller="Amazon.ae", seller_type="official",
              warranty="Apple 1-Year UAE Limited Warranty", is_fixture=True),
    ],
}


class MarketplaceAdapter(SourceAdapter):
    name = "marketplace"

    async def run(self, query: ProductQuery) -> SourceResult:
        start = time.perf_counter()
        spec = get_category_spec(query.category)
        product_urls = spec.product_urls or {}

        # Live path: extract each pinned product URL concurrently via context.dev.
        if context_client.is_live() and product_urls:
            offers, facts, citations = await self._live(product_urls)
            if offers:
                logger.info("marketplace: %d live offers for '%s'", len(offers), query.category)
                return SourceResult(
                    source="marketplace", status="ok" if len(offers) == len(product_urls) else "partial",
                    facts=facts, offers=offers, citations=citations, is_fixture=False,
                    latency_ms=int((time.perf_counter() - start) * 1000),
                )
            logger.warning("marketplace: live extraction yielded no offers; using labelled fixture")

        # Fixture fallback (no live key, no pinned URLs, or live fetch failed) — clearly labelled.
        offers = _FIXTURE_OFFERS.get(query.category, _FIXTURE_OFFERS["laptop"])
        return SourceResult(
            source="marketplace", status="ok",
            facts=[f"[SAMPLE DATA] Fixture marketplace offers for '{query.category}' "
                   f"(set a real CONTEXT_DEV_API_KEY + pin product_urls to go live)."],
            offers=offers, citations=[o.url for o in offers], is_fixture=True,
            latency_ms=int((time.perf_counter() - start) * 1000),
        )

    async def _live(self, product_urls: dict):
        async def one(retailer_key: str, url: str) -> Optional[Offer]:
            data = await context_client.extract(url, PRODUCT_SCHEMA, EXTRACT_INSTRUCTIONS, max_age_ms=DEMO_MAX_AGE_MS)
            if not data:
                return None
            try:
                price = float(data.get("price_aed")) if data.get("price_aed") is not None else None
            except (TypeError, ValueError):
                price = None
            if price is None:
                return None
            retailer = retailer_key if retailer_key in ("noon", "amazon_ae", "sharaf_dg") else "other"
            availability = data.get("availability") or ""
            return Offer(
                title=data.get("title") or "",
                price_aed=price,
                retailer=retailer,
                url=url,
                seller=data.get("seller"),
                seller_type=_seller_type(data.get("seller_is_official_or_third_party"), data.get("seller")),
                warranty=data.get("warranty"),
                in_stock="out of stock" not in availability.lower(),
                is_fixture=False,
            )

        results = await asyncio.gather(
            *[one(k, u) for k, u in product_urls.items()], return_exceptions=True
        )
        offers: List[Offer] = []
        facts: List[str] = []
        citations: List[str] = []
        for r in results:
            if isinstance(r, Offer):
                offers.append(r)
                facts.append(
                    f"[context.dev LIVE] {r.retailer}: {r.title[:70]} — AED {r.price_aed:g} "
                    f"({r.seller_type}{', ' + r.seller if r.seller else ''}; {r.warranty or 'warranty n/a'})."
                )
                citations.append(r.url)
            elif isinstance(r, Exception):
                logger.warning("marketplace live extract error: %s", r)
        return offers, facts, citations
