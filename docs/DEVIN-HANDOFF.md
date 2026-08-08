# Dalal — Devin Handoff

How to finish Dalal (voice food broker with a deep-link hand-off). Each slice below is **one bounded Devin PR**. Read [FOOD-FLOW.md](FOOD-FLOW.md) (product) and [VENDOR-CONTRACTS.md](VENDOR-CONTRACTS.md) (verified APIs) first.

---

## 0. Current state (what's already done — don't rebuild)

- **The engine works and context.dev is LIVE.** `context_client.py` hits the real endpoints; `marketplace.py` pulls real structured offers from Noon/Amazon (verified: Noon 4,599 3rd-party/International, Amazon 4,783 official — warm ~3.5 s). Shopping is the proven base; **food repoints the sources.**
- Backend runs from `apps/api/.venv`. `CONTEXT_DEV_API_KEY` is set in `apps/api/.env`.
- What's still stubbed: the **synthesizer** (hardcoded), **voice→research** wiring (button-driven), `get_verdict` (404s when not ready), and there are **no food adapters yet**.

## 1. Ground rules (non-negotiable)

> **Authority: [VENDOR-CONTRACTS.md §0 "FOOD CAPABILITY VERIFICATION" (live, 2026-08-08)](VENDOR-CONTRACTS.md).** Seven probe rounds against the real key. It **refuted** three rules this section previously carried as "verified, do NOT rediscover" — see the corrections below. When §0 and anything else disagree, §0 wins; do not reinstate the refuted claims.

- **Corrected on 2026-08-08 (previously stated here as verified — they are false):**
  - ~~"No search endpoint"~~ → **`POST /web/search` EXISTS and works.** Discovery is **fully live** (Amin's locked decision): any spoken craving is resolved at runtime via `/web/search`. **No pinned/hardcoded demo restaurant URLs anywhere in the code.**
  - ~~"resolve restaurant URLs by pinning"~~ → search returns them **already carrying the required `?aid=`**. Pinning is unnecessary and forbidden.
  - ~~"Screenshot / Brand are documented but unproven"~~ → both are **proven working** (§0.9). S7 is no longer spike-gated.
- **context.dev, still true:**
  - A **browser User-Agent is required** — the default library UA gets a Cloudflare `403 / error 1010`. (Already set in `context_client.py`; keep it.)
  - `/web/extract` works on a **single restaurant/listing URL with `maxPages:1`**; never extract a search page — use `/web/search` to get URLs, then extract each one.
  - **No browser automation** — cart pre-fill stays V2.
  - **Pre-warm** the resolved URLs (large `maxAgeMs`) so on-stage fetches are warm-fast. Cold ≈ 15 s, warm ≈ 3 s.
  - Endpoints/shapes: [VENDOR-CONTRACTS.md](VENDOR-CONTRACTS.md) §0.9 (food) and §1 (general).
- **The `?aid=` location gate — the silent-success trap (§0.2).** A Talabat restaurant URL **without `?aid=<areaId>` 302s to the homepage location-picker** and still returns **HTTP 200 with ~4 KB of markdown and ZERO prices** — it looks like success. The `aid` is an **area** id, is **NOT transferable between restaurants**, and must come from `/web/search`. **Guard required:** the gated-homepage sentinel (§0.2) → `SourceResult(status="failed")`, never a silent "ok".
- **Never pass `maxAgeMs=0`** on heavy listing/menu pages (§0.3) — cache-bypass causes Cloudflare **524** or a gated homepage. Use `maxAgeMs >= 86400000` and pre-warm. `browserCountry` is valid on `/web/scrape/markdown` but is **rejected by `/web/extract`** (`INPUT_VALIDATION_ERROR`).
- **Two pages per app, joined on restaurant name (§0.4).** The **menu** page yields dish name · `price_aed` · sold-out flag · **aggregate rating + review count**. The **area listing** page yields **delivery fee · ETA · minimum order · rating · offer text**. Neither page alone answers the question — fee/ETA do **not** come from the menu page.
- **Fee/ETA are the app's PUBLISHED ESTIMATE (§0.8).** The per-user final checkout fee/ETA is computed behind auth and is **unobtainable**. Label it as an estimate; never present it as the user's total.
- **Adapters never raise** → return `SourceResult(status="failed", error=...)`. Routes hold no business logic.
- **Live-or-labelled:** no live key or a failed fetch → return data with `is_fixture=True`; it flows to a UI "sample data" badge. **Never present fixture data as live.**
- **Grounding:** the verdict derives from fetched `SourceResult.offers` — no price without a source ([CONTRACTS.md §4](CONTRACTS.md)).
- **Spoken vs visual:** `spoken_summary` ≤ 60 words; the agent reads only that field — never JSON, URLs, or field names.
- **Tests:** a fixture at every external boundary; `USE_FIXTURES=true`; **no live network calls in tests.**
- **Agent is code, not the no-code workflow builder** (Slice 6).

## 2. Slices (each = one PR; dependency-ordered; ✦ = on the critical path to the demo)

| # | Slice | Depends on | Parallel? |
|---|---|---|---|
| S1 ✦ | Ground the synthesizer (Amin's locked ranking) | S3 (for `DishOffer` fields) | with S2, S4 |
| S2 | `get_verdict` → `{running}` + UI consumer | — | with all |
| S3 ✦ | Food domain: models + registry | — | with S2 |
| S4 ✦ | Food source adapters + domain-driven orchestrator | S3 | with S1 |
| S5 ✦ | Voice→research wiring + `open_order_page` client tool | S4, S6 | with S6 |
| S6 ✦ | Agent-as-code (`dalal-agent.json` + apply script) | — | with S5 |
| S7 | Screenshot + brand logo on cards | S3 | with S4 (endpoints already proven) |

### S1 — Ground the synthesizer ✦
- **Goal:** `services/synthesizer.py` builds the `Verdict` from `SourceResult.offers`, not constants.
- **Files:** `apps/api/app/services/synthesizer.py` (+ `tests/`).
- **RANKING (Amin, LOCKED — implement verbatim):** *"first find the places that carry that dish or requested item, then rank based on reviews then price if they are different."*
  1. **Carry filter** — only offers whose `dish` actually matches the craving and are not sold out are eligible. A place that doesn't carry the dish is out, at any price.
  2. **Rank by reviews** — order the survivors by the app's aggregate `rating` (tie-break on `review_count`). This number rides along free with the menu fetch ([§0.7](VENDOR-CONTRACTS.md)) — **no extra call**.
  3. **Price is a TIE-BREAKER ONLY, and only when a genuine per-dish delta exists.** Cross-app deltas are real but sparse ([§0.6](VENDOR-CONTRACTS.md)): most shared dishes are identically priced. If the same dish costs the same on both apps, price is not a differentiator — say nothing about it.
- **Honesty rules (hard):**
  - **Never** claim a blanket "cheaper app". Only ever a delta for the **specific dish** where one is measured.
  - The old sample line *"38 AED, free delivery on Deliveroo"* is **dead** — it is ungroundable and must not appear in code, prompts, tests, or fixtures.
  - `delivery_fee_aed` / `eta_minutes` come from the **listing** page and are the app's **published estimate** ([§0.8](VENDOR-CONTRACTS.md)) — phrase them as such ("about", "listed at"), never as the user's final checkout total. If absent, render `—`.
  - Authenticity narrative comes from the **reviews** source (Zomato/TripAdvisor review text), never from a delivery app — the apps expose a rating number and **zero** review bodies ([§0.7](VENDOR-CONTRACTS.md)).
- **Contract:** [CONTRACTS.md §4–§5](CONTRACTS.md). `spoken_summary` ≤ 60 words, no number absent from the picks. Empty offers → `confidence:"low"` + honest note. May use `LLM_API_KEY` to *phrase*, but the deterministic ranking above is the backstop.
- **Acceptance:** with live offers the verdict names a place that **carries the dish**, justified by rating/reviews, and mentions price only where a real per-dish delta exists; **no hardcoded restaurant/dish names remain**; `is_fixture` propagates to `Verdict`.
- **Test (must bite):** golden fixture → lower the top pick's `rating` below the runner-up's → the pick flips. Second: make two offers equal-priced → the verdict states no price difference.
- **Don't touch:** adapters, orchestrator, models.

### S2 — `get_verdict` → `{running}` + consumer
- **Goal:** `get_verdict` returns HTTP **200 `{status:"running", job_id}`** when not ready (never 404); the client only renders when `status==="done"`.
- **Files:** `apps/api/app/api/routes/tools.py`; `apps/web/app/page.tsx` (guard on `status`).
- **Acceptance:** polling before ready gives 200 running; UI never renders a malformed verdict.

### S3 — Food domain: models + registry ✦
- **Goal:** add `CravingQuery` + `DishOffer` and a `food` `DomainConfig`; **keep the shopping models** so the proven path still runs (additive).
- **Files:** `apps/api/app/domain/models.py`; `apps/api/app/adapters/registry.py`.
- **Contract:** [CONTRACTS.md §5](CONTRACTS.md). Registry `food` config: sources `["delivery_app","reviews"]` (+ `"screenshot"`/brand assets per S7), `clarifier` (delivery/dine-in + spice), default `area`, and the **app roster** the `DeliveryAppAdapter` iterates: `talabat` and `deliveroo` as the two required rich sources, `eateasy` as **best-effort** (thin coverage — it missed both test branches, [§0.5](VENDOR-CONTRACTS.md); it returning nothing is normal, never a failure). `SourceResult.source` extended to the food kinds.
- **NO PINNED URLS (Amin, LOCKED).** Discovery is fully live: any spoken craving is resolved at runtime via `POST /web/search`. The config carries **domains and URL shapes**, never a hardcoded restaurant URL. Do not add a "demo restaurant" constant anywhere.
- **`DishOffer` must carry `rating` + `review_count`** (they come free with the menu fetch, [§0.7](VENDOR-CONTRACTS.md)) — the review-first ranking in S1 depends on them.
- **`delivery_fee_aed` / `eta_minutes` are OPTIONAL and come from the LISTING page, not the menu page** ([§0.4](VENDOR-CONTRACTS.md)). Do not model them as menu-page fields, and document them as the app's published estimate ([§0.8](VENDOR-CONTRACTS.md)).
- **Acceptance:** models import; `DishOffer` has `rating`/`review_count`; the food config names sources + app roster and contains **zero** restaurant URLs.

### S4 — Food source adapters + domain-driven orchestrator ✦
- **Goal:** `DeliveryAppAdapter` (per app: **search → menu → listing**, joined), `ReviewsAdapter` (authenticity **text**), and **refactor `orchestrator.py` to build its adapter list from the active `DomainConfig`** instead of the hardcoded four — this is the domain seam.
- **Files:** `apps/api/app/adapters/sources/delivery_app.py`, `reviews.py`; `sources/__init__.py`; `services/orchestrator.py`.
- **`DeliveryAppAdapter` — three fetches per app, in this order ([§0.2](VENDOR-CONTRACTS.md)–§0.4):**
  1. **Search** — `POST /web/search` for the craving scoped to the app's domain. Returns restaurant menu URLs **already carrying `?aid=<areaId>`** (Talabat) and the area/city path (Deliveroo). This is the only legitimate source of `aid`; it is an **area** id and is **not transferable** between restaurants — never synthesize or reuse one.
  2. **Menu page** (`/uae/restaurant/<id>/<slug>?aid=<area>` · `/en/menu/<city>/<area>/<slug>`) via `/web/extract` `maxPages:1` → dish name, `price_aed`, sold-out flag, **aggregate `rating` + `review_count`**. Instruct *"extract EVERY item, do not stop early"* — a weak instruction truncated Talabat to 20 of 90 dishes.
  3. **Area listing page** (`/uae/restaurants/<areaId>/<area>` · `/en/restaurants/<city>/<area>`) → delivery fee, ETA, minimum order, rating, offer text.
  - **JOIN menu ⋈ listing on restaurant name.** This is the core architectural fact: neither page alone answers the question, and fee/ETA are **not** on the menu page. If the listing row is missing, emit the `DishOffer` with `delivery_fee_aed`/`eta_minutes` unset — do not fabricate, do not drop the offer.
  - **Gated-redirect guard (mandatory):** a missing/incorrect `aid` yields HTTP 200 + ~4 KB of homepage markdown + zero prices — a silent false success. Detect the §0.2 sentinel → `SourceResult(status="failed")`.
  - **Never `maxAgeMs=0`** on menu/listing pages (§0.3); use `>= 86400000` + pre-warm. `browserCountry` on `/web/scrape/markdown` only — `/web/extract` rejects it.
  - **App roster (§0.5):** `talabat` + `deliveroo` are the two rich sources. **`eateasy` is best-effort** — thin coverage, will often return nothing; that is an expected empty result, never a required source and never an error. noon Food / Careem / Smiles / Keeta / InstaShop / Zomato give **no dish prices** (Careem·Smiles·Keeta are app-only) — do not build adapters for them.
- **`ReviewsAdapter` — Zomato + TripAdvisor only.** Delivery apps expose an aggregate rating **number** and **zero review bodies** across 7 probes (Talabat has no `/reviews` path) ([§0.7](VENDOR-CONTRACTS.md)). The ranking number is already free with the menu fetch, so this adapter exists solely to supply the **authenticity narrative** the agent speaks. It runs in parallel and its failure must not block a verdict.
- **Contract:** `SourceAdapter` protocol; `DishOffer` shape; [VENDOR-CONTRACTS.md §0](VENDOR-CONTRACTS.md). **Adapters never raise** — every failure path returns `SourceResult(status="failed", error=...)`, and the fallback data is always **labelled `is_fixture=True`**. Browser UA + `maxPages:1` + pre-warm are already handled by `context_client` — reuse it, do not re-implement.
- **Acceptance:** with the real key, `DeliveryAppAdapter` returns real `DishOffer`s (with `rating`/`review_count`) for a **spoken, non-pinned** craving on Talabat and Deliveroo, with fee/ETA joined from the listing page where available; an `aid`-less URL is reported `failed`, not `ok`; EatEasy returning empty does not fail the run; fixture fallback is labelled.
- **Model the marketplace adapter** (`sources/marketplace.py`) — it's the working reference pattern.

### S5 — Voice→research wiring + `open_order_page` client tool ✦ (the wow)
- **Goal:** the agent's `start_research` call sets the active `job_id` (kill the demo buttons); register an **`open_order_page(url)` client tool** in `useDalalAgent` that navigates the browser, **allow-listed to retail/delivery domains only**; the agent calls it on the verdict to deep-link to the winning app.
- **Files:** `apps/web/hooks/useDalalAgent.ts`, `apps/web/app/page.tsx`.
- **Contract:** ElevenLabs client tools ([VENDOR-CONTRACTS.md §2](VENDOR-CONTRACTS.md)). SSRF-style guard: reject any URL whose host isn't in the delivery/retail allow-list.
- **Acceptance:** speaking a craving drives the research (no button); on verdict the agent's voice triggers a browser navigation to `deep_link`; non-allow-listed URLs are refused.

### S6 — Agent-as-code (`dalal-agent.json` + apply script) ✦
- **Goal:** a versioned agent definition + a script that applies it via the ElevenLabs API (§3 below). No dashboard clicking.
- **Files:** `apps/api/agent/dalal-agent.json`, `apps/api/agent/apply_agent.py`.
- **Acceptance:** running the apply script creates/updates the agent and prints the `agent_id` (→ `apps/web/.env.local`); a live session runs interview → tools → verdict → hand-off.

### S7 — Screenshot + brand on cards (no spike — both endpoints PROVEN)
- **The 2026-08-08 verification hit both endpoints with the real key and they work ([§0.9](VENDOR-CONTRACTS.md)). The old "spike first, might not work" gate is obsolete — do not re-run it.**
- **Endpoints (exact):**
  - `GET /web/screenshot` — param `directUrl` **or** `domain`; returns `{screenshot: <png url>}`.
  - `POST /brand/retrieve` — body `{type:"by_domain", domain}` → logo + colours.
  - (`GET /web/html` **does not exist** — 403. Never call it.)
- **Goal:** add `screenshot_url` + `logo_url` to `DishOffer` (new `context_client` methods), render on `VerdictCards`.
- **Acceptance:** card shows a live menu screenshot + restaurant logo; a failed asset fetch degrades to no image, never blocks the verdict.

**Stretch (only if green early):** authenticity **knowledge base** (RAG) on the agent; the shareable **web-widget** link for judges.

## 3. Agent-as-code spec (S6 — the contract Devin builds to)

**`dalal-agent.json`** (shape — confirm exact ElevenLabs tool-config keys against the current API; the sibling flagged webhook-tool fields as verify-on-day):
```jsonc
{
  "name": "Dalal",
  "conversation_config": {
    "agent": {
      "first_message": "Hey — what are you craving?",
      "language": "en",
      "prompt": { "prompt": "<SYSTEM PROMPT below>", "llm": "<fast model, e.g. gpt-4o-mini tier>" }
    },
    "tts": { "voice_id": "<a warm, natural voice>" }
  },
  "tools": [
    { "type": "webhook", "name": "start_research", "description": "Kick off live research for a craving.",
      "api_schema": { "url": "{API_BASE}/v1/tools/start_research", "method": "POST",
        "request_headers": { "X-Dalal-Key": "{DALAL_SECRET_KEY}" },
        "request_body_schema": { "dish": "string", "mode": "delivery|dine_in", "refiners": "string[]", "area": "string" } } },
    { "type": "webhook", "name": "get_verdict", "description": "Fetch the verdict (or running).",
      "api_schema": { "url": "{API_BASE}/v1/tools/get_verdict", "method": "GET",
        "request_headers": { "X-Dalal-Key": "{DALAL_SECRET_KEY}" },
        "query_params_schema": { "job_id": "string" } } },
    { "type": "client", "name": "open_order_page", "description": "Open the winning app's order page in the browser.",
      "parameters": { "url": "string" }, "wait_for_response": false }
  ]
}
```

**System prompt (starter — Devin refines):**
> You are Dalal, a sharp, warm UAE food broker. The user tells you a craving; your job is to find the best place and **hand them the order**.
> 1. If they haven't said what they're craving, ask. 2. Ask ONE thing: delivery or dine-in? Then at most one refiner (spice / authenticity / area). Keep it to ≤ 3 short turns.
> 3. As soon as you have the dish + mode, call `start_research`. It returns instantly — do **not** go silent; ask your refiner *while it runs*.
> 4. On your next turn call `get_verdict`. If `running`, ask one more light question and check again. If `done`, read `spoken_summary` naturally.
> 5. **Delivery:** say the pick — a place that **carries the dish**, chosen on rating/reviews — then call `open_order_page(deep_link)` to take them there. **Dine-in:** give the best authentic place + why.
> Rules: never state a price/fee/ETA/fact not in a tool response; **never claim one app is cheaper in general** — only a price difference for the specific dish, and only if the verdict states one; any delivery fee or ETA is the app's **published estimate**, not their final checkout total; never read JSON, URLs, or field names aloud; ≤ 2 sentences per turn; if a fact is missing, say you don't have it — never invent.

**`apply_agent.py`:** load `dalal-agent.json`, substitute `{API_BASE}`/`{DALAL_SECRET_KEY}` from env, `POST`/`PATCH` the ElevenLabs agents API with `xi-api-key: $ELEVENLABS_API_KEY`, print the `agent_id`. (Confirm the exact agents-API path against current docs.)

## 4. Definition of done (the demo)

Speak *"I'm craving authentic Sichuan wontons"* (**any** craving — nothing is pinned; the restaurants are discovered live via `/web/search`) → 2–3 short interview turns (delivery? spice?) → source cards fill **while the agent talks** → the agent speaks a ≤60-word verdict that:

1. names a place that **actually carries the dish** (live menu, in stock),
2. justifies it on **rating / review count** plus an authenticity line drawn from Zomato/TripAdvisor review text,
3. mentions price **only** if a genuine per-dish cross-app delta exists — otherwise it says the price is the same,
4. quotes any delivery fee/ETA as the app's **published estimate**, never as a final total,

→ **the agent deep-links you to the order page** on the winning app. Every number traces to a fetched `SourceResult` and carries a live timestamp; kill one source (or EatEasy returning nothing, which is normal) and a lower-confidence verdict still ships. Runs on public HTTPS.

**Explicitly out of the demo narrative:** any blanket "app X is cheaper" claim, and the old *"38 AED, free delivery on Deliveroo"* line — both are ungroundable ([§0.6, §0.8](VENDOR-CONTRACTS.md)).
