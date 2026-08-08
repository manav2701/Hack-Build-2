# Dalal (دلال) — Voice-First UAE Food Broker

> **Dubai AI Hub Builder Lab.** Speak a craving; Dalal finds the best place, compares the dish live across delivery apps, and **takes you to the order**. Advice is commoditized (ChatGPT can recommend a restaurant) — the moat is the **action**: craving → ready to order.

**Product & flow (master doc):** [docs/FOOD-FLOW.md](docs/FOOD-FLOW.md) · **Spec:** [docs/TECH-SPEC.md](docs/TECH-SPEC.md) · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · **Contracts:** [docs/CONTRACTS.md](docs/CONTRACTS.md) · **Verified vendor APIs:** [docs/VENDOR-CONTRACTS.md](docs/VENDOR-CONTRACTS.md)

## What it does

Say *"I'm craving authentic Sichuan wontons"* → a light voice interview (delivery or dine-in? spice?) → parallel **context.dev** research across delivery apps (Talabat/Deliveroo/Careem), discovery and reviews *while the agent keeps talking* → a two-option verdict (best place + best-value app) with live prices and a menu screenshot → **the agent deep-links you straight to the order page** (ElevenLabs client tool). The latency is the conversation, not a spinner.

## Status — what's built so far

- ✅ **Proven engine** (validated on the *shopping* domain first): ElevenLabs voice agent + **live context.dev structured extraction** (Noon/Amazon, Cloudflare anti-bot bypassed) + async orchestration + grounded verdict + labelled-fixture fallback. The marketplace adapter pulls **real live prices** — verified end-to-end.
- 🔜 **Food build:** repoint the sources to delivery apps, add the **client-tool deep-link hand-off** + screenshot cards. **~70% of the engine carries over** — the domain is a *variable* (the seam this was built around). See [FOOD-FLOW §4](docs/FOOD-FLOW.md).

## Stack

Voice: **ElevenLabs** Agents (WebRTC, barge-in, client/server tools, RAG). Live data: **context.dev** (scrape · extract · screenshot · brand). Backend: **FastAPI** (`apps/api`). Frontend: **Next.js 15** (`apps/web`). Realtime: **Supabase** (+ a poll backstop). Built with **Devin** — see [docs/AGENTIC_ENGINEERING.md](docs/AGENTIC_ENGINEERING.md).

## Run

**Backend** (`apps/api`):
```bash
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # (Scripts→bin on macOS/Linux)
# set CONTEXT_DEV_API_KEY in apps/api/.env
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```
**Frontend** (`apps/web`):
```bash
npm install
# set ELEVENLABS_API_KEY + NEXT_PUBLIC_ELEVENLABS_AGENT_ID + Supabase keys in apps/web/.env.local
npm run dev
```

Live data requires a real `CONTEXT_DEV_API_KEY`; without one the adapters return **clearly-labelled** sample data (`is_fixture=true`) — the demo never silently fakes live prices.
