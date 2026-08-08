# Data Contracts & Schemas — Dalal (دلال)

> **Product direction: food** ([FOOD-FLOW.md](FOOD-FLOW.md)). §1–§4 below are the **current shapes** — they match the live code (`apps/api/app/domain/models.py`), proven on the shopping domain. §5 is the **food-target** delta (the next slice). Docs lead the code during the pivot; the delta is flagged, not silently applied. External vendor shapes: [VENDOR-CONTRACTS.md](VENDOR-CONTRACTS.md).

## 1. Domain Models — current (`apps/api/app/domain/models.py`, live)

```python
class ProductQuery(BaseModel):            # → CravingQuery for food (§5)
    session_id: str
    category: Literal["laptop", "vacuum", "headphones"]
    budget_aed: float
    must_haves: list[str] = []
    deal_breakers: list[str] = []
    usage: str = ""

class Offer(BaseModel):                   # live marketplace offers (verified via context.dev)
    title: str
    price_aed: float
    retailer: Literal["noon", "amazon_ae", "sharaf_dg", "other"]
    seller: Optional[str] = None
    seller_type: Literal["official", "marketplace_3p", "unknown"] = "unknown"   # the warranty catch
    warranty: Optional[str] = None
    url: str
    in_stock: Optional[bool] = True
    is_fixture: bool = False              # True → sample data, not a live fetch
    captured_at: datetime

class SourceResult(BaseModel):
    source: Literal["marketplace", "reviews", "community", "warranty"]
    status: Literal["ok", "partial", "failed"]
    facts: list[str] = []
    offers: list[Offer] = []
    citations: list[str] = []
    is_fixture: bool = False
    latency_ms: int = 0
    error: Optional[str] = None

class Recommendation(BaseModel):
    name: str; price_aed: float; retailer: str; url: str
    why: list[str]          # exactly 3
    watch_outs: list[str]   # exactly 2
    warranty_note: Optional[str] = None

class Verdict(BaseModel):
    pick: Recommendation; runner_up: Recommendation
    price_note: str
    confidence: Literal["high", "medium", "low"]
    sources_used: list[str]
    is_fixture: bool = False
    spoken_summary: str     # <= 60 words. Agent reads ONLY this field.
```

## 2. ElevenLabs Tool Endpoints (`/v1/tools/*`) — webhook tools authored in code (§ Agent-as-code)

Every endpoint answers **HTTP 200 fast** — a webhook tool must never emit a raw 4xx/5xx into the live conversation.

- `POST /v1/tools/start_research` — body `CravingQuery`; returns `{ job_id, status:"running", eta_seconds }` (<500 ms, pipeline detached).
- `GET  /v1/tools/research_status?job_id=` — `{ status, done, total, teaser }`.
- `GET  /v1/tools/get_verdict?job_id=` — **ready:** `Verdict` + `status:"done"`; **not ready:** HTTP 200 `{ status:"running", job_id }` — **never 404** (fix per ARCHITECTURE.md §6 gap #4).

Auth: `X-Dalal-Key` header == `DALAL_SECRET_KEY`. **Client tool** (browser-side, not an endpoint): `open_order_page(url)` — navigates to the winning app's order page (the deep-link hand-off); registered in `useDalalAgent`, allow-listed to retail/delivery domains.

## 3. Supabase schema
`sessions` · `research_jobs(query jsonb, status)` · `source_results(job_id, source, status, payload jsonb, latency_ms)` · `verdicts(job_id pk, payload jsonb)`.

## 4. Grounding rules — the anti-fabrication gate (`services/synthesizer.py`)

The verdict MUST derive from fetched `SourceResult`s, never constants. *(The current synthesizer is still hardcoded — ARCHITECTURE.md §6 gap #2.)*
1. Every recommended price + retailer/app traces to an `ok` `SourceResult`. No source → no price (render `—`, never invent).
2. `spoken_summary` contains no number absent from the picks.
3. `sources_used` lists only `status="ok"` sources.
4. **Fixture honesty:** any contributing `is_fixture` → `Verdict.is_fixture=true` → UI "sample data" badge. Never present fixture as live.

## 5. Food-target shapes (the next slice — repoints §1 to food)

```python
class CravingQuery(BaseModel):            # replaces ProductQuery
    session_id: str
    dish: str                             # "authentic Sichuan wontons"
    mode: Literal["delivery", "dine_in"]  # the branch (decided in the interview)
    refiners: list[str] = []              # spice / authenticity / area
    area: str = "Dubai"                   # delivery apps are location-gated

class DishOffer(BaseModel):               # replaces Offer
    restaurant: str                       # the JOIN key between the menu and listing pages
    dish: str
    price_aed: float
    app: Literal["talabat", "deliveroo", "eateasy", "other"]  # the delivery app
    in_stock: Optional[bool] = True       # MENU page: sold-out flag

    # --- MENU page (free with the dish fetch — no extra call) ---
    rating: Optional[float] = None        # the app's aggregate rating -> the review-first ranking
    review_count: Optional[int] = None    # tie-breaker; delivery apps give the NUMBER, never the TEXT

    # --- LISTING (area) page: PUBLISHED ESTIMATE, often absent -> render "—", never invent ---
    delivery_fee_aed: Optional[float] = None   # NOT on the menu page; app's published estimate
    eta_minutes: Optional[int] = None          # NOT on the menu page; app's published estimate
    min_order_aed: Optional[float] = None
    offer_text: Optional[str] = None           # e.g. a listed promotion

    deep_link: str                        # → open_order_page(url); carries ?aid= on Talabat
    screenshot_url: Optional[str] = None  # context.dev GET /web/screenshot
    logo_url: Optional[str] = None        # context.dev POST /brand/retrieve
    is_fixture: bool = False
    captured_at: datetime

# SourceResult.source → Literal["delivery_app","reviews","screenshot","brand"]
```

**Two pages, one offer.** A `DishOffer` is assembled from **two** fetches per app, joined on `restaurant` ([VENDOR-CONTRACTS.md §0.4](VENDOR-CONTRACTS.md)): the **menu** page supplies dish · `price_aed` · `in_stock` · `rating` · `review_count`; the **area listing** page supplies `delivery_fee_aed` · `eta_minutes` · `min_order_aed` · `offer_text`. The listing fields are the app's **published estimate** — the per-user final checkout fee/ETA is computed behind auth and is unobtainable (§0.8), so they are `Optional` and must be spoken/rendered as an estimate, never as a total.

**Ranking the picks (Amin, LOCKED):** *"first find the places that carry that dish or requested item, then rank based on reviews then price if they are different."* → carry-filter → `rating`/`review_count` → price **only** as a tie-breaker and **only** where a genuine per-dish delta exists (§0.6). No blanket "cheaper app" claim.

Food source adapters (same `SourceAdapter` protocol): `DeliveryAppAdapter` — `/web/search` → menu → listing, joined (Talabat + Deliveroo rich; **EatEasy best-effort**, often empty); `ReviewsAdapter` — **Zomato / TripAdvisor only**, the sole source of review *text* for the authenticity narrative (§0.7). **Restaurant URLs are never pinned** — `POST /web/search` exists (this doc previously claimed it did not; refuted 2026-08-08) and returns URLs already carrying the required `?aid=`. Pre-warm the resolved URLs; never pass `maxAgeMs=0`.

## 6. Agent-as-code (Devin, not the workflow builder)

`apps/api/agent/dalal-agent.json` holds the system prompt (persona + interview + the **delivery/dine-in branch in the prompt**), the server tools (§2), and the `open_order_page` client tool. An apply script pushes it via the ElevenLabs API (`create_agent`/`update_agent`). All Devin-authored, reviewable in the PR — no no-code workflow builder.
