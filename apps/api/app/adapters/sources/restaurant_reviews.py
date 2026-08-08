"""Authenticity narrative source: real customer review BODIES.

The delivery apps (Talabat/Deliveroo/EatEasy) are deliberately NOT used here. Seven live
probes proved they expose an aggregate rating NUMBER and zero review text — Talabat has no
`/reviews` path at all, and a raw-markdown grep found only dish descriptions where review
prose would be (docs/VENDOR-CONTRACTS.md §0.7). The rating that drives ranking already comes
free with the menu fetch, so this adapter's only job is the TEXT: what reviewers actually
say, verbatim, so the voice agent can explain WHY a place is good without inventing it.

Only Zomato and TripAdvisor return bodies, so those are the two domains queried (they are
also the entirety of registry.REVIEW_SOURCES).
"""

import asyncio
import logging
import re
import time
from typing import Dict, List, Optional, Tuple

from app.adapters.base import SourceAdapter
from app.adapters.context_client import DAY_MS, context_client
from app.adapters.registry import REVIEW_SOURCES
from app.domain.models import CravingQuery, RestaurantReview, SourceResult

logger = logging.getLogger(__name__)

# Schema for POST /web/extract on a single restaurant review page. Verified live against
# both Zomato /reviews and a TripAdvisor Restaurant_Review page.
REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "restaurant_name": {"type": "string"},
        "overall_rating": {"type": "number"},
        "total_review_count": {"type": "number"},
        "reviews": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "author": {"type": "string"},
                    "rating": {"type": "number"},
                    "text": {"type": "string"},
                    "date": {"type": "string"},
                },
            },
        },
    },
}

# Anti-fabrication is the point of this adapter: the instruction forbids summarising or
# inventing, forbids treating menu/marketing copy as a review, and demands an empty array
# rather than a plausible-sounding guess when the page shows no customer comments.
REVIEW_INSTRUCTIONS = (
    "Extract ONLY what is literally shown on this restaurant review page: the restaurant name, "
    "the overall rating, the total number of reviews, and every individual customer review "
    "comment visible on the page with its author name, star rating, full review text and date. "
    "Copy each review text verbatim from the page; never summarise, paraphrase, translate, "
    "shorten or invent a review, and never merge two reviews. Do not use dish descriptions, menu "
    "items, editorial blurbs, awards or marketing copy as reviews. If no individual customer "
    "review comments appear on the page, return an empty reviews array."
)

# Cap handed to the synthesizer: enough voices to spot a repeated theme, small enough to keep
# the prompt (and the spoken verdict) tight.
MAX_REVIEWS = 12
# /web/search rejects numResults < 10 (INPUT_VALIDATION_ERROR, verified live).
SEARCH_RESULTS = 10
# Each /web/extract is 10 credits, so budget two pages per domain.
PAGES_PER_SOURCE = 2
MIN_TEXT_CHARS = 15  # shorter "reviews" are ratings-only artefacts, not usable prose

# Whole-word only. Loose phrases ("as good as", "like in") were dropped after they matched
# unrelated prose in a live run - a fact must not overstate what a reviewer wrote.
_AUTHENTIC_RE = re.compile(r"\b(authentic\w*|traditional\w*|genuinely|legit)\b", re.I)
_ZOMATO_LOCALE = re.compile(r"zomato\.com/[a-z]{2}/", re.I)


def _dish_pattern(dish: str) -> Optional[re.Pattern]:
    """Word-boundary pattern for the WHOLE dish name, spaces optional between tokens.

    Matching individual tokens with `in` was wrong: 'long' from 'xiao long bao' matched
    'along' in an unrelated review and produced a fact no reviewer actually supported.
    Optional spacing still catches the real-world spelling 'xiaolong bao'.
    """
    tokens = [re.escape(t) for t in re.split(r"\W+", (dish or "").lower()) if t]
    if not tokens:
        return None
    return re.compile(r"\b" + r"\s*".join(tokens) + r"\w*", re.I)


def _source_for(url: str) -> str:
    """Tag a review with the domain it genuinely came from."""
    low = url.lower()
    if "zomato.com" in low:
        return "zomato"
    if "tripadvisor.com" in low:
        return "tripadvisor"
    return "other"


def _city_token(area: str) -> str:
    """'Downtown Dubai' -> 'dubai'. Used to drop out-of-country namesakes (a TripAdvisor
    search for Din Tai Fung happily returns Taipei and London branches)."""
    parts = [p for p in re.split(r"[\s,]+", area or "") if p]
    return parts[-1].lower() if parts else ""


def _pick_urls(results: List[dict], city: str, prefer_reviews_path: bool) -> List[str]:
    """Choose the review pages worth spending an extract on.

    Zomato: prefer the `/reviews` sub-path — it returned 5 bodies / 424 reviews where the
    plain restaurant page returns the header only (§0.7). Locale-prefixed mirrors
    (/it/, /sk/, /id/) are dropped: same content, non-English review text.
    """
    urls = [r.get("url") for r in results if isinstance(r.get("url"), str)]
    urls = [u for u in urls if not _ZOMATO_LOCALE.search(u)]

    in_city = [u for u in urls if city and city in u.lower()]
    urls = in_city or urls  # never filter down to nothing

    def rank(u: str) -> Tuple[int, int]:
        return (0 if (prefer_reviews_path and u.rstrip("/").endswith("/reviews")) else 1,
                urls.index(u))

    picked: List[str] = []
    seen_slugs: set = set()
    for u in sorted(urls, key=rank):
        # One page per restaurant: the base page and its /reviews child are the same place.
        slug = u.lower().rstrip("/").removesuffix("/reviews").removesuffix("/info").removesuffix("/menu")
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        picked.append(u)
        if len(picked) >= PAGES_PER_SOURCE:
            break
    return picked


# Labelled sample data — used ONLY when there is no live key (or USE_FIXTURES=true) or the
# live path returned nothing at all. SourceResult.is_fixture=True carries the label through.
_FIXTURE_REVIEWS = [
    RestaurantReview(source="tripadvisor", author="Sample reviewer", rating=5.0,
                     text="Authentic Taiwanese cuisine in Dubai - the Xiao Long Bao are the standout.",
                     date="2026-01-12",
                     url="https://www.tripadvisor.com/Restaurant_Review-Sample-Dubai.html"),
    RestaurantReview(source="zomato", author="Sample reviewer", rating=4.0,
                     text="Dumplings were delicate and the soup inside was properly hot. Service was quick.",
                     date="2026-01-08",
                     url="https://www.zomato.com/dubai/sample-restaurant/reviews"),
]


class RestaurantReviewsAdapter(SourceAdapter):
    name = "restaurant_reviews"

    async def run(self, query: CravingQuery) -> SourceResult:  # type: ignore[override]
        start = time.perf_counter()
        try:
            if context_client.is_live():
                reviews, facts, citations, saw_page = await self._live(query)
                if reviews:
                    logger.info("restaurant_reviews: %d live review bodies for '%s'",
                                len(reviews), query.dish)
                    return SourceResult(
                        source="restaurant_reviews", status="ok", facts=facts,
                        reviews=reviews, citations=citations, is_fixture=False,
                        latency_ms=int((time.perf_counter() - start) * 1000),
                    )
                if saw_page:
                    # Pages loaded and reported ratings, but carried no customer prose. That is
                    # an honest partial, not a failure and not an excuse to invent a quote.
                    logger.warning("restaurant_reviews: pages returned ratings but no review text")
                    return SourceResult(
                        source="restaurant_reviews", status="partial", facts=facts,
                        reviews=[], citations=citations, is_fixture=False,
                        latency_ms=int((time.perf_counter() - start) * 1000),
                    )
                # A live search that surfaced no review page is an honest "no reviews
                # found", and serving fixtures here is worse than in the price adapter:
                # `_reviews_for` attributes the whole review set to the winning
                # restaurant when only one is in contention, so a placeholder quote
                # would be presented as THAT restaurant's customer saying it. Return
                # nothing instead — `authenticity_note` is Optional precisely so a pick
                # can stand without a quote.
                logger.info(
                    "restaurant_reviews: live search found no review page for '%s' in %s — "
                    "returning empty rather than fixture prose", query.dish, query.area,
                )
                return SourceResult(
                    source="restaurant_reviews", status="ok", facts=facts,
                    reviews=[], citations=citations, is_fixture=False,
                    latency_ms=int((time.perf_counter() - start) * 1000),
                )
        except Exception as exc:  # this adapter must never break the orchestrator
            logger.exception("restaurant_reviews: live path failed")
            return SourceResult(
                source="restaurant_reviews", status="failed", error=f"{type(exc).__name__}: {exc}",
                latency_ms=int((time.perf_counter() - start) * 1000),
            )

        return SourceResult(
            source="restaurant_reviews", status="ok",
            facts=[f"[SAMPLE DATA] Placeholder review text for '{query.dish}' in {query.area} - "
                   f"no live context.dev fetch was made (no key, USE_FIXTURES=true, or the live "
                   f"search returned no review page).",
                   f"[SAMPLE DATA] Sample reviewer quote: \"{_FIXTURE_REVIEWS[0].text}\""],
            reviews=list(_FIXTURE_REVIEWS), citations=[r.url for r in _FIXTURE_REVIEWS],
            is_fixture=True, latency_ms=int((time.perf_counter() - start) * 1000),
        )

    # ------------------------------------------------------------------ live path

    async def _live(self, query: CravingQuery) -> Tuple[List[RestaurantReview], List[str], List[str], bool]:
        """Discover review pages live, then extract them. Returns
        (reviews, facts, citations, any_page_returned_data)."""
        city = _city_token(query.area)
        # Discovery is live: never hardcode a restaurant URL. Both domains are searched
        # concurrently because they are independent (§0.1: /web/search exists and works).
        searches = await asyncio.gather(
            *[context_client.search(
                f"{query.dish} restaurant {query.area} reviews",
                num_results=SEARCH_RESULTS, include_domains=[domain])
              for domain in REVIEW_SOURCES],
            return_exceptions=True,
        )

        urls: List[str] = []
        for domain, res in zip(REVIEW_SOURCES, searches):
            if isinstance(res, Exception):
                logger.warning("restaurant_reviews: search failed for %s: %s", domain, res)
                continue
            urls.extend(_pick_urls(res, city, prefer_reviews_path="zomato" in domain))
        if not urls:
            return [], [], [], False

        # maxAgeMs stays at the DAY_MS default: cache-bypass triggers Cloudflare 524s on these
        # pages (§0.3). browserCountry is not passed - /web/extract rejects it (§0.3).
        pages = await asyncio.gather(
            *[context_client.extract(u, REVIEW_SCHEMA, REVIEW_INSTRUCTIONS, max_age_ms=DAY_MS)
              for u in urls],
            return_exceptions=True,
        )

        reviews: List[RestaurantReview] = []
        citations: List[str] = []
        per_restaurant: Dict[str, Dict] = {}
        saw_page = False

        for url, data in zip(urls, pages):
            if isinstance(data, Exception):
                logger.warning("restaurant_reviews: extract error %s: %s", url, data)
                continue
            if not isinstance(data, dict):
                continue
            saw_page = True
            citations.append(url)
            name = (data.get("restaurant_name") or "").strip() or "this restaurant"
            bucket = per_restaurant.setdefault(
                name, {"name": name, "texts": [], "sources": set(), "url": url})
            bucket["sources"].add(_source_for(url))

            for raw in (data.get("reviews") or []):
                if len(reviews) >= MAX_REVIEWS:
                    break
                if not isinstance(raw, dict):
                    continue
                text = (raw.get("text") or "").strip()
                if len(text) < MIN_TEXT_CHARS:
                    continue  # ratings-only rows carry no narrative
                reviews.append(RestaurantReview(
                    source=_source_for(url),
                    author=(raw.get("author") or None),
                    rating=_as_float(raw.get("rating")),
                    text=text,
                    date=(raw.get("date") or None),
                    url=url,
                ))
                bucket["texts"].append(text)

        facts = self._facts(query, per_restaurant, saw_page)
        return reviews, facts, citations, saw_page

    # ------------------------------------------------------- authenticity signal

    @staticmethod
    def _facts(query: CravingQuery, per_restaurant: Dict[str, Dict], saw_page: bool) -> List[str]:
        """Turn ONLY the returned review text into human-readable, traceable lines.

        Every line is either a count of literal word occurrences in the returned texts or a
        verbatim quote. Nothing here is summarised or inferred by us; if a restaurant
        returned no bodies we say exactly that.
        """
        facts: List[str] = []
        dish_re = _dish_pattern(query.dish)

        for bucket in per_restaurant.values():
            name = bucket["name"]
            srcs = "/".join(sorted(bucket["sources"]))
            texts: List[str] = bucket["texts"]
            if not texts:
                facts.append(f"[context.dev LIVE] {name} ({srcs}): page returned no customer "
                             f"review text, so no authenticity claim can be made.")
                continue

            facts.append(f"[context.dev LIVE] {name} ({srcs}): {len(texts)} customer review "
                         f"bodies read.")

            authentic_hits = [t for t in texts if _AUTHENTIC_RE.search(t)]
            if authentic_hits:
                facts.append(
                    f"[context.dev LIVE] {name}: {len(authentic_hits)} of {len(texts)} reviewers "
                    f"use authenticity language - verbatim: \"{_clip(authentic_hits[0])}\"")

            dish_hits = [t for t in texts if dish_re and dish_re.search(t)]
            if dish_hits:
                facts.append(
                    f"[context.dev LIVE] {name}: {len(dish_hits)} of {len(texts)} reviewers "
                    f"mention '{query.dish}' by name - verbatim: \"{_clip(dish_hits[0])}\"")

            if not authentic_hits and not dish_hits:
                facts.append(f"[context.dev LIVE] {name}: no reviewer mentioned "
                             f"'{query.dish}' or authenticity; sample quote: \"{_clip(texts[0])}\"")

        if saw_page and not facts:
            facts.append("[context.dev LIVE] Review pages loaded but returned no usable text.")
        return facts


def _as_float(value) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _clip(text: str, limit: int = 180) -> str:
    """Quote verbatim; truncate only at the tail so nothing is reworded."""
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[:limit].rstrip() + "..."
