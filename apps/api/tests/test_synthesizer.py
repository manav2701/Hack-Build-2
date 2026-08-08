"""Verdict grounding + honesty tests.

Each case pins a SPECIFIC wrong output observed in a live run on 2026-08-08, so a
regression reintroduces a failing test rather than a confidently-wrong sentence the
voice agent reads aloud.
"""
import asyncio

import pytest

from app.adapters.sources.delivery_app import _dish_matches, search_terms
from app.domain.models import CravingQuery, DishOffer, RestaurantReview, SourceResult
from app.services.synthesizer import synthesizer


# --- craving parsing -------------------------------------------------------
# Regression: "local sichuan wontons" hung the demo. The filler word "local" returned
# ZERO search results on both apps, and the matcher required EVERY spoken word to appear
# on the menu item, so nothing could ever match.

@pytest.mark.parametrize("spoken,listed,expected", [
    ("local sichuan wontons", "Wontons In Hot And Sour Sauce", True),
    ("local sichuan wontons", "Fried Wontons With Sesame Sauce", True),
    ("authentic sichuan wontons", "Chicken And Vegetable Wontons Tossed", True),
    ("wontons", "Wonton Soup", True),
    ("local sichuan wontons", "Chicken Xiao Long Bao", False),
    ("local sichuan wontons", "Beef Burger", False),
])
def test_natural_craving_reaches_the_right_menu_item(spoken, listed, expected):
    assert _dish_matches(spoken, listed) is expected


def test_filler_words_are_stripped_from_the_search_query():
    """Measured: 'local sichuan wontons ...' -> 0 results; without 'local' -> 10.
    Cuisine words must SURVIVE, they are what identify the restaurant."""
    q = search_terms("local authentic sichuan wontons")
    assert "local" not in q and "authentic" not in q
    assert "sichuan" in q and "wontons" in q


def offer(app, dish, price, restaurant="Din Tai Fung", rating=4.5, count=500):
    return DishOffer(restaurant=restaurant, dish=dish, price_aed=price, app=app,
                     deep_link=f"https://{app}.example/x", rating=rating, review_count=count)


def build(offers, reviews=()):
    results = [SourceResult(source="delivery_app", status="ok", dish_offers=list(offers))]
    if reviews:
        results.append(SourceResult(source="restaurant_reviews", status="ok", reviews=list(reviews)))
    return asyncio.run(synthesizer.build_verdict(CravingQuery(dish="xiao long bao"), results))


def test_two_dishes_on_one_app_is_not_a_cross_app_saving():
    """Regression: the group's global min/max spanned two DIFFERENT dishes on the SAME
    app, producing 'AED 18 cheaper on deliveroo than deliveroo'."""
    v = build([offer("talabat", "Truffle Chicken Xiao Long Bao", 20),
               offer("talabat", "Chicken Xiao Long Bao 6pcs", 41)])
    text = " ".join(v.pick.why)
    assert "talabat than talabat" not in text
    assert not any("cheaper on" in w for w in v.pick.why)


def test_never_claims_a_saving_while_saying_there_is_no_second_app():
    v = build([offer("talabat", "Truffle Chicken Xiao Long Bao", 20),
               offer("talabat", "Chicken Xiao Long Bao 6pcs", 41)])
    blob = " ".join(v.pick.why) + " " + v.price_note
    assert not ("cheaper on" in blob and "No second app" in blob)


def test_real_cross_app_delta_is_still_reported():
    """The measured Wagamama case: same dish, two apps, a genuine gap."""
    v = build([offer("talabat", "Chicken Xiao Long Bao", 99),
               offer("deliveroo", "Chicken Xiao Long Bao", 141.43)])
    assert any("cheaper on talabat than deliveroo" in w for w in v.pick.why)


def test_unknown_review_count_is_not_reported_as_zero():
    """Regression: review_count=None rendered as 'rests on only 0 reviews' — stating a
    number the source never gave us."""
    v = build([offer("talabat", "Chicken Xiao Long Bao", 41, rating=4.0, count=None)])
    assert not any("only 0 reviews" in w for w in v.pick.watch_outs)


def test_top_review_is_returned_as_a_structured_object_for_the_ui():
    """The frontend renders author/stars/source/link, so it needs the whole review,
    not just the prose in authenticity_note."""
    rev = RestaurantReview(source="tripadvisor", author="Gianni", rating=5.0,
                           date="Nov 2024", url="https://tripadvisor.com/x",
                           text="The wontons were flavorful with a perfect texture.")
    v = build([offer("talabat", "Chicken Xiao Long Bao", 41)], [rev])
    assert v.pick.top_review is not None
    assert v.pick.top_review.author == "Gianni"
    assert v.pick.top_review.rating == 5.0
    assert v.pick.top_review.source == "tripadvisor"
    assert v.pick.top_review.url == "https://tripadvisor.com/x"
    assert "wontons" in v.pick.top_review.text


def test_top_review_is_none_rather_than_invented_when_no_review_exists():
    v = build([offer("talabat", "Chicken Xiao Long Bao", 41)])
    assert v.pick.top_review is None


def test_top_review_prefers_the_more_substantive_higher_rated_review():
    thin = RestaurantReview(source="zomato", rating=3.0, url="https://zomato.com/a", text="ok")
    rich = RestaurantReview(source="tripadvisor", rating=5.0, url="https://tripadvisor.com/b",
                            text="Genuinely authentic wontons, easily the standout dish here.")
    v = build([offer("talabat", "Chicken Xiao Long Bao", 41)], [thin, rich])
    assert v.pick.top_review is not None
    assert v.pick.top_review.url == "https://tripadvisor.com/b"


def test_review_source_is_credited_when_it_reaches_a_pick():
    rev = RestaurantReview(source="tripadvisor", rating=5, url="https://tripadvisor.com/x",
                           text="The xiao long bao here are the standout, truly authentic.")
    v = build([offer("talabat", "Chicken Xiao Long Bao", 41)], [rev])
    assert "restaurant_reviews" in v.sources_used
    assert v.pick.authenticity_note


def test_spoken_summary_never_asserts_review_sentiment():
    """Regression: a canned 'reviewers call it the real thing' was spoken over a lukewarm
    quote. We run no sentiment analysis, so the spoken line must not characterise it."""
    lukewarm = RestaurantReview(source="tripadvisor", rating=3, url="https://tripadvisor.com/x",
                                text="Xiao long bao was still good but not great. Lacked a bit.")
    v = build([offer("talabat", "Chicken Xiao Long Bao", 41)], [lukewarm])
    spoken = v.spoken_summary.lower()
    for claim in ("the real thing", "authentic", "rave", "love it", "best in"):
        assert claim not in spoken, f"spoken summary asserts unmeasured sentiment: {claim!r}"


def test_price_change_changes_the_verdict():
    """The mutation that proves the verdict is derived, not constant."""
    a = build([offer("talabat", "Chicken Xiao Long Bao", 41)])
    b = build([offer("talabat", "Chicken Xiao Long Bao", 99)])
    assert a.spoken_summary != b.spoken_summary
    assert "41" in a.spoken_summary and "99" in b.spoken_summary


def test_higher_rated_restaurant_wins_the_ranking():
    """Locked ranking: reviews outrank price."""
    v = build([offer("talabat", "Chicken Xiao Long Bao", 25, restaurant="Cheap Place", rating=3.2, count=400),
               offer("deliveroo", "Chicken Xiao Long Bao", 55, restaurant="Great Place", rating=4.9, count=800)])
    assert v.pick.restaurant == "Great Place"


def test_spoken_summary_stays_within_sixty_words():
    v = build([offer("talabat", "Chicken Xiao Long Bao", 99),
               offer("deliveroo", "Chicken Xiao Long Bao", 141.43)])
    assert len(v.spoken_summary.split()) <= 60


def test_no_offers_gives_low_confidence_and_no_invented_pick():
    v = asyncio.run(synthesizer.build_verdict(
        CravingQuery(dish="unobtainium"),
        [SourceResult(source="delivery_app", status="failed")]))
    assert v.confidence == "low"
    assert v.pick.price_aed == 0


def test_fixture_input_marks_the_whole_verdict_as_fixture():
    fx = SourceResult(source="delivery_app", status="ok", is_fixture=True,
                      dish_offers=[offer("talabat", "Chicken Xiao Long Bao", 41)])
    v = asyncio.run(synthesizer.build_verdict(CravingQuery(dish="xiao long bao"), [fx]))
    assert v.is_fixture is True


@pytest.mark.parametrize("count,expect_warning", [(4, True), (500, False)])
def test_thin_review_base_is_flagged_only_when_genuinely_thin(count, expect_warning):
    v = build([offer("talabat", "Chicken Xiao Long Bao", 41, rating=4.9, count=count)])
    flagged = any("rests on only" in w for w in v.pick.watch_outs)
    assert flagged is expect_warning
