import asyncio
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.domain.models import ProductQuery
from app.services.orchestrator import run_research_pipeline
from app.services.synthesizer import synthesizer
from app.db.supabase import db

client = TestClient(app)

# Test 1: Laptop query with low budget constraint
def test_laptop_low_budget_pipeline():
    async def _test():
        query = ProductQuery(
            session_id="test-laptop-session",
            category="laptop",
            budget_aed=4500.0,
            must_haves=["lightweight", "M-series or Ryzen"],
            usage="daily university work"
        )
        job_id = "test-job-laptop-low"
        await db.create_job(job_id, query.session_id, query.model_dump())

        await run_research_pipeline(job_id, query)

        status_data = await db.get_job_status(job_id)
        assert status_data["status"] == "completed"

        verdict = await db.get_verdict(job_id)
        assert verdict is not None
        assert "pick" in verdict
        assert "runner_up" in verdict
        assert len(verdict["spoken_summary"].split()) <= 60

    asyncio.run(_test())


# Test 2: Vacuum category pipeline
def test_vacuum_category_pipeline():
    async def _test():
        query = ProductQuery(
            session_id="test-vacuum-session",
            category="vacuum",
            budget_aed=3000.0,
            must_haves=["pet hair filter", "robot or cordless"],
            usage="cleaning apartment in Dubai"
        )
        job_id = "test-job-vacuum"
        await db.create_job(job_id, query.session_id, query.model_dump())

        await run_research_pipeline(job_id, query)

        status_data = await db.get_job_status(job_id)
        assert status_data["status"] == "completed"

        verdict = await db.get_verdict(job_id)
        assert verdict is not None
        assert verdict["pick"]["price_aed"] > 0
        assert verdict["confidence"] in ["high", "medium", "low"]

    asyncio.run(_test())


# Test 3: Headphones category pipeline
def test_headphones_category_pipeline():
    async def _test():
        query = ProductQuery(
            session_id="test-headphones-session",
            category="headphones",
            budget_aed=1500.0,
            must_haves=["noise cancellation", "wireless"],
            usage="work calls and gym"
        )
        job_id = "test-job-headphones"
        await db.create_job(job_id, query.session_id, query.model_dump())

        await run_research_pipeline(job_id, query)

        verdict = await db.get_verdict(job_id)
        assert verdict is not None
        assert "Sony" in verdict["pick"]["name"] or "AirPods" in verdict["pick"]["name"] or "WH-1000XM5" in verdict["pick"]["name"]

    asyncio.run(_test())


# Test 4: FastAPI Webhook Tool Endpoints (start_research + get_verdict)
def test_fastapi_tool_endpoints():
    # 1. Start research via POST
    response = client.post(
        "/v1/tools/start_research",
        json={"category": "laptop", "budget_aed": 5000.0, "usage": "coding"},
        headers={"X-Dalal-Key": "dalal-secret-123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "running"

    job_id = data["job_id"]

    # Allow background task to execute
    asyncio.run(asyncio.sleep(1.0))

    # 2. Get verdict via POST
    verdict_resp = client.post(
        "/v1/tools/get_verdict",
        json={"job_id": job_id},
        headers={"X-Dalal-Key": "dalal-secret-123"}
    )
    # NEVER 404. Not-ready is the normal case on every poll before research finishes, and
    # a 404 injected mid-conversation breaks the voice agent's turn, so the endpoint
    # always answers 200 and the caller branches on `status` (CONTRACTS.md section 2).
    assert verdict_resp.status_code == 200
    assert verdict_resp.json().get("status") in ("running", "done")


# Test 5: Synthesizer fallback and word count compliance
def test_synthesizer_constraints():
    async def _test():
        query = ProductQuery(category="laptop", budget_aed=5000.0)
        verdict = await synthesizer.build_verdict(query, [])

        # With ZERO sources there is nothing to recommend. Asserting a runner_up with
        # exactly 3 reasons and 2 watch-outs here is only satisfiable by INVENTING them,
        # which is what the old hardcoded synthesizer did. The grounded contract is the
        # opposite: no source -> no pick, and say so honestly (CONTRACTS.md section 4).
        assert verdict.pick is not None
        assert verdict.pick.price_aed == 0.0, "a priceless pick must not carry a price"
        assert verdict.runner_up is None, "must not invent a runner-up from no data"
        assert verdict.confidence == "low"
        assert verdict.why == [] if hasattr(verdict, "why") else True
        assert not verdict.sources_used

        # Ensure spoken summary is strictly within ElevenLabs voice limits (<= 60 words)
        words = verdict.spoken_summary.split()
        assert len(words) <= 60, f"Spoken summary too long: {len(words)} words"

    asyncio.run(_test())
