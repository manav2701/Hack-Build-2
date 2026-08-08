import asyncio
import importlib
import time
import logging
from typing import Any, Dict, List, Tuple, Union

from app.adapters.base import SourceAdapter
from app.adapters.registry import get_domain_config
from app.domain.models import CravingQuery, ProductQuery, SourceResult
from app.services.synthesizer import synthesizer
from app.db.supabase import db

logger = logging.getLogger(__name__)
# A food adapter fetches TWO context.dev pages per app (menu + area listing) and runs
# alongside the reviews adapter, so a cold run measured 14.4s alone and blew the old 20s
# cap under concurrency — the delivery source timed out and the verdict lost every price.
# This is NOT bounded by the agent's 20s webhook timeout: research is a background job and
# get_verdict answers instantly with {status:"running"}. Warm (cached) runs are far faster.
ADAPTER_TIMEOUT_S = 60.0

Query = Union[CravingQuery, ProductQuery]

# The domain seam. DomainConfig.sources (registry.py) names the sources a domain runs;
# this maps each name to its adapter class by MODULE PATH, not by import, so the module
# still loads when a food adapter file has not landed yet. Adding a domain = registry
# entry + one line here.
_ADAPTER_PATHS: Dict[str, Tuple[str, str]] = {
    # shopping
    "marketplace": ("app.adapters.sources.marketplace", "MarketplaceAdapter"),
    "reviews": ("app.adapters.sources.reviews", "ReviewsAdapter"),
    "community": ("app.adapters.sources.community", "CommunityAdapter"),
    "warranty": ("app.adapters.sources.warranty", "WarrantyAdapter"),
    # food
    "delivery_app": ("app.adapters.sources.delivery_app", "DeliveryAppAdapter"),
    "restaurant_reviews": ("app.adapters.sources.restaurant_reviews", "RestaurantReviewsAdapter"),
}

# Food-shape markers vs shopping-shape markers, used to classify a raw webhook body.
_FOOD_FIELDS = frozenset(CravingQuery.model_fields) - {"session_id"}
_SHOPPING_FIELDS = frozenset(ProductQuery.model_fields) - {"session_id"}

# Shopping is a closed allow-list; everything else in `category` is treated as a craving.
_SHOPPING_CATEGORIES = frozenset({"laptop", "vacuum", "headphones"})
# Category values too generic to research as a dish — the craving must come from `dish`.
_GENERIC_FOOD_WORDS = frozenset({"food", "meal", "dish", "restaurant", "cuisine", "eat", "dinner", "lunch"})


def infer_domain(query: Query) -> str:
    """The query type IS the domain selector — no caller passes a domain string."""
    return "food" if isinstance(query, CravingQuery) else "shopping"


def build_query(payload: Dict[str, Any]) -> Query:
    """Turn a raw webhook body into the right query shape.

    Parsed here rather than by a FastAPI Union body because (a) both shapes are
    all-optional, so a smart-union would silently coerce a shopping body into a
    CravingQuery, and (b) a validation error would surface as a 422 mid-conversation,
    which an ElevenLabs webhook tool must never receive. Unknown/garbled bodies fall
    back to the active product direction (food) with defaults.
    """
    payload = payload or {}
    keys = set(payload)

    # The live agent sends {category, dish?, budget_aed?} with `dish` OPTIONAL
    # (docs/ELEVENLABS_TOOLS_CONFIG.md). If the model omits `dish`, the body looks
    # shopping-shaped and a food craving would silently run the whole shopping pipeline.
    # Shopping is therefore an ALLOW-LIST of the three known product categories; anything
    # else in `category` is a craving, because food is the active product direction.
    category = str(payload.get("category") or "").strip().lower()
    is_shopping_category = category in _SHOPPING_CATEGORIES

    if is_shopping_category:
        model: type[Query] = ProductQuery
    elif (keys & _FOOD_FIELDS) or category or not (keys & _SHOPPING_FIELDS):
        model = CravingQuery
    else:
        model = ProductQuery

    if model is CravingQuery and not str(payload.get("dish") or "").strip() and category:
        # A cuisine or dish arrived in `category` ("sushi", "chinese"). Use it as the
        # craving — researching the literal word "food" would find nothing useful.
        if category not in _GENERIC_FOOD_WORDS:
            payload = {**payload, "dish": category}

    try:
        return model(**payload)
    except Exception as exc:
        # Never 4xx a voice tool: degrade to defaults and say so in the log.
        logger.warning("Invalid %s payload (%s); falling back to defaults", model.__name__, exc)
        return model()


def resolve_adapters(domain: str) -> List[SourceAdapter]:
    """Instantiate the adapters DomainConfig.sources names, skipping any not yet shipped."""
    config = get_domain_config(domain)
    adapters: List[SourceAdapter] = []
    for source in config.sources:
        path = _ADAPTER_PATHS.get(source)
        if not path:
            logger.warning("Domain '%s' names unknown source '%s'; skipping", domain, source)
            continue
        module_path, class_name = path
        try:
            adapters.append(getattr(importlib.import_module(module_path), class_name)())
        except (ImportError, AttributeError) as exc:
            # Honest degradation: a source under concurrent construction must not
            # take down the run — the verdict is built from whatever did resolve.
            logger.warning("Adapter '%s' unavailable (%s); skipping", source, exc)
    return adapters


async def run_research_pipeline(job_id: str, query: Query) -> None:
    """Runs the active domain's adapters in parallel, records each, then builds the Verdict."""
    domain = infer_domain(query)
    adapters = resolve_adapters(domain)
    logger.info(
        "Starting research job %s [domain=%s] with adapters: %s",
        job_id, domain, [a.name for a in adapters] or "none",
    )

    tasks = [_run_single_adapter(job_id, adapter, query) for adapter in adapters]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    clean_results: List[SourceResult] = []
    for res in results:
        if isinstance(res, SourceResult):
            clean_results.append(res)
        elif isinstance(res, Exception):
            logger.error(f"Adapter execution exception in job {job_id}: {res}")

    verdict = await synthesizer.build_verdict(query, clean_results)

    # Save final verdict to Supabase & set job status to completed
    await db.save_verdict(job_id, verdict.dict())
    logger.info(f"Completed research job {job_id} successfully")


async def _run_single_adapter(job_id: str, adapter: SourceAdapter, query: Query) -> SourceResult:
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
