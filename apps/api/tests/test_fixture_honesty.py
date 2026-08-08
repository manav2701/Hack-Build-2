"""Sample data must never be mistaken for a live answer.

The failure this guards against actually shipped: a user asked for **dosa** in Downtown
Dubai, the live search legitimately found none, the adapter fell back to fixtures, and
the agent said out loud

    "Go with Nan Xiang Xiao Long Bao on deliveroo: Pork Xiao Long Bao is AED 48."

Two independent things went wrong, so both are tested independently:

  1. a LIVE search that finds nothing must return an empty result, not sample data —
     "no app carries this in this area" is a real answer and far more useful than a
     confident wrong one;
  2. whenever a verdict *does* rest on fixtures, the SPOKEN line must say so. The badge
     on the card is not disclosure to someone who is listening rather than looking.
"""

import asyncio

from app.adapters.sources.delivery_app import DeliveryAppAdapter
from app.domain.models import CravingQuery, DishOffer, RestaurantReview, SourceResult
from app.services.synthesizer import synthesizer


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------- (1) no fixtures on empty live

def test_live_search_with_no_results_returns_empty_not_fixtures(monkeypatch):
    adapter = DeliveryAppAdapter()

    monkeypatch.setattr('app.adapters.sources.delivery_app.context_client.is_live', lambda: True)

    async def found_nothing(_query):
        # What a genuine "this dish is not sold in this area" looks like.
        return [], ['[context.dev LIVE] talabat: no dosa offer in Downtown Dubai.'], [], {'talabat': 0}

    monkeypatch.setattr(adapter, '_live', found_nothing)

    result = _run(adapter.run(CravingQuery(dish='dosa', area='Downtown Dubai')))

    assert result.is_fixture is False, 'an empty live search must not be dressed up as data'
    assert result.dish_offers == []
    assert result.status == 'ok'
    # Specifically: none of the fixture restaurants may appear.
    assert 'Xiao Long Bao' not in str(result.dish_offers)


def test_fixtures_still_serve_the_no_api_key_path(monkeypatch):
    """Fixtures keep the demo working without a key — that is their only job."""
    adapter = DeliveryAppAdapter()
    monkeypatch.setattr('app.adapters.sources.delivery_app.context_client.is_live', lambda: False)

    result = _run(adapter.run(CravingQuery(dish='anything', area='Dubai')))

    assert result.is_fixture is True
    assert result.dish_offers, 'the offline demo path still needs sample offers'


# ---------------------------------------------------------------- (2) spoken disclosure

def _fixture_source() -> SourceResult:
    return SourceResult(
        source='delivery_app', status='ok', is_fixture=True,
        dish_offers=[
            DishOffer(restaurant='Nan Xiang Xiao Long Bao', dish='Pork Xiao Long Bao (6 pcs)',
                      price_aed=48.0, app='deliveroo', deep_link='https://deliveroo.ae/en/menu/x',
                      rating=4.8, review_count=500, is_fixture=True),
        ],
    )


def test_spoken_summary_discloses_sample_data():
    verdict = _run(synthesizer.build_verdict(
        CravingQuery(dish='xiao long bao', area='Dubai'), [_fixture_source()]
    ))

    assert verdict.is_fixture is True
    spoken = verdict.spoken_summary.lower()
    assert 'sample data' in spoken, (
        'a listener who never looks at the screen was told a fixture price as fact'
    )
    # The disclosure has to come FIRST — after the recommendation is too late.
    assert spoken.index('sample data') < spoken.index('xiao long bao')


def test_live_verdict_carries_no_disclosure():
    """The warning must not cry wolf on real data, or it stops meaning anything."""
    live = SourceResult(
        source='delivery_app', status='ok', is_fixture=False,
        dish_offers=[
            DishOffer(restaurant='Malgudi - Karama', dish='Mini Cheese Dosa', price_aed=21.0,
                      app='talabat', deep_link='https://www.talabat.com/uae/restaurant/1/malgudi',
                      rating=4.5, review_count=300, is_fixture=False),
        ],
    )
    verdict = _run(synthesizer.build_verdict(CravingQuery(dish='dosa', area='Dubai'), [live]))

    assert verdict.is_fixture is False
    assert 'sample data' not in verdict.spoken_summary.lower()


def test_nothing_found_is_spoken_as_nothing_found():
    """The end-to-end shape of the dosa case, once the fixture fallback is gone."""
    empty = SourceResult(source='delivery_app', status='ok', is_fixture=False, dish_offers=[])
    verdict = _run(synthesizer.build_verdict(
        CravingQuery(dish='dosa', area='Downtown Dubai'), [empty]
    ))

    assert verdict.confidence == 'low'
    assert verdict.pick.price_aed == 0.0
    assert verdict.pick.restaurant == ''
    spoken = verdict.spoken_summary.lower()
    assert 'could not find' in spoken
    # And it must offer the thing that actually fixes it — a wider area.
    assert 'area' in spoken
