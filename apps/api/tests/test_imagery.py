"""The dish photo: what we will render, and what we refuse to.

The rule under test is that a picture is either the real thing or absent. Rendering
the delivery app's own logo, a sprite sheet or a tracking pixel inside a food card
looks broken; rendering someone else's stock photo *unlabelled* is worse, because it
asserts something about this restaurant's plate that no source told us.
"""

import asyncio

import pytest

from app.adapters.sources.delivery_app import DeliveryAppAdapter
from app.domain.models import DishOffer
from app.services.imagery import first_usable, is_usable_image


@pytest.mark.parametrize(
    "url",
    [
        "https://cdn.deliveroo.ae/menu/abc123.jpg",
        "https://img.talabat.com/dish/9f2.webp",
        "https://images.example.com/photo.png",
        # Extensionless CDN transform URLs are extremely common and must survive.
        "https://cdn.example.com/image/transform?id=99&w=800",
    ],
)
def test_accepts_real_image_urls(url):
    assert is_usable_image(url)


@pytest.mark.parametrize(
    "url,why",
    [
        ("https://cdn.example.com/assets/logo.png", "the app's wordmark, not the food"),
        ("https://cdn.example.com/sprite-v2.png", "a sprite sheet"),
        ("https://cdn.example.com/placeholder.jpg", "an explicit placeholder"),
        ("https://cdn.example.com/default-dish.png", "a generic default"),
        ("https://cdn.example.com/px/1x1.gif", "a tracking pixel"),
        ("https://cdn.example.com/favicon.ico", "a favicon"),
        ("https://cdn.example.com/page.html", "not an image at all"),
        ("/menu/relative.jpg", "relative — we cannot resolve it here"),
        ("data:image/png;base64,AAAA", "not an http(s) url"),
        ("", "empty"),
        (None, "missing"),
    ],
)
def test_rejects_junk(url, why):
    assert not is_usable_image(url), why


def test_first_usable_prefers_the_dish_photo_over_the_cover():
    assert first_usable(
        "https://cdn.example.com/logo.png",          # junk, skipped
        "https://cdn.example.com/dish.jpg",          # the real dish photo
        "https://cdn.example.com/restaurant.jpg",    # cover, only if the dish had none
    ) == "https://cdn.example.com/dish.jpg"


def test_first_usable_returns_none_rather_than_junk():
    """No photo is an honest answer; a logo in a food card is not."""
    assert first_usable("https://cdn.example.com/logo.png", None, "") is None


def test_backfill_never_raises_when_the_apps_block_us(monkeypatch):
    """An app that refuses the og:image fetch costs us the picture, never the craving."""

    async def boom(_urls):
        raise RuntimeError("connection reset")

    monkeypatch.setattr("app.adapters.sources.delivery_app.og_images", boom)

    offers = [
        DishOffer(restaurant="X", dish="Biryani", price_aed=26.0, app="deliveroo",
                  deep_link="https://deliveroo.ae/en/menu/dubai/x")
    ]
    asyncio.run(DeliveryAppAdapter._backfill_images(offers))
    assert offers[0].image_url is None


def test_backfill_fills_only_the_offers_that_lack_a_photo(monkeypatch):
    async def fake(urls):
        return {u: "https://cdn.example.com/og.jpg" for u in urls}

    monkeypatch.setattr("app.adapters.sources.delivery_app.og_images", fake)

    has_photo = DishOffer(
        restaurant="A", dish="Biryani", price_aed=26.0, app="deliveroo",
        deep_link="https://deliveroo.ae/en/menu/dubai/a",
        image_url="https://cdn.example.com/real-dish.jpg",
    )
    needs_photo = DishOffer(
        restaurant="B", dish="Biryani", price_aed=47.0, app="talabat",
        deep_link="https://www.talabat.com/uae/restaurant/1/b",
    )

    asyncio.run(DeliveryAppAdapter._backfill_images([has_photo, needs_photo]))

    assert has_photo.image_url == "https://cdn.example.com/real-dish.jpg"   # untouched
    assert needs_photo.image_url == "https://cdn.example.com/og.jpg"


def test_url_digits_never_reach_the_spoken_summary():
    """A deep link is full of digits that mean nothing aloud.

    Before this rule, `.../restaurant/763692/...` widened the whitelist of numbers the
    agent was allowed to say, so a fabricated "763692" would have passed the grounding
    gate (docs/CONTRACTS.md §4 rule 2).
    """
    from app.domain.models import DishRecommendation
    from app.services.synthesizer import _numbers_in_pick

    pick = DishRecommendation(
        name="Biryani Rice", restaurant="X", price_aed=26.0, app="talabat",
        url="https://www.talabat.com/uae/restaurant/763692/x?aid=1258",
        image_url="https://cdn.example.com/dish-1200x800.jpg",
        why=["Rated 4.7 from 109 reviews on talabat"], watch_outs=[],
        rating=4.7, review_count=109,
    )
    allowed = _numbers_in_pick(pick)

    assert {26.0, 4.7, 109.0} <= allowed          # real, speakable facts
    assert 763692.0 not in allowed                # restaurant id from the deep link
    assert 1258.0 not in allowed                  # Talabat area id
    assert 1200.0 not in allowed and 800.0 not in allowed   # CDN image dimensions
