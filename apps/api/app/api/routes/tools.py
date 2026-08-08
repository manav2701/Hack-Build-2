import uuid
import asyncio
from fastapi import APIRouter, Header, HTTPException, BackgroundTasks
from app.domain.models import ProductQuery, StartResearchResponse, ResearchStatusResponse
from app.services.orchestrator import run_research_pipeline
from app.db.supabase import db
from app.config import settings

router = APIRouter(prefix="/v1/tools", tags=["ElevenLabs Webhooks"])

def verify_secret(x_dalal_key: str = Header(None, alias="X-Dalal-Key")):
    if settings.DALAL_SECRET_KEY and settings.DALAL_SECRET_KEY != "dalal-secret-123":
        if x_dalal_key != settings.DALAL_SECRET_KEY:
            raise HTTPException(status_code=401, detail="Invalid X-Dalal-Key header")

@router.post("/start_research", response_model=StartResearchResponse)
async def start_research(
    query: ProductQuery,
    background_tasks: BackgroundTasks,
    x_dalal_key: str = Header(None, alias="X-Dalal-Key")
):
    verify_secret(x_dalal_key)

    job_id = str(uuid.uuid4())
    session_id = query.session_id or str(uuid.uuid4())

    # Create job in database
    await db.create_job(job_id, session_id, query.dict())

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

@router.get("/get_verdict")
async def get_verdict(
    job_id: str,
    x_dalal_key: str = Header(None, alias="X-Dalal-Key")
):
    verify_secret(x_dalal_key)
    verdict = await db.get_verdict(job_id)
    if not verdict:
        raise HTTPException(status_code=404, detail="Verdict not ready yet or job_id invalid")
    return verdict
