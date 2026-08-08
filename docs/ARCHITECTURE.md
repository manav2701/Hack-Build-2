# System Architecture — Dalal (دلال)

## High-Level Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Agent as ElevenLabs WebRTC Agent
    participant Web as Next.js 15 Client
    participant API as FastAPI Orchestrator
    participant Context as context.dev API
    participant DB as Supabase Realtime DB

    User->>Agent: "I need a gaming laptop under 5000 AED for video editing"
    Agent->>API: POST /v1/tools/start_research (ProductQuery)
    API-->>Agent: { job_id, status: "running" } (<500ms)
    
    par Async parallel scrape
        API->>Context: Scrape Noon & Amazon.ae (Marketplace)
        API->>Context: Scrape RTings/Tech Reviews (Reviews)
        API->>Context: Scrape r/dubai & r/UAE (Community)
        API->>Context: Scrape Warranty Blogs (Warranty)
    and Voice chit-chat (Zero dead air)
        Agent->>User: "Checking live prices, r/dubai complaints, and warranty terms..."
    end

    Context-->>API: Scraped facts & offers
    API->>DB: Record source results & Verdict
    DB-->>Web: Realtime push notification (job completed)
    Web->>Agent: sendContextualUpdate("RESEARCH_COMPLETE ...")
    Agent->>API: GET /v1/tools/get_verdict?job_id=...
    API-->>Agent: Verdict (spoken_summary + recommendations)
    Agent->>User: Speaks 2-product verdict & displays UI cards
```

## Key Architectural Decisions

1. **Decoupled Asynchronous Execution**:
   - Webhook tools in ElevenLabs must respond in <500ms to prevent agent timeouts or hallucination.
   - `start_research` launches background `asyncio.gather()` jobs and immediately returns `{ job_id, status: "running" }`.

2. **Realtime Push Channel**:
   - Supabase Realtime streams adapter progress rows into Next.js.
   - When 4 sources finish (or max timeout is reached), Next.js fires `sendContextualUpdate("RESEARCH_COMPLETE")` on the WebRTC session.

3. **Resilient Partial Degradation**:
   - Every source adapter operates with a strict 20-second timeout.
   - If an adapter fails or times out, `orchestrator.py` synthesizes whatever facts were gathered and assigns a `medium` or `low` confidence score instead of crashing.
