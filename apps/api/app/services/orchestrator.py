import asyncio
import time
import logging
from typing import List
from app.domain.models import ProductQuery, SourceResult
from app.adapters.sources import MarketplaceAdapter, ReviewsAdapter, CommunityAdapter, WarrantyAdapter
from app.services.synthesizer import synthesizer
from app.db.supabase import db

logger = logging.getLogger(__name__)
ADAPTER_TIMEOUT_S = 20.0

async def run_research_pipeline(job_id: str, query: ProductQuery) -> None:
    """Executes 4 parallel scraping jobs, records each in Supabase, and builds Verdict."""
    logger.info(f"Starting research job {job_id} for category '{query.category}'")

    adapters = [
        MarketplaceAdapter(),
        ReviewsAdapter(),
        CommunityAdapter(),
        WarrantyAdapter()
    ]

    tasks = [_run_single_adapter(job_id, adapter, query) for adapter in adapters]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    clean_results: List[SourceResult] = []
    for res in results:
        if isinstance(res, SourceResult):
            clean_results.append(res)
        elif isinstance(res, Exception):
            logger.error(f"Adapter execution exception in job {job_id}: {res}")

    # Build final 2-product verdict
    verdict = await synthesizer.build_verdict(query, clean_results)

    # Save final verdict to Supabase & set job status to completed
    await db.save_verdict(job_id, verdict.dict())
    logger.info(f"Completed research job {job_id} successfully")

async def _run_single_adapter(job_id: str, adapter, query: ProductQuery) -> SourceResult:
    start_time = time.perf_counter()
    try:
        result = await asyncio.wait_for(adapter.run(query), timeout=ADAPTER_TIMEOUT_S)
    except asyncio.TimeoutError:
        logger.warning(f"Adapter {adapter.name} timed out after {ADAPTER_TIMEOUT_S}s")
        result = SourceResult(
            source=adapter.name,
            status="failed",
            error="Timeout exceeded 20s",
            latency_ms=int(ADAPTER_TIMEOUT_S * 1000)
        )
    except Exception as exc:
        logger.error(f"Adapter {adapter.name} failed: {exc}")
        result = SourceResult(
            source=adapter.name,
            status="failed",
            error=str(exc),
            latency_ms=int((time.perf_counter() - start_time) * 1000)
        )

    # Record progress immediately to Supabase -> fires Realtime push to Next.js
    await db.record_source_result(job_id, result.dict())
    return result
