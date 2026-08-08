import asyncio
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.domain.models import ProductQuery
from app.adapters.sources import MarketplaceAdapter, ReviewsAdapter, CommunityAdapter, WarrantyAdapter
from app.services.orchestrator import run_research_pipeline
from app.db.supabase import db

# Output directory for generalized structures
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "payload_structures"))
os.makedirs(OUTPUT_DIR, exist_ok=True)

def json_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

async def generate_all_structures():
    print("[Dalal Generator] Querying endpoints and source adapters...")

    query = ProductQuery(
        session_id="gen-struct-session-123",
        category="laptop",
        budget_aed=5000.0,
        must_haves=["long battery", "16GB RAM"],
        usage="software development & travel"
    )

    # 1. Query Marketplace Adapter
    m_adapter = MarketplaceAdapter()
    m_res = await m_adapter.run(query)
    save_file("1_marketplace_adapter.json", m_res.model_dump())

    # 2. Query Reviews Adapter
    r_adapter = ReviewsAdapter()
    r_res = await r_adapter.run(query)
    save_file("2_reviews_adapter.json", r_res.model_dump())

    # 3. Query Community Adapter
    c_adapter = CommunityAdapter()
    c_res = await c_adapter.run(query)
    save_file("3_community_adapter.json", c_res.model_dump())

    # 4. Query Warranty Adapter
    w_adapter = WarrantyAdapter()
    w_res = await w_adapter.run(query)
    save_file("4_warranty_adapter.json", w_res.model_dump())

    # 5. Run Full Orchestrator Job
    job_id = "struct-job-uuid-999"
    await db.create_job(job_id, query.session_id, query.model_dump())
    await run_research_pipeline(job_id, query)

    # 6. Query Research Status Endpoint Structure
    status_payload = await db.get_job_status(job_id)
    save_file("5_research_status_endpoint.json", status_payload)

    # 7. Query Final Verdict Endpoint Structure
    verdict_payload = await db.get_verdict(job_id)
    save_file("6_verdict_endpoint.json", verdict_payload)

    # 8. Create Generalized Master Contract Index
    master_index = {
        "generated_at": datetime.utcnow().isoformat(),
        "adapters": ["marketplace", "reviews", "community", "warranty"],
        "endpoints": ["/start_research", "/research_status", "/get_verdict"],
        "files_saved": [
            "1_marketplace_adapter.json",
            "2_reviews_adapter.json",
            "3_community_adapter.json",
            "4_warranty_adapter.json",
            "5_research_status_endpoint.json",
            "6_verdict_endpoint.json"
        ]
    }
    save_file("master_payload_index.json", master_index)

    print(f"[Dalal Generator] All payload structures successfully saved to: {OUTPUT_DIR}")

def save_file(filename: str, data: dict):
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=json_serializer)
    print(f" Saved structure: {filename}")

if __name__ == "__main__":
    asyncio.run(generate_all_structures())
