from datetime import datetime
from typing import Literal, Optional, List
from pydantic import BaseModel, Field

class ProductQuery(BaseModel):
    session_id: str = "demo-session"
    category: Literal["laptop", "vacuum", "headphones"] = "laptop"
    budget_aed: float = Field(default=5000.0, description="Target budget in AED")
    must_haves: List[str] = Field(default_factory=list, description="User must-have features")
    deal_breakers: List[str] = Field(default_factory=list, description="User deal breakers")
    usage: str = Field(default="", description="Free text description of usage")

class Offer(BaseModel):
    title: str
    price_aed: float
    retailer: Literal["noon", "amazon_ae", "sharaf_dg", "other"]
    url: str
    in_stock: Optional[bool] = True
    captured_at: datetime = Field(default_factory=datetime.utcnow)

class SourceResult(BaseModel):
    source: Literal["marketplace", "reviews", "community", "warranty"]
    status: Literal["ok", "partial", "failed"]
    facts: List[str] = Field(default_factory=list)
    offers: List[Offer] = Field(default_factory=list)
    citations: List[str] = Field(default_factory=list)
    latency_ms: int = 0
    error: Optional[str] = None

class Recommendation(BaseModel):
    name: str
    price_aed: float
    retailer: str
    url: str
    why: List[str] = Field(description="Exactly 3 key selling points", max_length=3)
    watch_outs: List[str] = Field(description="Exactly 2 watch-outs/cons", max_length=2)
    warranty_note: Optional[str] = None

class Verdict(BaseModel):
    pick: Recommendation
    runner_up: Recommendation
    price_note: str
    confidence: Literal["high", "medium", "low"]
    sources_used: List[str]
    spoken_summary: str  # <= 60 words for the agent to read out loud

class StartResearchResponse(BaseModel):
    job_id: str
    status: str = "running"
    eta_seconds: int = 45

class ResearchStatusResponse(BaseModel):
    status: str
    done: int
    total: int = 4
    teaser: str
