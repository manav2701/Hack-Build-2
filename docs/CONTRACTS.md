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
    image_url: Optional[str] = None       # the DISH PHOTO — see §5.1
    is_fixture: bool = False
    captured_at: datetime

# SourceResult.source → Literal["delivery_app","reviews","screenshot","brand"]
```

**Two pages, one offer.** A `DishOffer` is assembled from **two** fetches per app, joined on `restaurant` ([VENDOR-CONTRACTS.md §0.4](VENDOR-CONTRACTS.md)): the **menu** page supplies dish · `price_aed` · `in_stock` · `rating` · `review_count`; the **area listing** page supplies `delivery_fee_aed` · `eta_minutes` · `min_order_aed` · `offer_text`. The listing fields are the app's **published estimate** — the per-user final checkout fee/ETA is computed behind auth and is unobtainable (§0.8), so they are `Optional` and must be spoken/rendered as an estimate, never as a total.

**Ranking the picks (Amin, LOCKED):** *"first find the places that carry that dish or requested item, then rank based on reviews then price if they are different."* → carry-filter → `rating`/`review_count` → price **only** as a tie-breaker and **only** where a genuine per-dish delta exists (§0.6). No blanket "cheaper app" claim.

Food source adapters (same `SourceAdapter` protocol): `DeliveryAppAdapter` — `/web/search` → menu → listing, joined (Talabat + Deliveroo rich; **EatEasy best-effort**, often empty); `ReviewsAdapter` — **Zomato / TripAdvisor only**, the sole source of review *text* for the authenticity narrative (§0.7). **Restaurant URLs are never pinned** — `POST /web/search` exists (this doc previously claimed it did not; refuted 2026-08-08) and returns URLs already carrying the required `?aid=`. Pre-warm the resolved URLs; never pass `maxAgeMs=0`.

### 5.1 The dish photo (`image_url`)

The verdict card is the thing the user decides from, so it needs a picture of what they
are about to order. Resolved in three layers, most truthful first — the same ladder in
the backend, the web app (`lib/foodImages.ts`) and the extension (`src/images.js`):

1. **The dish photo on the menu page.** `MENU_SCHEMA` asks context.dev for the absolute
   URL of the image next to each dish, plus the restaurant's cover photo as a per-menu
   fallback. Validated by `services/imagery.py`, which rejects logos, sprites, tracking
   pixels and non-image paths — extraction does sometimes return the app's own wordmark.
2. **The order page's `og:image`**, read straight off the deep link with a plain HTML
   GET (no context.dev credits, 6 s timeout, 4-way concurrency, bounded at 12 s for the
   whole backfill). An app that blocks us yields `None`; imagery never fails a craving.
3. **Keyword artwork, client-side.** Decoration, not evidence — so the card LABELS it
   ("Illustrative"). A stock photo presented as this restaurant's plate is the same
   class of lie as an invented price, and rule 1 of §4 does not stop at numbers.

`DishRecommendation.image_url` takes the first photo any app published for the winning
restaurant's matching dish — it falls across apps deliberately, since the cheapest
listing may be the one without a picture and it is the same food either way.

**Grounding note.** `_numbers_in_pick` (the whitelist for §4 rule 2) now **skips URLs**.
A deep link like `.../restaurant/763692/...` or a CDN path like `.../1200x800.jpg` is
full of digits that mean nothing aloud; harvesting them would let the agent speak
"seven six three six nine two" as though it were a grounded fact.

## 5.2 Accounts (`/v1/auth/*`)

Unlike `/v1/tools/*`, these are **not** webhook tools — no live conversation is
listening, so they answer real 4xx codes.

- `POST /v1/auth/signup` — `{email, password, name?}` → `201 {token, user}`. Signs the
  new account in immediately. `409` if taken, `422` if the email is malformed or the
  password is under 8 characters.
- `POST /v1/auth/login` — `{email, password}` → `{token, user}`; `401` otherwise.
- `GET  /v1/auth/me` — `Authorization: Bearer <token>` → `{user}`.
- `GET  /v1/auth/history?limit=` — that user's cravings, newest first, each with its
  finished verdict. Scoped by the token's subject; a user can only read their own rows.
- `POST /v1/auth/logout` — courtesy endpoint; the token is stateless, so logging out is
  the client discarding it.

**Session** = HS256 JWT signed with `JWT_SECRET`, 30-day TTL. A bearer token rather than
a cookie because the web app, the extension popup and the extension's content scripts
are all different origins from the API. **Passwords** = PBKDF2-HMAC-SHA256, 240k
iterations, per-user salt, `compare_digest` verification, with a dummy hash computed on
a missing account so a wrong email and a wrong password take the same time. **Storage**
= stdlib `sqlite3` (no new dependency, no database to provision) — see
[DEPLOYMENT.md](DEPLOYMENT.md) for the volume this needs on Railway to survive a restart.

Auth is **optional** on `start_research`: the voice agent calls it from ElevenLabs'
cloud with no user token and that path is unchanged. A token, when present, files the
job under that user, and `GET /v1/tools/latest_job` then returns **their** newest job
rather than the global newest — which matters the moment two people use the deployed
app at once.

## 6. Agent-as-code (Devin, not the workflow builder)

`apps/api/agent/dalal-agent.json` holds the system prompt (persona + interview + the **delivery/dine-in branch in the prompt**), the server tools (§2), and the `open_order_page` client tool. An apply script pushes it via the ElevenLabs API (`create_agent`/`update_agent`). All Devin-authored, reviewable in the PR — no no-code workflow builder.
