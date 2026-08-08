import logging
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)

# In-memory storage fallback for local dev & testing
_in_memory_jobs: Dict[str, Dict[str, Any]] = {}
_in_memory_sources: Dict[str, list] = {}
_in_memory_verdicts: Dict[str, Dict[str, Any]] = {}

class SupabaseService:
    def __init__(self):
        self.client = None
        if settings.SUPABASE_URL and settings.SUPABASE_KEY and not "demo" in settings.SUPABASE_URL:
            try:
                from supabase import create_client
                self.client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
                logger.info("Connected to Supabase Realtime DB")
            except Exception as e:
                logger.warning(f"Supabase client initialization skipped: {e}")

    async def create_job(self, job_id: str, session_id: str, query: dict,
                         user_id: Optional[str] = None) -> None:
        record = {"id": job_id, "session_id": session_id, "query": query, "status": "running"}
        # Kept off `record` so the Supabase insert still matches the existing table schema
        # (no user_id column) — the ownership link lives in the accounts store instead.
        _in_memory_jobs[job_id] = {**record, "user_id": user_id}
        _in_memory_sources[job_id] = []
        if self.client:
            try:
                self.client.table("research_jobs").insert(record).execute()
            except Exception as e:
                logger.warning(f"Failed to insert research_job to Supabase: {e}")

    async def record_source_result(self, job_id: str, result: dict) -> None:
        if job_id not in _in_memory_sources:
            _in_memory_sources[job_id] = []
        _in_memory_sources[job_id].append(result)

        if self.client:
            try:
                payload = {
                    "job_id": job_id,
                    "source": result.get("source"),
                    "status": result.get("status"),
                    "payload": result,
                    "latency_ms": result.get("latency_ms", 0)
                }
                self.client.table("source_results").insert(payload).execute()
            except Exception as e:
                logger.warning(f"Failed to record source_result to Supabase: {e}")

    async def save_verdict(self, job_id: str, verdict: dict) -> None:
        _in_memory_verdicts[job_id] = verdict
        if job_id in _in_memory_jobs:
            _in_memory_jobs[job_id]["status"] = "completed"

        # Persist to the signed-in user's history. Imported lazily to keep the accounts
        # store from being a hard dependency of the research path — a failure to record
        # history must never lose the verdict itself.
        try:
            from app.services.auth import store as user_store
            user_store.save_job_verdict(job_id, verdict)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed to save verdict to user history: {e}")

        if self.client:
            try:
                self.client.table("verdicts").insert({"job_id": job_id, "payload": verdict}).execute()
                self.client.table("research_jobs").update({"status": "completed"}).eq("id", job_id).execute()
            except Exception as e:
                logger.warning(f"Failed to save verdict to Supabase: {e}")

    async def get_job_status(self, job_id: str) -> dict:
        job = _in_memory_jobs.get(job_id, {"status": "running"})
        sources = _in_memory_sources.get(job_id, [])
        return {
            "status": job.get("status", "running"),
            "done": len(sources),
            "total": 4,
            "teaser": f"Gathered facts from {len(sources)} sources"
        }

    async def get_verdict(self, job_id: str) -> Optional[dict]:
        return _in_memory_verdicts.get(job_id)

    async def get_latest_job(self) -> Optional[dict]:
        """The most recently created job, for the browser to attach to.

        The voice agent calls start_research from ElevenLabs' cloud, so the browser
        never sees the job_id in a response — without this it has nothing to poll and
        the UI spins forever. Newest-wins is fine for a single-user demo; a
        multi-user build would scope this by session_id.
        """
        if not _in_memory_jobs:
            return None
        job_id = next(reversed(_in_memory_jobs))
        job = _in_memory_jobs[job_id]
        return {"job_id": job_id, "status": job.get("status", "running"),
                "query": job.get("query", {})}

db = SupabaseService()
