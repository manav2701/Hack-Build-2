# Dalal — Food Flow Map (the pivot)

> **Supersedes the shopping framing.** Dalal pivots from "where to buy a product" to a **voice food broker**: speak a craving → it finds the best place, compares the dish live across delivery apps, and **takes you to the order**. The engine is unchanged (see §4 "What carries over"); we repoint the sources and add one new capability — the action hand-off. PRD.md / ARCHITECTURE.md / CONTRACTS.md still describe the shopping build and need repointing (tracked in §7).

## 1. Why this, not ChatGPT

Research-and-recommend is commoditized — ChatGPT with browsing will name the best Sichuan wontons in Dubai. **The moat is action:** ChatGPT is an advisor and structurally stops at advice; it cannot complete or hand off a transaction on a UAE delivery app. Dalal does the **last mile** — craving → *ready to order*. The demo's climax is the hand-off, not the recommendation.

## 2. The flow

```mermaid
flowchart TD
    A["🎙️ 'I'm craving authentic Sichuan wontons'"] --> B{"Light interview — 1-3 Qs<br/>(covers the research latency)"}
    B -->|"delivery or dine-in?<br/>spice / authenticity / area"| C["start_research (non-blocking, returns job_id <500ms)"]
    C --> D["Parallel context.dev research (while the agent keeps talking)"]
    D --> D1["Discovery: places serving the dish<br/>Google / Zomato + reviews"]
    D --> D2["Delivery apps: Talabat · Deliveroo · Careem<br/>dish price · delivery fee · ETA · availability"]
    D --> D3["Authenticity signals<br/>reviews mentioning real má-là Sichuan"]
    D --> D4["Screenshot + brand logo for each pick"]
    D1 --> E["Synthesize: best place + best-value app (grounded)"]
    D2 --> E
    D3 --> E
    D4 --> E
    E --> F{"Delivery or dine-in?"}
    F -->|Delivery| G["Cross-app deal pick<br/>'38 AED, free delivery on Deliveroo right now'"]
    G --> H[["🚀 Client tool: open_order_page(url)<br/>DEEP-LINK hand-off to the app"]]
    F -->|Dine-in| I["Best authentic place<br/>rating · hours · map link"]
    I -.->|V2| J[["📞 Telephony: agent CALLS the restaurant<br/>and books your table"]]
    H --> K["Verdict cards: pick + runner-up<br/>live price · screenshot · logo · 'as of HH:MM'"]
    I --> K
```

The signature mechanic is unchanged from the shopping build: **the interview question is asked *over* the research** — no spinner, the latency is the conversation.

## 3. Capability slotting (which sponsor feature, where, and what tier)

| Capability | Tool · feature | Where in the flow | Tier |
|---|---|---|---|
| Voice agent, barge-in, interview | **ElevenLabs** Agents | intake + branch | Core *(carryover)* |
| Non-blocking research + poll/realtime completion | engine | `start_research` → `get_verdict` | Core *(carryover)* |
| Structured dish extract (price · fee · ETA · availability) | **context.dev** `/web/extract`, `maxPages:1` | D2 | Core *(proven live)* |
| Cross-app deal comparison → best-value pick | synthesizer | E → G | Core |
| **Deep-link hand-off (the wow)** | **ElevenLabs client tool** `open_order_page(url)` | H | **Core** |
| Live screenshot of the menu on the card | **context.dev** Screenshot API | D4 → K | Core\* *(5-min spike first)* |
| Brand logo / colour on cards | **context.dev** Brand Intelligence | D4 → K | Stretch |
| Authenticity smarts ("real má-là or mild?") | **ElevenLabs** Knowledge Base (RAG) | B | Stretch |
| Judges try it on their phones | **ElevenLabs** web widget + shareable link | distribution | Stretch |
| Agent built **as code** — config · prompt · tools · client handlers (delivery/dine-in branch lives in the prompt) | **Devin** + ElevenLabs API (`create_agent`/`update_agent`) | agent build | Core *(best use of Devin — not the no-code workflow builder)* |
| **Agent phones the restaurant to book a table** | **ElevenLabs** telephony (SIP/Twilio) | J | **V2** |

\* Screenshot + Brand endpoints are documented but not yet hit with our key — spike them like we did `/web/extract` before banking the demo on them.

**Two verified constraints we design around:** context.dev has **no web-search endpoint** (resolve each app's restaurant URL by scraping its search page or pinning demo URLs — the same trick that worked for products) and **no browser automation** (so a true in-app cart pre-fill is not context.dev's job — it's V2 via partner APIs).

## 4. What carries over from the shopping engine (~70% — this is why the pivot is cheap)

Everything structural transfers untouched; we only repoint sources and add the hand-off:

- **Voice agent** (ElevenLabs, WebRTC, single voice, barge-in) — same.
- **context.dev client** — already proven live (correct endpoints, browser-UA past Cloudflare, `maxPages:1`, pre-warm, credit telemetry). Just point it at new domains.
- **Async orchestration** (`asyncio.gather`, 20 s per-adapter timeout, partial degradation) — same.
- **Adapter protocol + registry + the domain seam** — this *is* the "make the domain a variable" seam we built. Food is a new `DomainConfig` with new source adapters; the orchestrator stays domain-blind.
- **Verdict pattern** (pick + runner-up, grounded, `spoken_summary` ≤ 60 words) — same shape, new content.
- **Non-blocking `start_research` + poll `get_verdict` + Supabase realtime** — same.
- **Pre-warm + labelled fixture fallback** (`is_fixture`) — same discipline.
- **The UI shell** (voice orb, research trail, verdict cards, transcript rail) — same; re-skin copy.

## 5. What's new (~30%)

- **Food source adapters** (same `SourceAdapter` base): `DeliveryAppAdapter` (Talabat/Deliveroo/Careem — dish price, fee, ETA, availability), `DiscoveryAdapter` (Google/Zomato — which places serve the dish), `ReviewsAdapter` (authenticity signal).
- **The delivery-vs-dine-in branch** (workflow builder or prompt).
- **The deep-link hand-off** — ElevenLabs **client tool** `open_order_page(url)` registered in `useDalalAgent`, so the *voice agent itself* navigates the browser to the winning app's restaurant page.
- **context.dev Screenshot + Brand Intelligence** → card assets (proof + polish).
- **Authenticity knowledge base** (ElevenLabs RAG) for the interview.
- **New verdict shape:** restaurant, dish, app, delivery_fee, eta, deep_link, screenshot_url, logo_url (vs product/store).
- **Location context** — delivery apps are location-gated; set a fixed Dubai location for the demo.

## 6. 6-hour scope (core only)

Craving → light interview → research (delivery-app extract on **pinned demo restaurant URLs** + discovery) → cross-app best-value pick → **client-tool deep-link hand-off** → verdict cards with a **live screenshot**. Pin the demo restaurant's URLs on 2 delivery apps (apples-to-apples), pre-warm them, keep the labelled fixture fallback. Everything else in §3 is stretch.

## 7. What V2 looks like

- **📞 The agent phones the restaurant and books your table.** The dine-in equivalent of the delivery deep-link, via ElevenLabs telephony (SIP/Twilio outbound). *"I'll ring them and reserve a table for two at 8."* A real action ChatGPT structurally cannot do — the standout V2 wedge, pulled out of the hackathon scope for risk/time.
- **One-tap in-app checkout** — full cart pre-fill via delivery-app **partner APIs** (not public today), turning the deep-link hand-off into a completed order without leaving Dalal.
- **Multi-voice food council** — a "deal-hunter" and a "local foodie" debate the pick out loud (the original Live Council idea) for indecisive cravings.
- **Taste memory / reorder** — remembers spice tolerance and favourites: *"the usual biryani?"* Requires persistence (out of hackathon scope by design).
- **Arabic (and multilingual) voice** — ElevenLabs ships 31 languages; Dubai is multilingual. Arabic *speech*, not just Arabic *sources*.
- **Group ordering** — several people speak cravings; Dalal finds the one place that satisfies all.
- **Proactive / scheduled** — *"order my Thursday biryani at 1 pm."*
- **Promo & loyalty aggregation** — surface the best code/deal across apps; a seller-trust/deal-quality score that compounds into a real data asset.
- **WhatsApp as the entry point** — the dominant UAE channel.
