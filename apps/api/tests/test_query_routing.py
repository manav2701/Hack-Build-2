"""Webhook body -> query shape routing.

The live ElevenLabs agent sends {category, dish?, budget_aed?} with `dish` OPTIONAL
(docs/ELEVENLABS_TOOLS_CONFIG.md). If the model omits `dish`, a food craving must NOT
silently run the shopping pipeline.
"""
import pytest

from app.domain.models import CravingQuery, ProductQuery
from app.services.orchestrator import build_query, infer_domain


@pytest.mark.parametrize("payload", [
    {"category": "food", "dish": "sushi"},
    {"category": "food", "dish": "local sichuan wontons", "budget_aed": 100},
    {"dish": "biryani"},
    {"category": "food"},                       # dish omitted by the LLM
    {"category": "Food", "budget_aed": 80},     # capitalised, no dish
    {},                                         # garbled/empty body
])
def test_food_bodies_route_to_the_food_pipeline(payload):
    q = build_query(payload)
    assert isinstance(q, CravingQuery)
    assert infer_domain(q) == "food"


@pytest.mark.parametrize("payload", [
    {"category": "laptop", "budget_aed": 5000},
    {"category": "vacuum"},
    {"category": "headphones", "must_haves": ["anc"]},
])
def test_shopping_bodies_still_route_to_the_shopping_pipeline(payload):
    q = build_query(payload)
    assert isinstance(q, ProductQuery)
    assert infer_domain(q) == "shopping"


def test_a_cuisine_sent_as_category_becomes_the_craving():
    """Researching the literal word 'food' would find nothing useful."""
    q = build_query({"category": "sushi"})
    assert isinstance(q, CravingQuery)
    assert q.dish == "sushi"


def test_dish_wins_over_category_when_both_are_present():
    q = build_query({"category": "food", "dish": "xiao long bao"})
    assert q.dish == "xiao long bao"


def test_a_malformed_body_never_raises():
    """An ElevenLabs webhook tool must never receive a 4xx mid-conversation."""
    q = build_query({"category": None, "dish": 12345, "budget_aed": "not a number"})
    assert isinstance(q, (CravingQuery, ProductQuery))
