# Dalal — Devin Handoff

How to finish Dalal (voice food broker with a deep-link hand-off). Each slice below is **one bounded Devin PR**. Read [FOOD-FLOW.md](FOOD-FLOW.md) (product) and [VENDOR-CONTRACTS.md](VENDOR-CONTRACTS.md) (verified APIs) first.

---

## 0. Current state (what's already done — don't rebuild)

- **The engine works and context.dev is LIVE.** `context_client.py` hits the real endpoints; `marketplace.py` pulls real structured offers from Noon/Amazon (verified: Noon 4,599 3rd-party/International, Amazon 4,783 official — warm ~3.5 s). Shopping is the proven base; **food repoints the sources.**
- Backend runs from `apps/api/.venv`. `CONTEXT_DEV_API_KEY` is set in `apps/api/.env`.
- What's still stubbed: the **synthesizer** (hardcoded), **voice→research** wiring (button-driven), `get_verdict` (404s when not ready), and there are **no food adapters yet**.

## 1. Ground rules (non-negotiable — verified; do NOT rediscover these)

- **context.dev, from our live spike:**
  - A **browser User-Agent is required** — the default library UA gets a Cloudflare `403 / error 1010`. (Already set in `context_client.py`; keep it.)
  - `/web/extract` works on a **single product/restaurant URL with `maxPages:1`**. On a **search URL it returns nothing and wanders** onto unrelated pages. So: pin product/restaurant URLs; never extract a search page.
  - **No search endpoint** and **no browser automation** — resolve each app's restaurant URL by pinning (or scraping its search page for links), and cart pre-fill is V2.
  - **Pre-warm** the demo URLs (large `maxAgeMs`) so on-stage fetches are warm-fast. Cold ≈ 15 s, warm ≈ 3 s.
  - Endpoints/shapes: [VENDOR-CONTRACTS.md](VENDOR-CONTRACTS.md).
- **Adapters never raise** → return `SourceResult(status="failed", error=...)`. Routes hold no business logic.
- **Live-or-labelled:** no live key or a failed fetch → return data with `is_fixture=True`; it flows to a UI "sample data" badge. **Never present fixture data as live.**
- **Grounding:** the verdict derives from fetched `SourceResult.offers` — no price without a source ([CONTRACTS.md §4](CONTRACTS.md)).
- **Spoken vs visual:** `spoken_summary` ≤ 60 words; the agent reads only that field — never JSON, URLs, or field names.
- **Tests:** a fixture at every external boundary; `USE_FIXTURES=true`; **no live network calls in tests.**
- **Agent is code, not the no-code workflow builder** (Slice 6).

## 2. Slices (each = one PR; dependency-ordered; ✦ = on the critical path to the demo)

| # | Slice | Depends on | Parallel? |
|---|---|---|---|
| S1 ✦ | Ground the synthesizer | — | with S2, S3 |
| S2 | `get_verdict` → `{running}` + UI consumer | — | with S1, S3 |
| S3 ✦ | Food domain: models + registry | — | with S1, S2 |
| S4 ✦ | Food source adapters + domain-driven orchestrator | S3 | — |
| S5 ✦ | Voice→research wiring + `open_order_page` client tool | S4, S6 | with S6 |
| S6 ✦ | Agent-as-code (`dalal-agent.json` + apply script) | — | with S5 |
| S7 | Screenshot + brand logo on cards | S4 | after a 5-min endpoint spike |

### S1 — Ground the synthesizer ✦
- **Goal:** `services/synthesizer.py` builds the `Verdict` from `SourceResult.offers`, not constants.
- **Files:** `apps/api/app/services/synthesizer.py` (+ `tests/`).
- **Contract:** [CONTRACTS.md §4](CONTRACTS.md). Pick/runner-up derive from `ok` offers; rank on price × `seller_type` × warranty; the "catch" comes from `seller_type`/`warranty` (e.g. cheaper but `marketplace_3p`/International). `spoken_summary` ≤ 60 words, no number absent from the picks. Empty offers → `confidence:"low"` + honest note. May use `LLM_API_KEY` to *phrase*, but grounding is the deterministic backstop.
- **Acceptance:** with the live marketplace offers, the verdict names the real cheaper-but-riskier vs pricier-but-official trade-off; **no hardcoded product names remain**; `is_fixture` propagates to `Verdict`.
- **Test (must bite):** golden fixture → change one offer's price → the verdict changes. (Update `tests/fixtures/golden_laptop.json` to the real offer shape.)
- **Don't touch:** adapters, orchestrator, models.

### S2 — `get_verdict` → `{running}` + consumer
- **Goal:** `get_verdict` returns HTTP **200 `{status:"running", job_id}`** when not ready (never 404); the client only renders when `status==="done"`.
- **Files:** `apps/api/app/api/routes/tools.py`; `apps/web/app/page.tsx` (guard on `status`).
- **Acceptance:** polling before ready gives 200 running; UI never renders a malformed verdict.

### S3 — Food domain: models + registry ✦
- **Goal:** add `CravingQuery` + `DishOffer` and a `food` `DomainConfig`; **keep the shopping models** so the proven path still runs (additive).
- **Files:** `apps/api/app/domain/models.py`; `apps/api/app/adapters/registry.py`.
- **Contract:** [CONTRACTS.md §5](CONTRACTS.md). Registry `food` config: sources `["delivery_app","discovery","reviews"]`, `clarifier` (delivery/dine-in + spice), and **pinned demo restaurant URLs** for one dish on **2 delivery apps** (apples-to-apples). `SourceResult.source` extended to the food kinds.
- **Acceptance:** models import; the food config has ≥ 1 dish pinned across 2 apps.

### S4 — Food source adapters + domain-driven orchestrator ✦
- **Goal:** `DeliveryAppAdapter` (dish price · fee · ETA · availability per app, via `/web/extract` `maxPages:1` on pinned URLs), `DiscoveryAdapter` (which places serve the dish — `scrape_markdown`), `ReviewsAdapter` (authenticity). **Refactor `orchestrator.py` to build its adapter list from the active `DomainConfig`** instead of the hardcoded four — this is the domain seam.
- **Files:** `apps/api/app/adapters/sources/delivery_app.py`, `discovery.py`, `reviews.py`; `sources/__init__.py`; `services/orchestrator.py`.
- **Contract:** `SourceAdapter` protocol; `DishOffer` shape; [VENDOR-CONTRACTS.md](VENDOR-CONTRACTS.md). Never raise; labelled fixture fallback; browser UA + `maxPages:1` + pre-warm are already handled by `context_client` — reuse it, do not re-implement.
- **Acceptance:** with the real key, `DeliveryAppAdapter` returns real `DishOffer`s for the pinned dish on 2 apps (verify by running, like the marketplace spike); cross-app price/fee comparison is possible; fixture fallback labelled.
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

### S7 — Screenshot + brand on cards (spike-gated)
- **Spike first (5 min):** hit context.dev's **Screenshot** + **Brand Intelligence** endpoints with the key (we've only proven scrape/extract). Confirm the response shape.
- **Goal:** add `screenshot_url` + `logo_url` to `DishOffer` (new `context_client` methods), render on `VerdictCards`.
- **Acceptance:** card shows a live menu screenshot + restaurant logo.

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
> 5. **Delivery:** say the best-value pick + the deal catch, then call `open_order_page(deep_link)` to take them there. **Dine-in:** give the best authentic place + why.
> Rules: never state a price/fee/ETA/fact not in a tool response; never read JSON, URLs, or field names aloud; ≤ 2 sentences per turn; if a fact is missing, say you don't have it — never invent.

**`apply_agent.py`:** load `dalal-agent.json`, substitute `{API_BASE}`/`{DALAL_SECRET_KEY}` from env, `POST`/`PATCH` the ElevenLabs agents API with `xi-api-key: $ELEVENLABS_API_KEY`, print the `agent_id`. (Confirm the exact agents-API path against current docs.)

## 4. Definition of done (the demo)

Speak *"I'm craving authentic Sichuan wontons"* → 2–3 short interview turns (delivery? spice?) → source cards fill **while the agent talks** → the agent speaks a ≤60-word verdict naming the **cross-app deal catch** → **the agent deep-links you to the order page** on the winning app. Every number carries a live timestamp; kill one source and a lower-confidence verdict still ships. Runs on public HTTPS.
