"""Verdict synthesis — the last step before the voice agent speaks.

Everything the agent says out loud is built HERE, so this module is the
anti-fabrication gate (docs/CONTRACTS.md §4). Two absolute rules govern the code
below:

  * No constant may ever become a price, a restaurant, a retailer or a product.
    Every field of a pick is copied out of a real `Offer`/`DishOffer` that came
    back from an `ok`/`partial` `SourceResult`. No source -> no pick field.
  * `spoken_summary` may contain no number that is not already present in the
    picks, and must be <= 60 words. Both are ENFORCED in code (`_finalise_spoken`),
    not left to the phrasing.

Ranking is deterministic Python. An LLM may only re-phrase the already-grounded
sentence, and its output is re-validated against the same two rules before use;
if it is absent, slow or fails, the deterministic text stands.

Food ranking order is LOCKED by the product owner (docs/CONTRACTS.md §5):
  1. find the places that actually carry the dish,
  2. rank those places by reviews (rating, weighted by review volume),
  3. use price only as a tie-breaker, and only where a genuine delta exists.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Iterable, List, Optional, Sequence, Set, Tuple, Union

from app.config import settings
from app.domain.models import (
    CravingQuery,
    DishOffer,
    DishRecommendation,
    Offer,
    ProductQuery,
    Recommendation,
    RestaurantReview,
    SourceResult,
    Verdict,
)

logger = logging.getLogger(__name__)

MAX_SPOKEN_WORDS = 60          # the agent reads ONLY spoken_summary
MAX_WHY = 3
MAX_WATCH_OUTS = 2

# A price gap smaller than this is float noise / a rounding artefact, not a saving.
PRICE_DELTA_EPSILON_AED = 0.01

# --- review weighting -------------------------------------------------------
# Bayesian shrinkage toward a prior mean, i.e. the classic weighted-rating form
#   score = (v / (v + m)) * R + (m / (v + m)) * C
# WHY: a raw `rating` sort lets a 4.9 built on 12 reviews beat a 4.7 built on 500,
# which is exactly the wrong answer — the 4.9 is a small-sample accident. Shrinking
# each rating toward the prior in proportion to how few reviews back it means a
# thin rating has to be spectacular to outrank a well-evidenced one:
#   4.9 @ 12  -> 4.34      4.7 @ 500 -> 4.65   (the 500-review 4.7 wins)
# A missing review_count is treated as 0, i.e. maximum shrinkage — an unevidenced
# number never wins on its own.
REVIEW_PRIOR_COUNT = 50.0      # m: how many reviews it takes to half-trust a rating
REVIEW_PRIOR_MEAN = 4.2        # C: the prior; delivery-app ratings cluster near here

# Restaurant-name noise the delivery apps append ("Din Tai Fung - Dubai Mall").
_NAME_SPLIT = re.compile(r"\s*[\-\u2013\u2014|,(\[]\s*")
_NON_ALNUM = re.compile(r"[^a-z0-9 ]+")
_STOPWORDS = {"the", "restaurant", "cafe", "kitchen", "uae", "dubai", "abu", "dhabi", "branch"}
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
_AUTHENTIC_HINTS = ("authentic", "traditional", "legit", "homemade", "hand-made", "handmade",
                    "as good as", "real deal", "genuine", "just like")


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------

def _fmt_money(value: float) -> str:
    """AED amounts as a person says them: 99, 141.43, 4,699."""
    return f"{value:,.0f}" if abs(value - round(value)) < 0.005 else f"{value:,.2f}"


def _fmt_rating(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".") if value % 1 else f"{value:.0f}"


def _norm_numbers(text: str) -> Set[float]:
    """Every number in a string, normalised so '4,699' == '4699.0' == '4699'."""
    out: Set[float] = set()
    for raw in _NUMBER.findall(text or ""):
        try:
            out.add(float(raw.replace(",", "")))
        except ValueError:
            continue
    return out


def _is_url(value: str) -> bool:
    return value.strip().lower().startswith(("http://", "https://", "//"))


def _numbers_in_pick(pick: Optional[Union[DishRecommendation, Recommendation]]) -> Set[float]:
    """Numbers that legitimately appear in a pick — the whitelist for rule 2.

    Walks the serialised model rather than a hand-written field list so a number
    can never be spoken because someone forgot to add its field here.

    URLs are skipped: a deep link (``.../restaurant/763692/...``) or a CDN image path
    (``.../1200x800.jpg``) is full of digits that mean nothing to a listener, and
    harvesting them would let the agent speak "seven six three six nine two" as though
    it were a grounded fact. A number a person can hear must come from a real field.
    """
    if pick is None:
        return set()
    allowed: Set[float] = set()

    def take(value) -> None:
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float)):
            allowed.add(float(value))
        elif isinstance(value, str) and not _is_url(value):
            allowed.update(_norm_numbers(value))

    for value in pick.model_dump().values():
        if isinstance(value, (list, tuple)):
            for item in value:
                take(item)
        else:
            take(value)
    return allowed


def _normalise_restaurant(name: str) -> str:
    """Canonical key for tolerant restaurant matching.

    Apps name the same place differently ("Din Tai Fung" vs
    "Din Tai Fung - Dubai Mall"), so we cut at the first separator, drop
    punctuation and generic/location words, and compare what's left.
    """
    head = _NAME_SPLIT.split(name.strip().lower(), maxsplit=1)[0]
    head = _NON_ALNUM.sub(" ", head)
    tokens = [t for t in head.split() if t and t not in _STOPWORDS]
    return " ".join(tokens) or _NON_ALNUM.sub(" ", name.strip().lower()).strip()


def _same_place(a: str, b: str) -> bool:
    """Tolerant match: identical keys, or one is a prefix of the other."""
    if not a or not b:
        return False
    return a == b or a.startswith(b + " ") or b.startswith(a + " ")


def _tokens(text: str) -> Set[str]:
    return {t for t in _NON_ALNUM.sub(" ", (text or "").lower()).split() if t and t not in _STOPWORDS}


# ---------------------------------------------------------------------------
# restaurant grouping / ranking
# ---------------------------------------------------------------------------

class _RestaurantGroup:
    """All live offers for one physical restaurant, across apps."""

    def __init__(self, key: str, first: DishOffer) -> None:
        self.key = key
        self.display_name = first.restaurant
        self.offers: List[DishOffer] = []

    def add(self, offer: DishOffer) -> None:
        self.offers.append(offer)
        # Prefer the shortest name the apps gave us — that's the brand, minus the branch.
        if len(offer.restaurant) < len(self.display_name):
            self.display_name = offer.restaurant

    @property
    def address(self) -> Optional[str]:
        """First address any app printed for this restaurant — often only one app shows it."""
        for o in self.offers:
            if o.address:
                return o.address
        return None

    @property
    def rating(self) -> Optional[float]:
        ratings = [o.rating for o in self.offers if o.rating is not None]
        return max(ratings) if ratings else None

    @property
    def review_count(self) -> Optional[int]:
        counts = [o.review_count for o in self.offers if o.review_count is not None]
        return max(counts) if counts else None

    @property
    def apps(self) -> List[str]:
        seen: List[str] = []
        for o in self.offers:
            if o.app not in seen:
                seen.append(o.app)
        return seen

    @property
    def weighted_rating(self) -> float:
        """Step 2's sort key — see REVIEW_PRIOR_* for why volume is weighted in."""
        rating = self.rating
        if rating is None:
            return 0.0                                   # unrated never outranks rated
        volume = float(self.review_count or 0)
        return ((volume * rating) + (REVIEW_PRIOR_COUNT * REVIEW_PRIOR_MEAN)) / (
            volume + REVIEW_PRIOR_COUNT
        )

    @property
    def cheapest(self) -> DishOffer:
        return min(self.offers, key=lambda o: o.price_aed)

    @property
    def image_url(self) -> Optional[str]:
        """First photo any app published for this restaurant's matching dish.

        Falls across apps deliberately: Deliveroo may carry the photo while the cheapest
        listing (Talabat) does not, and the same dish at the same restaurant is the same
        food. None when no app published one — the client then renders its own artwork.
        """
        for offer in self.offers:
            if offer.image_url:
                return offer.image_url
        return None

    @property
    def price_spread(self) -> Tuple[DishOffer, DishOffer]:
        return (min(self.offers, key=lambda o: o.price_aed),
                max(self.offers, key=lambda o: o.price_aed))

    @property
    def cross_app_delta(self) -> Optional[Tuple[DishOffer, DishOffer]]:
        """Cheapest vs dearest for the SAME dish on DIFFERENT apps, or None.

        The group's global min/max is NOT a price delta: those are usually two
        different menu items (a 20 AED single piece vs a 41 AED 6-piece), and on the
        same app. Using it produced the nonsense claim "AED 18 cheaper on deliveroo
        than deliveroo". A saving only exists when ONE dish is listed by TWO apps at
        different prices — which is real but sparse (VENDOR-CONTRACTS §0.6).
        """
        by_dish: Dict[frozenset, List[DishOffer]] = {}
        for o in self.offers:
            by_dish.setdefault(frozenset(_tokens(o.dish)), []).append(o)

        best: Optional[Tuple[DishOffer, DishOffer]] = None
        for variants in by_dish.values():
            cheap = min(variants, key=lambda o: o.price_aed)
            dear = max(variants, key=lambda o: o.price_aed)
            if cheap.app == dear.app:
                continue  # same dish, same app — nothing to compare
            if dear.price_aed - cheap.price_aed < PRICE_DELTA_EPSILON_AED:
                continue
            if best is None or (dear.price_aed - cheap.price_aed) > (best[1].price_aed - best[0].price_aed):
                best = (cheap, dear)
        return best

    def sort_key(self) -> Tuple[float, int, float]:
        # reviews first; then how many apps corroborate the place; then price, which
        # is ONLY ever a tie-breaker (locked ranking order).
        return (self.weighted_rating, len(self.apps), -self.cheapest.price_aed)


def _group_by_restaurant(offers: Sequence[DishOffer]) -> List[_RestaurantGroup]:
    groups: List[_RestaurantGroup] = []
    for offer in offers:
        key = _normalise_restaurant(offer.restaurant)
        match = next((g for g in groups if _same_place(g.key, key)), None)
        if match is None:
            match = _RestaurantGroup(key, offer)
            groups.append(match)
        elif len(key) < len(match.key):
            match.key = key                              # keep the most generic key
        match.add(offer)
    return groups


def _carrying_the_dish(offers: Sequence[DishOffer], wanted: str) -> List[DishOffer]:
    """Step 1: keep only offers whose dish actually matches what was asked for.

    The adapters already search per-dish, so this is a defensive filter: if no
    offer's dish name overlaps the craving we keep everything rather than throw
    away real data over a naming mismatch (a craving is loose prose).
    """
    wanted_tokens = _tokens(wanted)
    if not wanted_tokens:
        return list(offers)
    matched = [o for o in offers if _tokens(o.dish) & wanted_tokens]
    if matched:
        return matched
    logger.info("no dish-name overlap with craving %r; keeping all %d offers", wanted, len(offers))
    return list(offers)


# ---------------------------------------------------------------------------
# reviews (text comes only from Zomato / TripAdvisor — VENDOR-CONTRACTS §0.7)
# ---------------------------------------------------------------------------

def _reviews_for(group: _RestaurantGroup, reviews: Sequence[RestaurantReview],
                 group_count: int) -> List[RestaurantReview]:
    """Attribute review bodies to a restaurant without guessing.

    `RestaurantReview` carries no restaurant field, so we attribute only when the
    place is identifiable: its name appears in the review URL or the review text.
    If exactly one restaurant is in contention the whole review set belongs to it
    by construction (the adapter looked up that one place). Otherwise: nothing —
    an unattributable review must not become an authenticity claim.
    """
    if not reviews:
        return []
    name_tokens = [t for t in group.key.split() if len(t) > 2]
    hits = [
        r for r in reviews
        if (name_tokens and all(t in (r.url or "").lower().replace("-", " ") for t in name_tokens))
        or (name_tokens and all(t in (r.text or "").lower() for t in name_tokens))
    ]
    if hits:
        return hits
    return list(reviews) if group_count == 1 else []


def _top_review(reviews: Sequence[RestaurantReview]) -> Optional[RestaurantReview]:
    """The single most useful REAL review for this restaurant, or None.

    Ranked by: mentions an authenticity/dish cue, then star rating, then how substantive
    the text is. Returned whole (author, rating, source, url) so the UI can render a
    proper review card instead of re-parsing prose. Never fabricated — None means we
    could not attribute a real review to this place.
    """
    with_text = [r for r in reviews if (r.text or "").strip()]
    if not with_text:
        return None
    return sorted(
        with_text,
        key=lambda r: (
            any(h in (r.text or "").lower() for h in _AUTHENTIC_HINTS),
            r.rating or 0.0,
            len((r.text or "").strip()),
        ),
        reverse=True,
    )[0]


def _authenticity_note(reviews: Sequence[RestaurantReview]) -> Optional[str]:
    """A quote from real review prose, or None. Never a synthesised sentence."""
    best = _top_review(reviews)
    if best is None:
        return None
    text = " ".join((best.text or "").split())
    if not text:
        return None
    if len(text) > 180:
        text = text[:177].rsplit(" ", 1)[0] + "..."
    return f'{best.source.capitalize()} reviewer: "{text}"'


def _reviews_agree(reviews: Sequence[RestaurantReview], rating: Optional[float]) -> bool:
    """Do the review bodies corroborate the app's rating? Gates 'high' confidence."""
    if not reviews or rating is None:
        return False
    scored = [r.rating for r in reviews if r.rating is not None]
    if not scored:
        # Text but no per-review score: agreement means the prose is positive-leaning.
        return rating >= 4.0
    return abs((sum(scored) / len(scored)) - rating) <= 1.0


# ---------------------------------------------------------------------------
# spoken summary enforcement (hard contract, not a hope)
# ---------------------------------------------------------------------------

def _finalise_spoken(text: str, allowed_numbers: Set[float]) -> str:
    """Enforce grounding rules 2 and 5 on the spoken line.

    1. Drop any sentence containing a number that is not present in the picks.
    2. Hard-trim to MAX_SPOKEN_WORDS words, on a sentence boundary when possible.
    """
    text = " ".join((text or "").split())
    kept: List[str] = []
    for sentence in _SENTENCE.split(text):
        if not sentence.strip():
            continue
        ungrounded = {n for n in _norm_numbers(sentence) if n not in allowed_numbers}
        if ungrounded:
            logger.warning("dropping spoken sentence with ungrounded number(s) %s: %r",
                           sorted(ungrounded), sentence)
            continue
        kept.append(sentence.strip())

    out = " ".join(kept)
    if len(out.split()) > MAX_SPOKEN_WORDS:
        trimmed: List[str] = []
        for sentence in kept:
            candidate = trimmed + [sentence]
            if len(" ".join(candidate).split()) > MAX_SPOKEN_WORDS:
                break
            trimmed = candidate
        out = " ".join(trimmed) if trimmed else " ".join(out.split()[:MAX_SPOKEN_WORDS]).rstrip(",.") + "."
    if not out:
        # Every sentence was rejected: say something true that carries no numbers.
        out = "I found live options, but I could not confirm the details, so I would rather not quote them."
    assert len(out.split()) <= MAX_SPOKEN_WORDS, "spoken_summary exceeded the word cap"
    return out


# ---------------------------------------------------------------------------
# the synthesizer
# ---------------------------------------------------------------------------

class VerdictSynthesizer:
    """Turns fetched SourceResults into the Verdict the agent reads aloud.

    Deterministic construction owns every fact; the optional LLM step may only
    re-phrase an already-valid sentence.
    """

    async def build_verdict(
        self,
        query: Union[CravingQuery, ProductQuery],
        results: List[SourceResult],
    ) -> Verdict:
        contributing = [r for r in results if r.status in ("ok", "partial")]
        if self._is_food(query, contributing):
            return await self._build_food_verdict(query, contributing)
        return await self._build_shopping_verdict(query, contributing)

    # -- routing ------------------------------------------------------------

    @staticmethod
    def _is_food(query, contributing: Sequence[SourceResult]) -> bool:
        if isinstance(query, CravingQuery):
            return True
        if isinstance(query, ProductQuery):
            return False
        # Unknown query type: let the data decide.
        return any(r.dish_offers for r in contributing)

    # -- food ---------------------------------------------------------------

    async def _build_food_verdict(self, query: CravingQuery, contributing: List[SourceResult]) -> Verdict:
        dish_wanted = getattr(query, "dish", "") or ""

        offer_sources: List[SourceResult] = [r for r in contributing if r.dish_offers]
        review_sources: List[SourceResult] = [r for r in contributing if r.reviews]
        all_offers: List[DishOffer] = [o for r in offer_sources for o in r.dish_offers]
        reviews: List[RestaurantReview] = [rv for r in review_sources for rv in r.reviews]

        # (a) sold-out offers leave the running for the pick but can still warn the user.
        available = [o for o in all_offers if not o.sold_out]
        sold_out = [o for o in all_offers if o.sold_out]

        # (b) step 1 — only places that actually carry the dish.
        candidates = _carrying_the_dish(available, dish_wanted)
        groups = _group_by_restaurant(candidates)

        if not groups:
            return self._empty_food_verdict(query, contributing, all_offers)

        # (c) step 2 — rank by reviews (volume-weighted), corroboration, then price.
        groups.sort(key=lambda g: g.sort_key(), reverse=True)
        winner, runner_group = groups[0], (groups[1] if len(groups) > 1 else None)

        winner_reviews = _reviews_for(winner, reviews, len(groups))
        pick, price_note = self._dish_recommendation(winner, winner_reviews, sold_out, dish_wanted)

        runner_up = None
        if runner_group is not None:
            runner_reviews = _reviews_for(runner_group, reviews, len(groups))
            runner_up, _ = self._dish_recommendation(runner_group, runner_reviews, sold_out, dish_wanted)

        used_offers = list(winner.offers) + (list(runner_group.offers) if runner_group else [])
        is_fixture = any(r.is_fixture for r in offer_sources + review_sources) or any(
            o.is_fixture for o in used_offers
        )

        # Credit the review source when review text reached EITHER pick — the runner-up's
        # authenticity note is still a contribution, and omitting it under-reported the
        # sources behind the verdict (CONTRACTS.md §4.3).
        reviews_contributed = bool(winner_reviews) or bool(
            runner_up is not None and runner_up.authenticity_note
        )
        sources_used = self._sources_used(offer_sources, review_sources if reviews_contributed else [])
        confidence = self._food_confidence(winner, winner_reviews, is_fixture)

        spoken = self._compose_food_spoken(pick, runner_up, winner, price_note)
        spoken = await self._phrase(spoken, pick, runner_up)

        return Verdict(
            pick=pick,
            runner_up=runner_up,
            price_note=price_note,
            confidence=confidence,
            sources_used=sources_used,
            is_fixture=is_fixture,
            spoken_summary=spoken,
        )

    def _dish_recommendation(
        self,
        group: _RestaurantGroup,
        group_reviews: Sequence[RestaurantReview],
        sold_out: Sequence[DishOffer],
        dish_wanted: str,
    ) -> Tuple[DishRecommendation, str]:
        # (d) step 3 — price is a tie-breaker WITHIN the chosen restaurant. We take
        # the cheapest app, but we only ever SAY "cheaper" when a real delta exists;
        # most shared dishes are identically priced across apps (VENDOR-CONTRACTS §0.6),
        # so a blanket "cheaper on X" claim would be a lie on most dishes.
        cheapest = group.cheapest
        # Only a SAME-dish, CROSS-app comparison counts as a saving.
        spread = group.cross_app_delta
        has_delta = spread is not None
        if has_delta:
            cheap_side, dear_side = spread
            delta = dear_side.price_aed - cheap_side.price_aed

        if has_delta:
            price_note = (f"{cheap_side.dish} differs by app: {cheap_side.app} "
                          f"AED {_fmt_money(cheap_side.price_aed)} vs {dear_side.app} "
                          f"AED {_fmt_money(dear_side.price_aed)}, a AED {_fmt_money(delta)} difference.")
        elif len(group.apps) < 2:
            price_note = (f"Only {cheapest.app} lists it at {group.display_name}: "
                          f"AED {_fmt_money(cheapest.price_aed)}. No second app to compare against.")
        else:
            price_note = (f"Prices match across {' and '.join(group.apps)} at "
                          f"AED {_fmt_money(cheapest.price_aed)} — no saving either way.")

        why: List[str] = []
        if group.rating is not None:
            if group.review_count:
                why.append(f"Rated {_fmt_rating(group.rating)} from {group.review_count} reviews on {cheapest.app}")
            else:
                why.append(f"Rated {_fmt_rating(group.rating)} on {cheapest.app}")
        if has_delta:
            why.append(f"AED {_fmt_money(delta)} cheaper on {cheap_side.app} than "
                       f"{dear_side.app} for {cheap_side.dish}")
        elif len(group.apps) >= 2:
            why.append(f"Same price on {' and '.join(group.apps)}, so no app is cheaper here")
        if group_reviews:
            plural = "review" if len(group_reviews) == 1 else "reviews"
            why.append(f"{len(group_reviews)} written {plural} back it up on "
                       f"{', '.join(sorted({r.source for r in group_reviews}))}")
        if cheapest.offer_text:
            why.append(f"{cheapest.app} lists: {cheapest.offer_text}")
        why = why[:MAX_WHY]

        watch_outs: List[str] = []
        group_sold_out = [o for o in sold_out if _same_place(_normalise_restaurant(o.restaurant), group.key)]
        if group_sold_out:
            so = group_sold_out[0]
            watch_outs.append(f"{so.dish} is showing sold out on {so.app} right now")
        # Only warn about a THIN review base when we actually know the count. An unknown
        # count (None) is not zero — claiming "rests on only 0 reviews" was stating a
        # number the source never gave us.
        if group.rating is not None and group.review_count is not None and group.review_count < 25:
            watch_outs.append(
                f"That {_fmt_rating(group.rating)} rests on only {group.review_count} reviews"
            )
        if cheapest.minimum_order_aed is not None:
            watch_outs.append(f"{cheapest.app} lists a AED {_fmt_money(cheapest.minimum_order_aed)} minimum order")
        if cheapest.delivery_fee_aed is not None and len(watch_outs) < MAX_WATCH_OUTS:
            watch_outs.append(
                f"AED {_fmt_money(cheapest.delivery_fee_aed)} delivery is {cheapest.app}'s listed estimate, "
                f"not your checkout total"
            )
        watch_outs = watch_outs[:MAX_WATCH_OUTS]

        # (h) listing-page fee/ETA are the app's PUBLISHED ESTIMATE (§0.8) — labelled as such.
        delivery_estimate = None
        if cheapest.estimates_are_published:
            parts = []
            if cheapest.delivery_fee_aed is not None:
                parts.append(f"AED {_fmt_money(cheapest.delivery_fee_aed)} delivery")
            if cheapest.eta_text:
                parts.append(cheapest.eta_text)
            delivery_estimate = f"{', '.join(parts)} — as listed by {cheapest.app}, not a checkout total"

        rec = DishRecommendation(
            name=cheapest.dish or dish_wanted,
            restaurant=group.display_name,
            address=group.address,
            price_aed=cheapest.price_aed,
            app=cheapest.app,
            url=cheapest.deep_link,
            why=why,
            watch_outs=watch_outs,
            rating=group.rating,
            review_count=group.review_count,
            authenticity_note=_authenticity_note(group_reviews),   # (g) None when no real text
            top_review=_top_review(group_reviews),                 # same review, structured for the UI
            delivery_estimate=delivery_estimate,
            screenshot_url=cheapest.screenshot_url,
            logo_url=cheapest.logo_url,
            image_url=group.image_url,
        )
        return rec, price_note

    def _compose_food_spoken(
        self,
        pick: DishRecommendation,
        runner_up: Optional[DishRecommendation],
        winner: _RestaurantGroup,
        price_note: str,
    ) -> str:
        bits = [
            f"Go with {pick.restaurant} on {pick.app}: {pick.name} is AED {_fmt_money(pick.price_aed)}."
        ]
        if pick.rating is not None:
            if pick.review_count:
                bits.append(f"They're rated {_fmt_rating(pick.rating)} from {pick.review_count} reviews.")
            else:
                bits.append(f"They're rated {_fmt_rating(pick.rating)}.")
        if price_note.startswith("Prices match"):
            bits.append("Prices are the same on the other app, so I picked on reviews.")
        elif price_note.startswith("Prices differ"):
            bits.append("That's the cheaper app for this dish today.")
        if pick.authenticity_note:
            # Say only that reviewers wrote about it, never HOW they rated it. We do no
            # sentiment analysis, and the canned "reviewers call it the real thing" was
            # spoken over a lukewarm quote ("Still good but not great") — an endorsement
            # the source never gave. The verbatim quote is on the card; let it speak.
            bits.append("There's a reviewer's own words on your screen.")
        if runner_up is not None:
            bits.append(f"Runner-up is {runner_up.restaurant} at AED {_fmt_money(runner_up.price_aed)}.")
        if pick.delivery_estimate:
            bits.append("Delivery fee and time are the app's listed estimate.")
        return " ".join(bits)

    @staticmethod
    def _food_confidence(winner: _RestaurantGroup, winner_reviews: Sequence[RestaurantReview],
                         is_fixture: bool) -> str:
        if is_fixture:
            return "low"                                   # sample data is never high confidence
        if len(winner.apps) >= 2 and winner_reviews and _reviews_agree(winner_reviews, winner.rating):
            return "high"
        if winner.rating is not None or len(winner.apps) >= 2:
            return "medium"
        return "low"

    def _empty_food_verdict(self, query: CravingQuery, contributing: List[SourceResult],
                            all_offers: Sequence[DishOffer]) -> Verdict:
        """(rule 6) Nothing carried the dish -> low confidence, no invented pick.

        `Verdict.pick` is non-optional in the model, so the honest shape is a pick
        with an empty restaurant/app/url and price 0.0, which the UI renders as
        "—". Nothing here is invented: the only text is the user's own craving.
        """
        dish = getattr(query, "dish", "") or ""
        sold_out_only = bool(all_offers)
        watch = ["Everything I found was showing sold out"] if sold_out_only else \
                ["No live listing carried this dish in the area I searched"]
        pick = DishRecommendation(
            name=dish,
            restaurant="",
            price_aed=0.0,
            app="",
            url="",
            why=[],
            watch_outs=watch,
        )
        spoken = _finalise_spoken(
            f"I could not find {dish} on the delivery apps right now, so I have nothing "
            f"honest to quote you. Want me to try a different dish or a wider area?",
            _numbers_in_pick(pick),
        )
        return Verdict(
            pick=pick,
            runner_up=None,
            price_note="No live price found — nothing to compare.",
            confidence="low",
            sources_used=self._sources_used(contributing, []),
            is_fixture=any(r.is_fixture for r in contributing),
            spoken_summary=spoken,
        )

    # -- shopping (legacy path, kept working) --------------------------------

    async def _build_shopping_verdict(self, query: ProductQuery, contributing: List[SourceResult]) -> Verdict:
        offer_sources = [r for r in contributing if r.offers]
        offers: List[Offer] = [o for r in offer_sources for o in r.offers if o.in_stock is not False]
        budget = getattr(query, "budget_aed", None)

        if not offers:
            return self._empty_shopping_verdict(query, contributing)

        def rank(offer: Offer) -> Tuple[int, int, float]:
            in_budget = 1 if (budget is None or offer.price_aed <= budget) else 0
            official = 1 if offer.seller_type == "official" else 0
            return (in_budget, official, -offer.price_aed)   # cheaper wins last

        offers.sort(key=rank, reverse=True)
        best = offers[0]
        second = next((o for o in offers[1:] if o.title != best.title), None)

        pick = self._product_recommendation(best, offers)
        runner_up = self._product_recommendation(second, offers) if second else None

        used = [best] + ([second] if second else [])
        is_fixture = any(r.is_fixture for r in offer_sources) or any(o.is_fixture for o in used)

        prices = sorted({round(o.price_aed, 2) for o in offers})
        if len(prices) > 1:
            price_note = (f"Live prices range from AED {_fmt_money(prices[0])} to "
                          f"AED {_fmt_money(prices[-1])} across {len(offer_sources)} source(s).")
        else:
            price_note = f"Every source lists AED {_fmt_money(prices[0])} — prices match."

        confidence = "low" if is_fixture else ("high" if len(offers) >= 2 and len(contributing) >= 3 else "medium")

        spoken_bits = [f"Your top pick is the {pick.name} on {pick.retailer} for AED {_fmt_money(pick.price_aed)}."]
        if pick.warranty_note:
            spoken_bits.append("It comes with the warranty note on your screen.")
        if runner_up is not None:
            spoken_bits.append(
                f"Runner-up is the {runner_up.name} on {runner_up.retailer} for AED {_fmt_money(runner_up.price_aed)}."
            )
        spoken = await self._phrase(" ".join(spoken_bits), pick, runner_up)

        return Verdict(
            pick=pick,
            runner_up=runner_up,
            price_note=price_note,
            confidence=confidence,
            sources_used=self._sources_used(offer_sources, []),
            is_fixture=is_fixture,
            spoken_summary=spoken,
        )

    @staticmethod
    def _product_recommendation(offer: Offer, all_offers: Sequence[Offer]) -> Recommendation:
        cheapest = min(all_offers, key=lambda o: o.price_aed)
        why: List[str] = []
        if offer.price_aed == cheapest.price_aed and len({o.price_aed for o in all_offers}) > 1:
            why.append(f"Cheapest live listing we found at AED {_fmt_money(offer.price_aed)}")
        else:
            why.append(f"Listed at AED {_fmt_money(offer.price_aed)} on {offer.retailer}")
        if offer.seller_type == "official":
            why.append(f"Sold by the official store{' (' + offer.seller + ')' if offer.seller else ''}")
        if offer.warranty:
            why.append(f"Warranty as listed: {offer.warranty}")
        why = why[:MAX_WHY]

        watch_outs: List[str] = []
        if offer.seller_type == "marketplace_3p":
            watch_outs.append("Third-party marketplace seller — confirm the local UAE warranty before buying")
        elif offer.seller_type == "unknown":
            watch_outs.append("Seller type was not stated on the listing — check who ships it")
        if offer.in_stock is False:
            watch_outs.append("Listing showed as out of stock at capture time")
        if not offer.warranty and len(watch_outs) < MAX_WATCH_OUTS:
            watch_outs.append("No warranty text on the listing page")
        if offer.is_fixture and len(watch_outs) < MAX_WATCH_OUTS:
            watch_outs.append("Sample data, not a live fetch")
        if cheapest.price_aed < offer.price_aed and len(watch_outs) < MAX_WATCH_OUTS:
            watch_outs.append(
                f"AED {_fmt_money(offer.price_aed - cheapest.price_aed)} cheaper on {cheapest.retailer}"
            )
        watch_outs = watch_outs[:MAX_WATCH_OUTS]

        return Recommendation(
            name=offer.title,
            price_aed=offer.price_aed,
            retailer=offer.retailer,
            url=offer.url,
            why=why,
            watch_outs=watch_outs,
            warranty_note=offer.warranty,
        )

    def _empty_shopping_verdict(self, query: ProductQuery, contributing: List[SourceResult]) -> Verdict:
        category = getattr(query, "category", "") or ""
        pick = Recommendation(
            name=category, price_aed=0.0, retailer="", url="",
            why=[], watch_outs=["No live listing came back from any source"],
        )
        spoken = _finalise_spoken(
            f"I could not pull a live {category} listing just now, so I have no price I trust. "
            f"Shall I try again?",
            _numbers_in_pick(pick),
        )
        return Verdict(
            pick=pick, runner_up=None,
            price_note="No live price found — nothing to compare.",
            confidence="low",
            sources_used=self._sources_used(contributing, []),
            is_fixture=any(r.is_fixture for r in contributing),
            spoken_summary=spoken,
        )

    # -- shared --------------------------------------------------------------

    @staticmethod
    def _sources_used(*groups: Iterable[SourceResult]) -> List[str]:
        """(rule 3) Only sources that actually contributed something we used."""
        used: List[str] = []
        for group in groups:
            for result in group:
                if result.source not in used:
                    used.append(result.source)
        return used

    async def _phrase(
        self,
        deterministic: str,
        pick: Union[DishRecommendation, Recommendation],
        runner_up: Optional[Union[DishRecommendation, Recommendation]],
    ) -> str:
        """Grounded sentence in, spoken sentence out.

        The deterministic text is the backstop and is ALWAYS validated first, so a
        missing/slow/broken LLM simply leaves it in place. If the LLM answers, its
        rewrite must survive exactly the same validation (no number outside the
        picks, <= 60 words) or it is discarded. The LLM can therefore never
        originate a number.
        """
        allowed = _numbers_in_pick(pick) | _numbers_in_pick(runner_up)
        grounded = _finalise_spoken(deterministic, allowed)

        polished = await self._llm_rephrase(grounded)
        if not polished:
            return grounded
        candidate = _finalise_spoken(polished, allowed)
        # Reject a rewrite that lost content to the validator — the backstop wins.
        if len(candidate.split()) < max(6, len(grounded.split()) // 2):
            logger.warning("LLM rephrase rejected (lost too much content); using deterministic text")
            return grounded
        return candidate

    async def _llm_rephrase(self, grounded: str) -> Optional[str]:
        """Optional, best-effort, never load-bearing. Returns None on any problem."""
        key = (settings.LLM_API_KEY or "").strip()
        if not key or key.startswith("demo"):
            return None
        base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        model = os.getenv("LLM_MODEL", "gpt-4o-mini")
        prompt = (
            "Rewrite this for a voice assistant to read aloud. Keep it under 55 words, natural "
            "spoken English, no lists, no URLs, no field names. Do NOT add, remove or change any "
            "number, price, name or app. Reply with the sentence only.\n\n" + grounded
        )
        try:
            import httpx  # already a dependency of the API service

            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "max_tokens": 160,
                    },
                )
            if resp.status_code != 200:
                logger.warning("LLM rephrase HTTP %s; keeping deterministic summary", resp.status_code)
                return None
            content = resp.json()["choices"][0]["message"]["content"]
            return content.strip().strip('"') or None
        except Exception as exc:                              # noqa: BLE001 - never fatal
            logger.warning("LLM rephrase unavailable (%s); keeping deterministic summary", exc)
            return None


synthesizer = VerdictSynthesizer()
