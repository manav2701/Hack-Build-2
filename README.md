# Dalal (دلال) — Voice-First UAE Food Broker

> **Dubai AI Hub Builder Lab.** Speak a craving; Dalal finds the best place, compares the dish live across delivery apps, and **takes you to the order**. Advice is commoditized (ChatGPT can recommend a restaurant) — the moat is the **action**: craving → ready to order.

**Product & flow (master doc):** [docs/FOOD-FLOW.md](docs/FOOD-FLOW.md) · **Spec:** [docs/TECH-SPEC.md](docs/TECH-SPEC.md) · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · **Contracts:** [docs/CONTRACTS.md](docs/CONTRACTS.md) · **Verified vendor APIs:** [docs/VENDOR-CONTRACTS.md](docs/VENDOR-CONTRACTS.md) · **Deploy & manual setup:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

**Live:** [web app](https://hack-build-2.vercel.app) · [API](https://hack-build-2-production.up.railway.app) · [Chrome extension](apps/extension/README.md)

## What it does

Say *"I'm craving authentic Sichuan wontons"* → a light voice interview (delivery or dine-in? spice?) → parallel **context.dev** research across delivery apps (Talabat/Deliveroo/Careem), discovery and reviews *while the agent keeps talking* → a two-option verdict (best place + best-value app) with live prices and a menu screenshot → **the agent deep-links you straight to the order page** (ElevenLabs client tool). The latency is the conversation, not a spinner.

## Status — what's built so far

- ✅ **Proven engine** (validated on the *shopping* domain first): ElevenLabs voice agent + **live context.dev structured extraction** (Noon/Amazon, Cloudflare anti-bot bypassed) + async orchestration + grounded verdict + labelled-fixture fallback. The marketplace adapter pulls **real live prices** — verified end-to-end.
- 🔜 **Food build:** repoint the sources to delivery apps, add the **client-tool deep-link hand-off** + screenshot cards. **~70% of the engine carries over** — the domain is a *variable* (the seam this was built around). See [FOOD-FLOW §4](docs/FOOD-FLOW.md).

## Surfaces

- **Web app** (`apps/web`) — the voice console: speak or type a craving, watch the verdict land with the dish photo, price, rating and a real reviewer's words, then click through to the order page.
- **Chrome extension** (`apps/extension`) — the same comparison from the toolbar, and a "Compare on DaleelBites" button injected into Talabat / Deliveroo / Noon Food themselves. [Install & setup →](apps/extension/README.md)
- **Accounts** — signup/login on both surfaces; a signed-in user's cravings and verdicts are saved and the browser attaches to *their* job rather than the newest global one.

## Stack

Voice: **ElevenLabs** Agents (WebRTC, barge-in, client/server tools, RAG). Live data: **context.dev** (search · extract · screenshot · brand). Backend: **FastAPI** (`apps/api`), accounts on stdlib `sqlite3` + HS256 JWT — no extra dependency, no database to provision. Frontend: **Next.js 14** (`apps/web`), polling the API directly. Built with **Devin** — see [docs/AGENTIC_ENGINEERING.md](docs/AGENTIC_ENGINEERING.md).

**Design:** "Raw Form" — Swiss-brutalist poster on warm paper (`#E4E2DD` base, `#1E1E1E` ink, `#DB4A2B` accent), Clash Display headlines over Satoshi body, blurred multiply blobs for depth. Content reveals are CSS keyframes, never JS-driven opacity, so a stalled animation can never leave a page blank.

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
# set ELEVENLABS_API_KEY + NEXT_PUBLIC_ELEVENLABS_AGENT_ID + NEXT_PUBLIC_API_URL in apps/web/.env.local
npm run dev
```
**Extension** (`apps/extension`): `chrome://extensions` → Developer mode → **Load unpacked** → pick the folder. Nothing else to configure; the production API is compiled in.

Live data requires a real `CONTEXT_DEV_API_KEY`; without one the adapters return **clearly-labelled** sample data (`is_fixture=true`) — the demo never silently fakes live prices.
