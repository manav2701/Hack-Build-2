# Dalal (دلال) — Voice-First UAE Shopping Agent

> **Dubai AI Hub Builder Lab Hackathon Project**  
> *Dalal* (Gulf Arabic for a broker/middleman who haggles on your behalf) is an asynchronous voice-first agent that interviews you on what you actually need, scrapes the live UAE market in parallel (Noon, Amazon.ae, Reddit r/dubai, Arabic warranty blogs), and speaks a 2-product verdict with realtime visual progress.

---

## 🚀 Key Features

- 🎙️ **Voice-First WebRTC Interface**: Powered by ElevenLabs Conversational AI with zero delay turn-taking and barge-in.
- ⚡ **Decoupled Realtime Pipeline**: Voice thread and research thread run independently via Supabase Realtime pushed directly to the UI and ElevenLabs agent via `sendContextualUpdate`.
- 🔎 **4 Parallel Live Scrapes (context.dev)**:
  - **Marketplace**: Live price comparison across Noon.com & Amazon.ae.
  - **Reviews**: Tech reviews & spec extraction.
  - **Community**: r/dubai local buyer complaints & seller reputation check.
  - **Warranty**: UAE regional warranty validity & official distribution checks.
- 🎯 **2-Product Verdict**: Sharp recommendation of **Top Pick** and **Runner-Up** with AED pricing, local watch-outs, and direct links.
- 🛡️ **Graceful Partial Fallback**: If an adapter times out, a high-quality partial verdict still ships with adjusted confidence rating.

---

## 🛠️ Architecture Overview

```
[ ElevenLabs WebRTC Voice Session ] <---(sendContextualUpdate)---+
                 |                                               |
         start_research (Webhook <500ms)                         |
                 v                                               |
    [ FastAPI Backend (Railway) ]                                 |
                 |                                               |
       asyncio.gather (4 sources)                                |
                 |                                               |
                 v                                               |
        [ Supabase Realtime ] ===(Websocket Push)===> [ Next.js 15 Frontend ]
```

---

## ⚡ Quickstart (Local Dev)

### 1. Environment Setup

Copy `.env.example` in both `apps/api` and `apps/web`:

```bash
# Backend (apps/api/.env)
CONTEXT_DEV_API_KEY=your_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_or_anon_key
DALAL_SECRET_KEY=your_shared_webhook_secret
LLM_API_KEY=your_llm_key

# Frontend (apps/web/.env.local)
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id
ELEVENLABS_API_KEY=your_elevenlabs_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 2. Run Backend (FastAPI)

```bash
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Run Frontend (Next.js)

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🧪 Testing

Run backend orchestrator tests & fixture fallback:

```bash
cd apps/api
pytest
```
