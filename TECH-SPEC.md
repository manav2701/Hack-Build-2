# DaleelBites — Technical Specification (UAE Voice Food Broker)

*Master technical spec for DaleelBites. Covers the problem, architecture, tool rationale, six-hour feasibility, and V2 roadmap.*

---

## 1. What's the problem, and what are we solving?

Ordering food in the UAE is a fragmented, noisy experience:
- Search engines return SEO-cluttered affiliate blogs.
- Food delivery platforms (Noon Food, Talabat, Deliveroo) feature hidden delivery fees, surge pricing, shifting ETAs, and varying promo discounts for the exact same restaurant.
- Food authenticity (e.g. genuine Sichuan má-là pepper vs westernized mild) is buried deep within customer reviews.

**Research-and-recommend is commoditized — ChatGPT with web browsing can list restaurant names.** 

DaleelBites' moat is **action and the last mile**:
1. You speak a craving out loud (*"Craving authentic Sichuan wontons in Dubai Marina"*).
2. DaleelBites runs live parallel extraction across Noon Food, Talabat, Deliveroo, Zomato, and r/dubai.
3. The ElevenLabs voice agent **hands you the order** by calling the client tool `open_order_page(url)`, directly opening the winning deal page in your browser.

---

## 2. Architecture & Pipeline Flow

```
Voice Intake (ElevenLabs WebRTC Agent)
   │
   ├─► start_research (Webhook tool, returns job_id < 500ms, non-blocking)
   ▼
FastAPI Orchestrator ── asyncio.gather (concurrently hits adapters) ──► context.dev API
   │   ├── FoodDeliveryAdapter (Noon Food · Talabat · Deliveroo via /web/extract with waitForMs=2500)
   │   ├── ReviewsAdapter (Zomato / Google Food reviews for authenticity)
   │   └── CommunityAdapter (r/dubai Reddit discussions for portion & surge fee alerts)
   ▼
Grounded Synthesizer ──► Verdict (Best-value pick + Runner-up option)
   │
   ├─► get_verdict (Poll / Supabase Realtime) ──► UI renders dynamic food cards + images
   └─► ElevenLabs Agent reads spoken_summary (≤ 60 words)
         │
         └─► open_order_page(url)  [ElevenLabs CLIENT Tool] ──► Browser opens order deep-link
```

### Core Architecture Seams:
- **`apps/api` (FastAPI)**: Asynchronous pipeline backend hosting `start_research`, `get_verdict`, and `latest_job`.
- **`apps/web` (Next.js 14)**: Responsive UI shell matching modern glassmorphic food broker designs, featuring `AnimatedAvatar` for lip-sync visemes and dynamic `VerdictCards`.
- **`context.dev` Integration**: `POST /web/extract` with `waitForMs=2500` and schema guidance to extract live Next.js DOM structures.

---

## 3. Tool Rationale & Steering

| Tool / Technology | Why We Chose It | How We Steer It |
|---|---|---|
| **context.dev** | Provides live, un-hallucinated price, fee, ETA, and review data from JS-rendered food delivery sites without relying on stale LLM memory. | Used with `POST /web/extract` (`maxPages: 1`, `waitForMs: 2500`, `stopAfterMs: 15000`) and browser User-Agent headers to bypass Cloudflare edge checks cleanly. |
| **ElevenLabs Agents** | Transforms 30+ seconds of multi-app research into a natural voice conversation with barge-in support. | Steered via 1-question intake prompt; `start_research` launched on turn 1; `open_order_page(url)` client tool for browser deep-link handoff. |
| **Devin AI** | Enables rapid, typed engineering across backend domain models, adapter protocols, and synthesizer contracts. | Driven via strict contract specifications (`CONTRACTS.md`, `FOOD-FLOW.md`) with comprehensive pytest verification. |

---

## 4. Six-Hour Feasibility & Execution Breakdown

The architecture leverages a domain-blind engine where domain logic is specified via source adapters:

| Timeline | Execution Focus |
|---|---|
| **H0 – H1** | Domain Seam Definition & Food Schemas (`CravingQuery`, `DishOffer`, `RestaurantReview`, `DishRecommendation`). |
| **H1 – H3** | Multi-app `FoodDeliveryAdapter` implementation supporting live Noon Food, Talabat, and Deliveroo extraction with `asyncio.gather()` concurrency. |
| **H3 – H4** | Grounded `VerdictSynthesizer` implementation ensuring spoken summaries remain ≤ 60 words and prices strictly match extracted facts. |
| **H4 – H5** | ElevenLabs Client Tool integration (`open_order_page`) and Next.js frontend redesign (`DaleelBites` UI + `AnimatedAvatar`). |
| **H5 – H6** | Automated test suite creation (41/41 Pytest unit tests), Railway backend deployment, and live WebRTC verification. |

---

## 5. What V2 Looks Like

1. **📞 Automated Telephony Table Booking**:
   For dine-in cravings, the voice agent uses ElevenLabs Telephony (SIP/Twilio) to **call the restaurant live and reserve a table**.
2. **One-Tap In-App Checkout**:
   Pre-fills the delivery app cart directly via partner APIs, completing the transaction without leaving DaleelBites.
3. **Multi-Voice Food Council**:
   A multi-agent debate (e.g. a "Deal Hunter" vs a "Foodie Critic") discussing out loud which place to order from.
4. **Taste Memory & Re-ordering**:
   Persists user spice tolerance, dietary restrictions (vegan, halal, keto), and favorite items (*"Order my usual Sichuan wontons"*).
5. **WhatsApp Voice Entry**:
   Supports direct WhatsApp voice note food ordering for the primary UAE communications channel.
