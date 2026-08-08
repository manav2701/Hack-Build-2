import asyncio
import json
from pathlib import Path

from app.adapters.registry import get_category_spec
from app.adapters.sources import (
    MarketplaceAdapter,
    ReviewsAdapter,
    CommunityAdapter,
    WarrantyAdapter,
)
from app.db.supabase import db
from app.domain.models import ProductQuery
from app.services.orchestrator import build_query, infer_domain, run_research_pipeline

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "golden_smartwatch.json").read_text()
)

def _query() -> ProductQuery:
    return ProductQuery(
        session_id="test-session-smartwatch",
        category="smartwatch",
        budget_aed=FIXTURE["budget_aed"],
        must_haves=["cellular esim", "bright display"],
        usage="outdoor running and calls without carrying a phone",
    )

def test_smartwatch_category_spec_registered():
    spec = get_category_spec("smartwatch")
    assert spec.category == "smartwatch"
    assert spec.marketplace_queries and spec.review_seeds
    assert any("esim" in kw.lower() for kw in spec.community_keywords)
    assert spec.warranty_urls

def test_smartwatch_webhook_body_routes_to_shopping():
    query = build_query({"category": "smartwatch", "budget_aed": 3500})
    assert isinstance(query, ProductQuery)
    assert infer_domain(query) == "shopping"

def test_smartwatch_adapters_return_local_context():
    async def _test():
        query = _query()
        marketplace, reviews, community, warranty = await asyncio.gather(
            MarketplaceAdapter().run(query),
            ReviewsAdapter().run(query),
            CommunityAdapter().run(query),
            WarrantyAdapter().run(query),
        )

        assert marketplace.status == "ok"
        expected = {(o["title"], o["price_aed"], o["retailer"]) for o in FIXTURE["offers"]}
        assert {(o.title, o.price_aed, o.retailer) for o in marketplace.offers} == expected

        assert any("Ultra 2" in fact for fact in reviews.facts)

        assert community.status == "ok"
        community_text = " ".join(community.facts).lower()
        assert "esim" in community_text
        assert "e& (etisalat)" in community_text and "du " in community_text

        warranty_text = " ".join(warranty.facts).lower()
        assert "jumbo" in warranty_text
        assert "apple 1-year limited warranty" in warranty_text

    asyncio.run(_test())

def test_smartwatch_verdict_pipeline():
    async def _test():
        query = _query()
        job_id = "test-job-smartwatch-1"
        await db.create_job(job_id, query.session_id, query.model_dump())

        await run_research_pipeline(job_id, query)

        status_data = await db.get_job_status(job_id)
        assert status_data["status"] == "completed"
        assert status_data["done"] == 4

        verdict = await db.get_verdict(job_id)
        assert verdict is not None
        # Ranking prefers an in-budget official-store listing, so the Apple Watch wins.
        assert "Apple Watch Ultra 2" in verdict["pick"]["name"]
        assert "Galaxy Watch 6" in verdict["runner_up"]["name"]
        assert verdict["pick"]["price_aed"] <= query.budget_aed
        assert 1 <= len(verdict["pick"]["why"]) <= 3
        assert len(verdict["pick"]["watch_outs"]) <= 2
        assert "Jumbo" in verdict["pick"]["warranty_note"]
        assert len(verdict["spoken_summary"].split()) <= 60

    asyncio.run(_test())
