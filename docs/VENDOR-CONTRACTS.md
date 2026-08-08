# Dalal — Vendor Contracts (verified)

> **Why this file exists:** the prototype's `apps/api/app/adapters/context_client.py` was built against a **guessed** context.dev endpoint (`POST /v1/scrape` with `{url, format}`) that does not exist — so no live data can flow, and the adapters fall back to hardcoded constants. The shapes below are read from the primary vendor docs (via the sibling `live-council` project's verified vendor-contracts, 2026-07-21). **Build the adapters against these, not against guesses.** Anything not verifiable is in §3 Verify-on-day.

---

## 1. context.dev  —  base `https://api.context.dev/v1`, auth `Authorization: Bearer $CONTEXT_DEV_API_KEY`

Every success returns `key_metadata: { credits_consumed, credits_remaining }` — surface it in the UI footer (live credit telemetry is judge candy).

### 1.1 `GET /web/scrape/markdown` — fast single-page markdown · **1 credit**  ← reviews / community / warranty
- Query params: `url` (required), `useMainContentOnly`, `maxAgeMs` (**default ~1 day**; pass a small value e.g. `60000` for provably-fresh), `includeLinks`, `excludeSelectors[]`, `country`, `timeoutMS`, `tags`.
- Response: `{ success, markdown, contentLength, url, metadata:{ title, finalUrl, description, … }, key_metadata }`.
- Errors: 4xx/5xx `{ message, error_code }` — e.g. `WEBSITE_ACCESS_ERROR`, `RATE_LIMITED`. Map to `SourceResult(status="failed", error=error_code)`.

### 1.2 `POST /web/extract` — schema-guided structured extraction · **10 credits**  ← marketplace (price / seller / warranty)
- Body: `{ url, schema (JSON Schema), instructions (≤2000 chars), factCheck?: true, maxPages (1–50, default 5), stopAfterMs, maxAgeMs, tags }`.
- Response: `{ status, url, urls_analyzed[], data (matches your schema), metadata:{ numSucceeded, … }, key_metadata }`.
- **This is the "best use of context.dev"** for marketplace listings — hand it a schema, get typed fields back, no HTML parsing. Exact `data` field names for a Noon/Amazon.ae page → V-1.

### 1.3 `POST /web/crawl` — multi-page · **1 credit/page**  ← only if a search page must be walked to find the product URL
- Body: `{ url, maxPages (1–500, default 100), stopAfterMs (10000–110000, **default 80000 — a demo-killer; always pass `20000`**), maxAgeMs (default 1 day), useMainContentOnly, … }`.
- Response: `{ results:[{ markdown, metadata }], metadata:{ numSucceeded, … }, key_metadata }`.

### 1.4 Latency & the pre-warm lever (demo-critical)
- A **cold** fetch of a JS-heavy, anti-bot page (Noon / Amazon.ae) with stealth is **several–30 s**. Because `maxAgeMs` **defaults to ~1 day**, a call at default freshness is served from cache and is fast.
- **Pre-warm:** minutes before the demo, run the exact demo URLs once. On stage the same call hits **warm cache → ~1–2 s**, and it is still *real* data (captured minutes ago). Never demo a cold arbitrary scrape.

### 1.5 The corrected client (replaces the guessed `POST /scrape`)
```python
BASE = "https://api.context.dev/v1"
H = {"Authorization": f"Bearer {key}"}

# reviews / community / warranty → markdown
r = await client.get(f"{BASE}/web/scrape/markdown", headers=H,
        params={"url": url, "useMainContentOnly": True, "maxAgeMs": max_age_ms})
md = r.json()["markdown"]

# marketplace → structured offer
r = await client.post(f"{BASE}/web/extract", headers=H,
        json={"url": url, "schema": OFFER_SCHEMA,
              "instructions": "Extract the live price in AED, seller name, whether the seller is the "
                              "official store or a 3rd-party marketplace seller, warranty type "
                              "(local vs international), and delivery estimate.",
              "maxAgeMs": max_age_ms})
data = r.json()["data"]   # shape → V-1
```

### 1.6 Rate limits & credits
- Free 30 req/min · Pro 300 · Scale 800. `crawl` and `extract`-class weigh more; `scrape/markdown` weighs 1. `429 → Retry-After` (not billed) — honor it, one retry, then fail honestly.
- Budget: hackathon team credits are ample; still pass `tags: ["dalal"]` for usage reporting.

---

## 2. ElevenLabs Agents  —  docs base `elevenlabs.io/docs/eleven-agents/…`

- **Single voice** for Dalal (multi-voice is V2). Persona lives in the agent config.
- **Webhook (server) tools:** `{ name, description, api_schema:{ url, method, path_params_schema, query_params_schema, body schema } }`. The URL supports `{placeholders}`; the agent fills params from the conversation. Our tools: `start_research`, `research_status`, `get_verdict`. **Every endpoint must answer HTTP 200 fast** — never a raw 5xx/404 into the conversation (see CONTRACTS.md §2 `get_verdict` fix).
- **Dynamic variables:** `{{name}}` in prompt / first-message / tool-params; flat `string|number|bool`; `system__` and `secret__` prefixes are reserved. Carry `job_id` this way (or via the `start_research` response the agent echoes).
- **React SDK** `@elevenlabs/react`: `useConversation`, `startSession({ agentId | signedUrl | conversationToken })`. The `apps/web/app/api/token/route.ts` route already mints a **signed URL** — wire `startSession({ signedUrl })` to it for a private agent. `onMessage` → accumulate final transcriptions. Barge-in is native. `sendContextualUpdate(text)` nudges the agent when research completes (the push path).

---

## 3. Verify-on-day (build nothing load-bearing against these — resolve in the spike)

| ID | Unknown | Plan |
|---|---|---|
| **V-1** | Exact `/web/extract` `data` field names for a real Noon / Amazon.ae product page | First spike task: run `/web/extract` with `OFFER_SCHEMA` against a real URL; adjust the schema/mapping to the actual payload |
| **V-2** | Webhook-tool timeout ceiling (vendor docs don't state it) | Our endpoints answer `< 500 ms` by contract; measure the ceiling empirically |
| **V-3** | Warm-cache latency for the specific demo URLs | Pre-warm the exact URLs; time a warm vs cold call |
| **V-4** | Whether Noon/Amazon listings expose warranty/seller-type in-page, or it must come from the community/warranty source | If not in-listing, let the synthesizer combine the marketplace price with the warranty source's signal |
