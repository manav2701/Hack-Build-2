# Deployment & manual setup

Live URLs:

- **Backend (Railway):** <https://hack-build-2-production.up.railway.app>
- **Frontend (Vercel):** <https://hack-build-2.vercel.app>
- **Extension:** loaded unpacked from `apps/extension` (see its [README](../apps/extension/README.md))

Everything below is either already true in the deployed environment or is called out
explicitly as **action required**.

---

## 1. Backend — Railway (`apps/api`)

### Environment variables

| Variable | Required? | Notes |
| --- | --- | --- |
| `CONTEXT_DEV_API_KEY` | **Yes for live data** | Without a real key every adapter returns clearly-labelled fixtures (`is_fixture=true`). It never silently fakes live prices. |
| `DALAL_SECRET_KEY` | Recommended | Shared secret for the `/v1/tools/*` webhook surface. While it is left at the default `dalal-secret-123`, the check is skipped so the ElevenLabs agent keeps working out of the box. |
| `JWT_SECRET` | **Action required** | Signs user session tokens. Falls back to `DALAL_SECRET_KEY`, and the app logs a warning on boot when it is unset. Generate one: `python -c "import secrets;print(secrets.token_urlsafe(48))"`. Rotating it signs everyone out. |
| `DALAL_DB_PATH` | **Action required for durable accounts** | SQLite file for accounts + craving history. Defaults to `./data/dalal.db`. See the volume note below. |
| `CORS_ORIGINS` | Optional | Comma-separated origin allow-list. Defaults to `*`. To lock down: `https://hack-build-2.vercel.app`. |
| `LLM_API_KEY` | Optional | Only re-phrases an already-grounded spoken line. Absent → the deterministic sentence is used. It can never originate a number. |
| `SUPABASE_URL` / `SUPABASE_KEY` | Optional | Mirrors jobs/verdicts to Supabase. The API works fully without it. |
| `USE_FIXTURES` | Optional | `true` forces labelled sample data. |

### ⚠ Accounts and the ephemeral filesystem

A Railway container's disk is wiped on every redeploy and restart. With the default
`DALAL_DB_PATH`, **user accounts disappear when the service restarts.**

To make them durable:

1. Railway → your service → **Variables** → add `DALAL_DB_PATH=/data/dalal.db`
2. Railway → **Settings → Volumes** → **New Volume**, mount path `/data`
3. Redeploy

Skip this and signup/login still work perfectly for the length of a demo — they just
do not survive a restart. That is a deliberate trade: the API has no external database
dependency and no extra Python package to install.

### Verify a deploy

```bash
API=https://hack-build-2-production.up.railway.app
curl -s $API/health
curl -s -X POST $API/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.ae","password":"at-least-8-chars","name":"You"}'
```

---

## 2. Frontend — Vercel (`apps/web`)

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://hack-build-2-production.up.railway.app`. A `localhost` value is **ignored** in a deployed build (`lib/api.ts`) — a Vercel build with a developer's local URL baked in would ship a site that can only talk to a machine that is not there. |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | The voice agent. Without it the avatar cannot connect. |
| `ELEVENLABS_API_KEY` | Server-side only, for `/api/token`. |
| `NEXT_PUBLIC_DALAL_KEY` | Must match `DALAL_SECRET_KEY` if you set a non-default one. |

Supabase env vars are **no longer needed**. The realtime subscription was removed:
the deployed project carried placeholder credentials, so every page load opened a
websocket that could only fail. The UI polls, which is what actually works.

---

## 3. Chrome extension

Load unpacked from `apps/extension` — see [its README](../apps/extension/README.md) for
the install steps, the two places the API origin must match, and what the Chrome Web
Store review needs if you publish it.

---

## 4. ElevenLabs agent

Tool endpoints are unchanged by this work — see
[ELEVENLABS_TOOLS_CONFIG.md](ELEVENLABS_TOOLS_CONFIG.md). The agent calls
`start_research` anonymously from ElevenLabs' cloud; the browser attaches to that job
via `GET /v1/tools/latest_job`.

When a user is signed in, `latest_job` returns **their** newest job instead of the
global newest. Newest-wins globally is fine for one demo user but wrong the moment two
people use the deployed app at once — you would watch a stranger's verdict appear on
your screen.

---

## 5. Known operational notes

- **The `CONTEXT_DEV_API_KEY` in the repo's root `.env` currently returns HTTP 401**
  when called from a local shell. The key configured on Railway works — live verdicts
  come back with real Deliveroo/Talabat prices. If you want live data locally, refresh
  that key; otherwise local runs fall back to labelled fixtures.
- Research jobs and verdicts are held in an in-memory dict in the API process. A
  restart loses in-flight jobs; finished verdicts for signed-in users survive in the
  accounts DB (given a volume).
