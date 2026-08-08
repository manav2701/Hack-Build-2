import asyncio
import re
import time
import logging
from typing import Dict, List, Optional, Tuple

from app.adapters.base import SourceAdapter
from app.adapters.context_client import DAY_MS, context_client, is_location_gated
from app.adapters.registry import DELIVERY_APPS, DeliveryApp
from app.domain.models import CravingQuery, DishOffer, SourceResult

logger = logging.getLogger(__name__)

# --- MENU page (restaurant) -------------------------------------------------
# Yields dish + price + sold-out, plus the aggregate rating/review count which is free
# with this fetch (docs/VENDOR-CONTRACTS.md §0.7).
MENU_SCHEMA = {
    "type": "object",
    "properties": {
        "restaurant_name": {"type": "string"},
        "rating": {"type": "number"},
        "review_count": {"type": "number"},
        "dishes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "price_aed": {"type": "number"},
                    "sold_out": {"type": "boolean"},
                },
            },
        },
    },
}
# A vague instruction truncated Talabat to 20 dishes; demanding the COMPLETE menu returned
# 90-141 (§0.4). The "do not stop early" phrasing is load-bearing, not decoration.
MENU_INSTRUCTIONS = (
    "Extract the restaurant name, its aggregate star rating, and its number of reviews. "
    "Then extract EVERY single menu item on this page - do not stop early and do not summarise. "
    "Walk every menu category and include every dish in each one, with its exact listed name, "
    "its price in AED as a plain number, and whether it is sold out / currently unavailable."
)

# --- AREA LISTING page ------------------------------------------------------
# The only place fee / ETA / minimum order / promo text exist. These are the app's
# PUBLISHED ESTIMATE, never the user's checkout total, which is behind auth (§0.8).
LISTING_SCHEMA = {
    "type": "object",
    "properties": {
        "restaurants": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "delivery_fee_aed": {"type": "number"},
                    "delivery_time": {"type": "string"},
                    "minimum_order_aed": {"type": "number"},
                    "rating": {"type": "number"},
                    "offer": {"type": "string"},
                },
            },
        }
    },
}
LISTING_INSTRUCTIONS = (
    "Extract EVERY restaurant card shown on this area listing page - do not stop early. "
    "For each card give: the restaurant name exactly as shown, the delivery fee in AED as a plain "
    "number (0 when free), the delivery time text exactly as shown (e.g. 'Within 32 mins'), the "
    "minimum order value in AED as a plain number, the star rating, and any promotional offer text."
)

# How many candidate menu pages to extract per app. Extraction is 10 credits and several
# seconds a page, so widen only enough to survive one dud candidate.
MENU_CANDIDATES_PER_APP = 2
# One listing page covers the whole area, but they are the heaviest render on these sites and
# intermittently read-timeout, so keep a spare candidate to fall forward to.
LISTING_CANDIDATES_PER_APP = 2

_STOPWORDS = {"the", "restaurant", "cafe", "uae", "dubai", "abu", "dhabi", "menu", "delivery"}


def _norm(text: str) -> str:
    """Lowercase, strip punctuation/diacritic noise, collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower())).strip()


def _tokens(text: str) -> set:
    return {t for t in _norm(text).split() if len(t) > 2 and t not in _STOPWORDS}


def _name_matches(a: str, b: str) -> bool:
    """Tolerant restaurant-name match for the menu<->listing join.

    The same branch is named differently per page ("Din Tai Fung" vs
    "Din Tai Fung - Dubai Mall"), so strict equality would drop nearly every join.
    Accept containment either way, or a strong token overlap against the shorter name.
    """
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return False
    if na == nb or na in nb or nb in na:
        return True
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return False
    shared = ta & tb
    return len(shared) >= 2 and len(shared) >= min(len(ta), len(tb)) * 0.6


def _dish_matches(wanted: str, listed: str) -> bool:
    """Tolerant dish match - the user says "wontons", the menu says
    "Wontons In Hot And Sour Sauce"."""
    nw, nl = _norm(wanted), _norm(listed)
    if not nw or not nl:
        return False
    if nw in nl:
        return True
    wt = _tokens(wanted) or set(nw.split())
    lt = set(nl.split())
    # Every meaningful word the user said must appear, allowing simple plurals.
    return bool(wt) and all(w in lt or f"{w}s" in lt or w.rstrip("s") in lt for w in wt)


def _num(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _rating(value) -> Optional[float]:
    """Ratings are on a 0-5 scale; extraction occasionally grabs an unrelated page number
    (a review count, a price), so anything off-scale is dropped rather than shown."""
    num = _num(value)
    return num if num is not None and 0 < num <= 5 else None


def _is_candidate(url: str, marker: str, app: DeliveryApp) -> bool:
    """A search hit is a real menu/listing page only when it carries the app's marker.

    Marketing/index pages (e.g. talabat.com/uae/<brand>) share the domain but not the
    marker. EatEasy's markers are just "/", so fall back to a path-depth check.
    """
    if not url.startswith("http") or marker not in url:
        return False
    path = url.split(app.domain, 1)[-1].split("?", 1)[0].strip("/")
    if not path:
        return False
    if "/ar/" in url:  # Deliveroo Arabic mirror extracts poorly
        return False
    return len([p for p in path.split("/") if p]) >= (1 if marker == "/" else 2)


class DeliveryAppAdapter(SourceAdapter):
    """Delivery-app prices, joined across the two pages each app splits its data over.

    MENU page  -> dish, price_aed, sold-out, aggregate rating/review count
    LISTING page -> delivery fee, ETA, minimum order, promo offer
    Neither alone answers "where do I order this from", so both are fetched and joined
    on a normalized restaurant name (docs/VENDOR-CONTRACTS.md §0.4).
    """

    name = "delivery_app"

    async def run(self, query: CravingQuery) -> SourceResult:
        start = time.perf_counter()

        if context_client.is_live():
            try:
                offers, facts, citations, per_app = await self._live(query)
            except Exception as exc:  # the adapter must never raise into the orchestrator
                logger.exception("delivery_app: live path crashed")
                return SourceResult(
                    source="delivery_app", status="failed", error=f"{type(exc).__name__}: {exc}",
                    latency_ms=int((time.perf_counter() - start) * 1000),
                )
            if offers:
                required = [a.key for a in DELIVERY_APPS if a.required]
                # EatEasy (required=False) contributing nothing must not degrade the status.
                status = "ok" if all(per_app.get(k) for k in required) else "partial"
                logger.info(
                    "delivery_app: %d live offers for '%s' in %s (apps: %s)",
                    len(offers), query.dish, query.area,
                    ", ".join(f"{k}={v}" for k, v in sorted(per_app.items())) or "none",
                )
                return SourceResult(
                    source="delivery_app", status=status, facts=facts, dish_offers=offers,
                    citations=citations, is_fixture=False,
                    latency_ms=int((time.perf_counter() - start) * 1000),
                )
            logger.warning("delivery_app: live path yielded no offers; using labelled fixture")

        return self._fixture(query, start)

    # ------------------------------------------------------------------ live
    async def _live(self, query: CravingQuery):
        results = await asyncio.gather(
            *[self._one_app(app, query) for app in DELIVERY_APPS], return_exceptions=True
        )

        offers: List[DishOffer] = []
        facts: List[str] = []
        citations: List[str] = []
        per_app: Dict[str, int] = {}

        for app, res in zip(DELIVERY_APPS, results):
            if isinstance(res, Exception):
                logger.warning("delivery_app: %s failed: %r", app.key, res)
                per_app[app.key] = 0
                continue
            app_offers, app_facts, app_citations = res
            per_app[app.key] = len(app_offers)
            offers.extend(app_offers)
            facts.extend(app_facts)
            citations.extend(app_citations)

        for app in DELIVERY_APPS:
            if not per_app.get(app.key):
                note = "best-effort source, thin coverage" if not app.required else "no priced match found"
                facts.append(f"[context.dev LIVE] {app.key}: no {query.dish} offer in {query.area} ({note}).")

        offers.sort(key=lambda o: (o.sold_out, o.price_aed))
        return offers, facts, list(dict.fromkeys(citations)), per_app

    async def _one_app(self, app: DeliveryApp, query: CravingQuery):
        """Menu discovery+extraction and area-listing discovery+extraction, in parallel."""
        menus, listing = await asyncio.gather(
            self._menus(app, query), self._listing(app, query), return_exceptions=True
        )
        if isinstance(menus, Exception):
            logger.warning("delivery_app: %s menu leg failed: %r", app.key, menus)
            menus = []
        if isinstance(listing, Exception):
            logger.warning("delivery_app: %s listing leg failed: %r", app.key, listing)
            listing = ([], None)
        listing_rows, listing_url = listing

        offers: List[DishOffer] = []
        facts: List[str] = []
        citations: List[str] = []

        for url, data in menus:
            restaurant = (data.get("restaurant_name") or "").strip()
            dishes = data.get("dishes") or []
            if not restaurant or not dishes:
                continue

            row = next((r for r in listing_rows if _name_matches(restaurant, r.get("name") or "")), None)
            fee = _num(row.get("delivery_fee_aed")) if row else None
            eta = (row.get("delivery_time") or "").strip() or None if row else None
            minimum = _num(row.get("minimum_order_aed")) if row else None
            promo = (row.get("offer") or "").strip() or None if row else None
            rating = _rating(data.get("rating")) or (_rating(row.get("rating")) if row else None)
            review_count = _num(data.get("review_count"))

            matched = 0
            for dish in dishes:
                dish_name = (dish.get("name") or "").strip()
                price = _num(dish.get("price_aed"))
                if not dish_name or price is None or price <= 0:
                    continue
                if not _dish_matches(query.dish, dish_name):
                    continue
                offers.append(DishOffer(
                    restaurant=restaurant,
                    dish=dish_name,
                    price_aed=price,
                    app=app.key if app.key in ("talabat", "deliveroo", "eateasy") else "other",
                    deep_link=url,
                    sold_out=bool(dish.get("sold_out")),
                    rating=rating,
                    review_count=int(review_count) if review_count else None,
                    delivery_fee_aed=fee,
                    eta_text=eta,
                    minimum_order_aed=minimum,
                    offer_text=promo,
                    is_fixture=False,
                ))
                matched += 1

            if matched:
                citations.append(url)
                if listing_url and row:
                    citations.append(listing_url)
                estimate = (
                    f"delivery AED {fee:g}, {eta} (as listed)" if fee is not None and eta
                    else eta or (f"delivery AED {fee:g} (as listed)" if fee is not None else
                                 "fee/ETA not published for this branch")
                )
                facts.append(
                    f"[context.dev LIVE] {app.key}: {restaurant} lists {matched} '{query.dish}' item(s) "
                    f"from {len(dishes)} menu items; {estimate}"
                    f"{f'; rating {rating:g}' if rating else ''}"
                    f"{f' ({int(review_count)} reviews)' if review_count else ''}"
                    f"{f'; offer: {promo}' if promo else ''}."
                )
            else:
                logger.info("delivery_app: %s %s had %d dishes, none matched '%s'",
                            app.key, restaurant, len(dishes), query.dish)

        return offers, facts, citations

    async def _menus(self, app: DeliveryApp, query: CravingQuery) -> List[Tuple[str, dict]]:
        hits = await context_client.search(
            f"{query.dish} {query.area} delivery menu", num_results=10, include_domains=[app.domain]
        )
        urls = [h["url"] for h in hits if _is_candidate(h.get("url") or "", app.menu_marker, app)]
        # Talabat's ?aid=<areaId> is an AREA id, arrives attached from search, and is NOT
        # transferable between restaurants. Use the search URL VERBATIM - never construct,
        # strip or synthesize an aid, or the page silently 302s to the location picker (§0.2).
        urls = list(dict.fromkeys(urls))[:MENU_CANDIDATES_PER_APP]
        if not urls:
            logger.info("delivery_app: %s found no menu candidates for '%s'", app.key, query.dish)
            return []

        # max_age_ms defaults to DAY_MS: cache-bypass (0) makes these heavy JS pages
        # Cloudflare-524 or serve the gated homepage (§0.3).
        extracted = await asyncio.gather(
            *[context_client.extract(u, MENU_SCHEMA, MENU_INSTRUCTIONS, max_age_ms=DAY_MS) for u in urls],
            return_exceptions=True,
        )
        out: List[Tuple[str, dict]] = []
        for url, data in zip(urls, extracted):
            if isinstance(data, Exception):
                logger.warning("delivery_app: %s menu extract error %s: %r", app.key, url, data)
                continue
            if not data:
                continue
            if is_location_gated(str(data)):
                logger.warning("delivery_app: %s menu %s hit the location gate; discarding", app.key, url)
                continue
            out.append((url, data))
        return out

    async def _listing(self, app: DeliveryApp, query: CravingQuery) -> Tuple[List[dict], Optional[str]]:
        hits = await context_client.search(
            f"restaurants delivery {query.area}", num_results=10, include_domains=[app.domain]
        )
        # Reject paginated deep-pages (page=59 is a different area's tail) and, where the two
        # markers differ, anything that is actually a menu page.
        urls = [
            h["url"] for h in hits
            if _is_candidate(h.get("url") or "", app.listing_marker, app)
            and "page=" not in (h.get("url") or "")
            and not (app.menu_marker != app.listing_marker and app.menu_marker in (h.get("url") or ""))
        ]
        if not urls:
            logger.info("delivery_app: %s found no area-listing candidate for %s", app.key, query.area)
            return [], None

        # Listing pages are the heaviest render on these sites and intermittently read-timeout.
        # Fee/ETA are optional enrichment, so fall forward to the next candidate rather than
        # letting one slow page cost the whole app its join.
        for url in list(dict.fromkeys(urls))[:LISTING_CANDIDATES_PER_APP]:
            try:
                data = await context_client.extract(url, LISTING_SCHEMA, LISTING_INSTRUCTIONS, max_age_ms=DAY_MS)
            except Exception as exc:
                logger.warning("delivery_app: %s listing extract error %s: %r", app.key, url, exc)
                continue
            if not data or is_location_gated(str(data)):
                logger.warning("delivery_app: %s listing %s unusable (gated or empty)", app.key, url)
                continue
            rows = [r for r in (data.get("restaurants") or []) if isinstance(r, dict) and r.get("name")]
            if rows:
                logger.info("delivery_app: %s listing %s -> %d cards", app.key, url, len(rows))
                return rows, url
        return [], None

    # --------------------------------------------------------------- fixture
    def _fixture(self, query: CravingQuery, start: float) -> SourceResult:
        """Labelled sample data - used ONLY with no live key, fixtures forced, or an
        empty live path. is_fixture=True flows through to a UI "sample data" badge."""
        offers = [
            DishOffer(
                restaurant="Din Tai Fung - Dubai Mall", dish="Chicken Xiao Long Bao", price_aed=41.0,
                app="talabat",
                deep_link="https://www.talabat.com/uae/restaurant/45549/din-tai-fung-dubai-mall-downtown-burj-khalifa?aid=1258",
                rating=4.0, delivery_fee_aed=0.0, eta_text="Within 40 mins", minimum_order_aed=20.0,
                is_fixture=True,
            ),
            DishOffer(
                restaurant="Nan Xiang Xiao Long Bao", dish="Pork Xiao Long Bao (6 pcs)", price_aed=48.0,
                app="deliveroo",
                deep_link="https://deliveroo.ae/en/menu/dubai/downtown-dubai-mall/nan-xiang-xiao-long-bao",
                rating=4.8, review_count=500, delivery_fee_aed=7.0, eta_text="25 min",
                offer_text="Spend AED 50, get 30% off", is_fixture=True,
            ),
        ]
        return SourceResult(
            source="delivery_app", status="ok",
            facts=[f"[SAMPLE DATA] Fixture delivery-app offers for '{query.dish}' in {query.area} "
                   f"(set a real CONTEXT_DEV_API_KEY and unset USE_FIXTURES to go live).",
                   "[SAMPLE DATA] Fees and ETAs shown are illustrative, not a live published estimate."],
            dish_offers=offers, citations=[o.deep_link for o in offers], is_fixture=True,
            latency_ms=int((time.perf_counter() - start) * 1000),
        )
