# Dalal — Technical Spec (Food)

*The five questions, for the build and the judges. Product + flow + capability slotting + V2 live in the master **[FOOD-FLOW.md](FOOD-FLOW.md)**; system detail in [ARCHITECTURE.md](ARCHITECTURE.md); typed shapes in [CONTRACTS.md](CONTRACTS.md).*

---

## 1. What's the problem, and what are we solving?

Ordering food well in the UAE is a research problem: search is affiliate spam, delivery-app prices/fees/ETAs shift constantly, authenticity hides in reviews, and the same dish costs differently across Talabat / Deliveroo / Careem. **Research-and-recommend is commoditized — ChatGPT does it.** Dalal's wedge is **action**: you speak a craving and it **hands you the order** — a live deep-link to the best-value app. Advice is free; the last mile is the product.

## 2. The architecture

One **ElevenLabs** voice agent up front; a **FastAPI** orchestrator fanning out concurrent **context.dev** jobs; a grounded synthesizer; and — the new piece — an **ElevenLabs client tool** that lets the agent navigate the user's browser to the order page.

```
voice (ElevenLabs, WebRTC)
   │ start_research (webhook tool, job_id <500ms, non-blocking)
   ▼
FastAPI orchestrator ── asyncio.gather (delivery apps + discovery + reviews, 20s timeout) ──▶ context.dev
   │      delivery apps → /web/extract   (dish price · fee · ETA · availability)
   │      discovery/reviews → /web/scrape/markdown ; menu screenshot → Screenshot API
   ▼    each result persisted ──▶ live cards (Supabase realtime + poll backstop)
synthesizer → verdict (best place + best-value app, grounded: no price without a fetched source)
   │
   ▼ get_verdict → agent speaks ≤60-word summary
   ▼ open_order_page(url)  ← ElevenLabs CLIENT tool → browser deep-links to the order
```

Monorepo: `apps/api` (FastAPI) · `apps/web` (Next.js 15). Domain-blind orchestrator loops a `DomainConfig`; food is a config + new adapters against the same `SourceAdapter` protocol. Detail + current code state: [ARCHITECTURE.md](ARCHITECTURE.md).

## 3. Tool rationale (why each, best-steered)

| Tool | Why | How we steer it |
|---|---|---|
| **context.dev** | Every price/fee/ETA is live and timestamped — no model memory. Scrape + **schema-guided extraction** across JS-heavy, anti-bot delivery apps, stealth included (proven live: Cloudflare bypassed with a browser UA). | `/web/extract` `maxPages:1` on pinned restaurant pages; **pre-warm** via `maxAgeMs` for warm-cache speed; **Screenshot API** for on-card proof; brand logos; credit telemetry. |
| **ElevenLabs** | Voice inverts the filter-first UI and turns ~40 s of research into conversation. The **client tool** is what lets the agent *do the action* — navigate the browser to the order. | One tuned voice; non-blocking `start_research`; `open_order_page(url)` client tool for the hand-off; spoken summary separate from screen detail; knowledge base for authenticity. |
| **Devin** | Pure typed seams — food adapters, synthesizer, schemas — are ideal bounded slices; the fiddly voice/agent glue stays human. | One PR per slice against the contracts; fixture at every boundary; `AGENTIC_ENGINEERING.md` logs each delegated task + human correction. |

## 4. Six-hour feasibility

**We are not starting from zero.** The engine is built and the hard risk is retired: context.dev extraction is **proven live** (real Noon/Amazon prices, anti-bot bypassed) and ~70% carries over to food (voice, orchestration, verdict, poll/realtime, pre-warm, fixtures, UI). The six hours are: **repoint the sources to delivery apps + add the deep-link hand-off.**

**Pre-day spike:** hit context.dev's **Screenshot + Brand** endpoints with the key (we've proven scrape/extract); fire the ElevenLabs **client tool** to confirm the browser navigates on the agent's command.

| Window | Focus |
|---|---|
| H0–H1 | New `DomainConfig` (food) + pin the demo restaurant's URLs on 2 delivery apps; confirm `/web/extract` payload for a menu page. |
| H1–H3 | Food adapters (delivery-app price/fee/ETA, discovery) using the proven client; ground the synthesizer in the offers. *[Devin]* |
| H3 | **Checkpoint:** real cross-app data flows? If not, 1 app + fixture the rest (labelled). |
| H3–H4 | Wire the **client-tool deep-link**; screenshot on cards; pre-warm the demo URLs. |
| H4–H5 | Polish the one path: the deal catch lands, the hand-off fires on the agent's voice, timestamps + credit telemetry show. |
| H5–H6 | Deploy (public HTTPS); rehearse 10×; backup video; Devin PR trail. Freeze. |

## 5. What V2 looks like

Headlined by **📞 the agent phoning the restaurant to book your table** — the dine-in equivalent of the delivery deep-link, via ElevenLabs telephony (SIP/Twilio), a real action ChatGPT can't do. Plus: one-tap in-app checkout via partner APIs · multi-voice food council · taste memory / "the usual" · Arabic (and multilingual) voice · group ordering · scheduled/proactive ordering · promo & loyalty aggregation · WhatsApp as the entry point. Full detail: [FOOD-FLOW.md §7](FOOD-FLOW.md).
