# DaleelBites — Technical Specification (tech-specs.md)

*Complete technical specification document for DaleelBites UAE Voice Food Broker.*

---

## 1. Problem Statement & Solution

Ordering food across UAE delivery platforms (Noon Food, Talabat, Deliveroo) presents multiple friction points:
- Shifting delivery fees, surge pricing, and promotional coupons for the exact same dish.
- Unreliable affiliate search results.
- Difficulty finding genuine food authenticity ratings (e.g. authentic Sichuan má-là vs mildized versions).

**Solution**: DaleelBites converts food discovery into a voice-first broker conversation:
1. Speak a food craving to DaleelBites AI.
2. DaleelBites executes non-blocking parallel research across delivery apps, Zomato, and r/dubai.
3. Upon synthesizing the best deal, DaleelBites calls the ElevenLabs client tool `open_order_page(url)` to open the order page directly in the user's browser.

---

## 2. Architecture & Pipeline Overview

```
User Voice Input (ElevenLabs WebRTC)
       │
       ▼
FastAPI Backend (Railway) ──► asyncio.gather() ──► context.dev API
       │                          ├── Noon Food outlet extraction
       │                          ├── Talabat / Deliveroo menu extraction
       │                          └── r/dubai & Zomato authenticity reviews
       ▼
Verdict Synthesizer ──► Grounded Pick & Runner-up Recommendation
       │
       ├─► Next.js Frontend (Poll / Supabase Realtime) ──► Renders VerdictCards & Images
       └─► ElevenLabs Voice Agent ──► Reads spoken_summary & calls open_order_page(url)
```

---

## 3. Tool Rationale

- **context.dev**: Handles schema-guided structured extraction (`POST /web/extract`, `waitForMs=2500`) against JS-rendered delivery portals without relying on static LLM training data.
- **ElevenLabs Agents**: Delivers sub-second WebRTC voice conversation, barge-in handling, and client-side browser navigation via `open_order_page(url)`.
- **Devin AI**: Accelerated modular development of typed models (`CravingQuery`, `DishOffer`, `DishRecommendation`) and adapter pipelines.

---

## 4. Six-Hour Feasibility & Execution Timeline

- **H0–H1**: Domain architecture definition & schema design.
- **H1–H3**: Concurrency food extraction adapter development (`FoodDeliveryAdapter`).
- **H3–H4**: Grounded synthesizer implementation (ensuring `spoken_summary` ≤ 60 words).
- **H4–H5**: ElevenLabs client tool integration & Next.js frontend redesign.
- **H5–H6**: 41/41 unit test suite execution and Railway deployment.

---

## 5. What V2 Looks Like

- **Automated Phone Table Reservations**: ElevenLabs Telephony calls restaurants to reserve tables for dine-in cravings.
- **In-App One-Tap Checkout**: Direct API integration for instant order placement.
- **Multi-Voice Food Council**: Interactive debate between a deal-hunter voice and a foodie critic voice.
- **Taste Memory**: Personalized user preferences and automatic re-ordering.
