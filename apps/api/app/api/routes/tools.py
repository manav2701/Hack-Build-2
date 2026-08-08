import uuid
from typing import Any, Dict

from fastapi import APIRouter, Body, Header, HTTPException, BackgroundTasks

from app.domain.models import StartResearchResponse, ResearchStatusResponse
from app.services.orchestrator import build_query, run_research_pipeline
from app.services.auth import current_user, store as user_store
from app.db.supabase import db
from app.config import settings

router = APIRouter(prefix="/v1/tools", tags=["ElevenLabs Webhooks"])

# Example bodies only — the real parsing lives in the orchestrator service.
_CRAVING_EXAMPLE = {
    "session_id": "demo-session",
    "dish": "authentic Sichuan wontons",
    "mode": "delivery",
    "refiners": ["spicy", "authentic"],
    "area": "Downtown Dubai",
}
_PRODUCT_EXAMPLE = {"session_id": "demo-session", "category": "laptop", "budget_aed": 5000.0}

def verify_secret(x_dalal_key: str = Header(None, alias="X-Dalal-Key")):
    if settings.DALAL_SECRET_KEY and settings.DALAL_SECRET_KEY != "dalal-secret-123":
        if x_dalal_key != settings.DALAL_SECRET_KEY:
            raise HTTPException(status_code=401, detail="Invalid X-Dalal-Key header")

@router.post("/start_research", response_model=StartResearchResponse)
async def start_research(
    background_tasks: BackgroundTasks,
    payload: Dict[str, Any] = Body(
        default_factory=dict,
        openapi_examples={"food": {"value": _CRAVING_EXAMPLE}, "shopping": {"value": _PRODUCT_EXAMPLE}},
    ),
    x_dalal_key: str = Header(None, alias="X-Dalal-Key"),
    authorization: str = Header(None),
):
    verify_secret(x_dalal_key)

    # Raw body in, typed query out: the shape decision (food vs shopping) is a service
    # concern, and a permissive body keeps a malformed webhook call off the 422 path.
    query = build_query(payload)

    job_id = str(uuid.uuid4())
    session_id = query.session_id or str(uuid.uuid4())

    # Auth is OPTIONAL here on purpose. The voice agent calls this from ElevenLabs' cloud
    # with no user token, and that anonymous path must keep working exactly as before;
    # a token, when present, only adds the job to that user's history.
    user = current_user(authorization)
    user_id = user["id"] if user else None

    # Create job in database
    await db.create_job(job_id, session_id, query.dict(), user_id=user_id)
    if user_id:
        user_store.attach_job(
            job_id, user_id,
            dish=str(getattr(query, "dish", "") or getattr(query, "category", "")),
            area=str(getattr(query, "area", "")),
        )

    # Trigger background asyncio research pipeline immediately (returns < 500ms)
    background_tasks.add_task(run_research_pipeline, job_id, query)

    return StartResearchResponse(job_id=job_id, status="running", eta_seconds=45)

@router.get("/research_status", response_model=ResearchStatusResponse)
async def research_status(
    job_id: str,
    x_dalal_key: str = Header(None, alias="X-Dalal-Key")
):
    verify_secret(x_dalal_key)
    status_data = await db.get_job_status(job_id)
    return ResearchStatusResponse(
        status=status_data.get("status", "running"),
        done=status_data.get("done", 0),
        total=status_data.get("total", 4),
        teaser=status_data.get("teaser", "Researching live market...")
    )

# The browser cannot learn the job_id any other way: the agent calls start_research from
# ElevenLabs' cloud, so that response never reaches the page. Without this the UI has
# nothing to poll and spins forever while the research actually completes server-side.
@router.get("/latest_job")
async def latest_job(
    x_dalal_key: str = Header(None, alias="X-Dalal-Key"),
    authorization: str = Header(None),
):
    verify_secret(x_dalal_key)

    # A signed-in browser attaches to ITS OWN newest job. Newest-wins globally is fine
    # for a single-user demo but wrong the moment two people use the deployed app at
    # once — you would watch a stranger's verdict appear on your screen. The voice agent
    # still starts jobs anonymously, so an authenticated user with no jobs of their own
    # falls back to the global newest rather than staring at an empty panel.
    user = current_user(authorization)
    if user:
        owned = user_store.latest_job_for(user["id"])
        if owned:
            status = await db.get_job_status(owned["job_id"])
            return {"job_id": owned["job_id"], "status": status.get("status", "running"),
                    "query": {"dish": owned.get("dish", ""), "area": owned.get("area", "")},
                    "scope": "user"}

    job = await db.get_latest_job()
    return {**job, "scope": "global"} if job else {"job_id": None, "status": "idle"}


async def _verdict_payload(job_id: str) -> Dict[str, Any]:
    verdict = await db.get_verdict(job_id)
    if not verdict:
        # Not-ready is the NORMAL case on every poll before research finishes, and an
        # unknown job_id is indistinguishable from it here. A 404 injected mid-call
        # breaks the agent's turn, so both answer 200 and the client branches on status.
        return {"status": "running", "job_id": job_id}
    return {**verdict, "status": "done", "job_id": job_id}


# POST is the shape the LIVE ElevenLabs agent is configured against
# (docs/ELEVENLABS_TOOLS_CONFIG.md — the agent sends {"job_id": ...}). The dashboard
# config is the harder side to change, so the backend matches IT.
@router.post("/get_verdict")
async def get_verdict_post(
    payload: Dict[str, Any] = Body(default_factory=dict, openapi_examples={
        "poll": {"value": {"job_id": "0f8c...-uuid"}}}),
    x_dalal_key: str = Header(None, alias="X-Dalal-Key"),
):
    verify_secret(x_dalal_key)
    return await _verdict_payload(str((payload or {}).get("job_id") or ""))


# GET is kept for the browser poller and manual curl checks. Same body either way.
@router.get("/get_verdict")
async def get_verdict(
    job_id: str,
    x_dalal_key: str = Header(None, alias="X-Dalal-Key")
):
    verify_secret(x_dalal_key)
    return await _verdict_payload(job_id)
