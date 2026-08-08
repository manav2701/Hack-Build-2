# Data Contracts & Schemas — Dalal (دلال)

This file defines the frozen API and domain contracts for Dalal.

## 1. Domain Models (`apps/api/app/domain/models.py`)

```python
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, HttpUrl

class ProductQuery(BaseModel):
    session_id: str
    category: Literal["laptop", "vacuum", "headphones", "smartwatch"]
    budget_aed: float
    must_haves: list[str] = []
    deal_breakers: list[str] = []
    usage: str = ""

class Offer(BaseModel):
    title: str
    price_aed: float
    retailer: Literal["noon", "amazon_ae", "sharaf_dg", "other"]
    url: str
    in_stock: Optional[bool] = True
    captured_at: datetime = datetime.utcnow()

class SourceResult(BaseModel):
    source: Literal["marketplace", "reviews", "community", "warranty"]
    status: Literal["ok", "partial", "failed"]
    facts: list[str] = []
    offers: list[Offer] = []
    citations: list[str] = []
    latency_ms: int = 0
    error: Optional[str] = None

class Recommendation(BaseModel):
    name: str
    price_aed: float
    retailer: str
    url: str
    why: list[str]          # exactly 3 bullet points
    watch_outs: list[str]   # exactly 2 bullet points
    warranty_note: Optional[str] = None

class Verdict(BaseModel):
    pick: Recommendation
    runner_up: Recommendation
    price_note: str
    confidence: Literal["high", "medium", "low"]
    sources_used: list[str]
    spoken_summary: str     # <= 60 words. Agent reads ONLY this field!
```

## 2. ElevenLabs Tool Endpoints (`/v1/tools/*`)

### `POST /v1/tools/start_research`
- **Headers**: `X-Dalal-Key: <secret>`
- **Request Body**: `ProductQuery`
- **Response**: `{ "job_id": "uuid", "status": "running", "eta_seconds": 45 }` (latency < 500ms)

### `GET /v1/tools/research_status?job_id={job_id}`
- **Headers**: `X-Dalal-Key: <secret>`
- **Response**: `{ "status": "running|completed", "done": 3, "total": 4, "teaser": "Found offers under 4000 AED" }`

### `GET /v1/tools/get_verdict?job_id={job_id}`
- **Headers**: `X-Dalal-Key: <secret>`
- **Response**: `Verdict` schema

## 3. Supabase Database Schema
- `sessions`: `id (uuid)`, `created_at`, `transcript_url`
- `research_jobs`: `id (uuid)`, `session_id`, `query (jsonb)`, `status`, `created_at`, `completed_at`
- `source_results`: `id (uuid)`, `job_id (fk)`, `source`, `status`, `payload (jsonb)`, `latency_ms`
- `verdicts`: `job_id (uuid pk)`, `payload (jsonb)`, `created_at`
