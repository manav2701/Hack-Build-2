# DaleelBites (دليل بايتس) — Voice-First UAE Food Broker

Speak a craving. DaleelBites checks what's actually available right now across Talabat, Deliveroo and Noon Food, tells you the best option out loud, and takes you straight to the order page.

## The problem

Any chatbot can *recommend* a restaurant — that's commodity advice. The actual friction is everything after: opening three delivery apps, checking which one has the dish, comparing prices, reading reviews to see if it's any good, and finally tapping order. That's five minutes of app-switching for a decision that should take one conversation.

## The solution

1. **You say what you're craving.** A voice agent (ElevenLabs) has a short back-and-forth — delivery or dine-in, any preferences — while it works in the background.
2. **It searches live**, in parallel, across delivery apps and review sites (context.dev), extracting real menu prices, ratings, and actual customer reviews as it goes. No pinned demo data — it searches fresh every time.
3. **It ranks by what matters**: first, which places actually carry the dish; then reviews (weighted by how many, so 200 reviews at 4.6 beats 5 reviews at 5.0); price only breaks a tie.
4. **It gives you a verdict**, spoken and on-screen — the pick, a runner-up, the dish photo, why it won, anything to watch out for — and hands you straight to the order page.

Every number in that verdict traces back to a real fetch. If a source comes back empty, the answer is "nothing found," never a guess dressed up as one.

## See it in action

[![Watch the DaleelBites Chrome extension demo](https://drive.google.com/thumbnail?id=1DsnuPCDhiJ5WtbAn18-GRJIZTf5yFRBV&sz=w1280)](https://drive.google.com/file/d/1DsnuPCDhiJ5WtbAn18-GRJIZTf5yFRBV/view)

*Click the image to play — GitHub can't embed Google Drive video directly, so this opens it in Drive.*

## Try it live

| | |
|---|---|
| **Web app** | <https://hack-build-2.vercel.app> |
| **API** | <https://hack-build-2-production.up.railway.app> |
| **Chrome extension** | see [apps/extension/README.md](apps/extension/README.md) — load-unpacked, no store listing yet |

## How it's built

| Piece | What it does |
|---|---|
| `apps/api` | FastAPI backend. Runs the research pipeline, ranks results, builds the verdict, holds user accounts. |
| `apps/web` | Next.js app. The voice console — talk or type, watch the verdict land. |
| `apps/extension` | Chrome extension (MV3). Same voice agent in a side panel, plus a "Compare" button injected into the delivery apps themselves. |
| `docs/` | Deep-dive docs — architecture, data contracts, vendor API notes, deployment guide. |

**Stack:** ElevenLabs (voice), context.dev (live web search/extraction), FastAPI + SQLite (backend, accounts), Next.js (web), vanilla JS + esbuild (extension).

## Run it yourself

### Backend

```bash
cd apps/api
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Scripts → bin on macOS/Linux
```

Set `CONTEXT_DEV_API_KEY` in `apps/api/.env` (without it, the API still runs and returns clearly-labelled sample data instead of live prices).

```bash
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

### Web app

```bash
cd apps/web
npm install
```

Set in `apps/web/.env.local`: `ELEVENLABS_API_KEY`, `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`, and `NEXT_PUBLIC_API_URL` (point it at your local backend, or leave it unset to use the live one).

```bash
npm run dev
```

### Chrome extension

```bash
cd apps/extension
npm install
npm run build
```

Then `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `apps/extension`. Full walkthrough (including the voice side panel and mic permission) in [apps/extension/README.md](apps/extension/README.md).

## Learn more

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together
- [docs/CONTRACTS.md](docs/CONTRACTS.md) — the data shapes and anti-fabrication rules the verdict has to obey
- [docs/VENDOR-CONTRACTS.md](docs/VENDOR-CONTRACTS.md) — what was actually verified about each delivery app's pages
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — every environment variable, and what needs setting up by hand
- [docs/FOOD-FLOW.md](docs/FOOD-FLOW.md) — the product flow this was designed around
