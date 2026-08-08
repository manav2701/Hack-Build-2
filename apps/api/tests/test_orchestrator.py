import asyncio
import pytest
from app.domain.models import ProductQuery
from app.services.orchestrator import run_research_pipeline
from app.db.supabase import db

def test_research_pipeline_execution():
    async def _test():
        query = ProductQuery(
            session_id="test-session-123",
            category="laptop",
            budget_aed=5000.0,
            must_haves=["long battery", "16GB RAM"],
            usage="software development and travel"
        )

        job_id = "test-job-uuid-123"
        await db.create_job(job_id, query.session_id, query.dict())

        # Execute orchestrator pipeline
        await run_research_pipeline(job_id, query)

        # Check status
        status_data = await db.get_job_status(job_id)
        assert status_data["status"] == "completed"
        assert status_data["done"] == 4

        # Check verdict
        verdict = await db.get_verdict(job_id)
        assert verdict is not None
        assert "MacBook" in verdict["pick"]["name"] or "Lenovo" in verdict["pick"]["name"]
        assert verdict["pick"]["price_aed"] <= 5000.0
        assert len(verdict["spoken_summary"].split()) <= 60

    asyncio.run(_test())
