# Dalal — PRD (Food)

| | |
|---|---|
| **Product** | **Dalal** (دلال) — voice-first UAE food broker |
| **Version** | 0.3 — food pivot |
| **Status** | Engine proven on shopping; food build active |
| **Date** | 2026-08-08 |
| **Event** | Dubai AI Hub Builder Lab #3 · team of 5 · ~6 h |
| **Master doc (product + flow + capability map + V2)** | [FOOD-FLOW.md](FOOD-FLOW.md) |
| **Related** | [ARCHITECTURE.md](ARCHITECTURE.md) · [CONTRACTS.md](CONTRACTS.md) · [VENDOR-CONTRACTS.md](VENDOR-CONTRACTS.md) · [TECH-SPEC.md](TECH-SPEC.md) |

> This is the requirements view. The end-to-end flow, capability slotting, and V2 live in **[FOOD-FLOW.md](FOOD-FLOW.md)** — the master. This doc adds users, scope/acceptance, non-goals, and prize mapping without duplicating the flow.

## 1. Problem & moat

Finding food to buy well in the UAE is a research problem: *"best X near me"* is affiliate spam, delivery-app prices/fees/ETAs shift constantly, authenticity ("real má-là Sichuan" vs tourist-mild) hides in reviews, and the same dish costs differently across Talabat / Deliveroo / Careem. **Research-and-recommend is commoditized — ChatGPT does it.** Dalal's moat is **action**: it doesn't just name a place, it **hands you the order** (deep-link to the best-value app). Advice is free; the action is the product.

## 2. Users

Dubai cravers — impulse-driven (*"authentic Sichuan wontons, now"*), decision-fatigued, want it **ordered**, not just recommended. Two modes: **delivery** (the deep-link) and **dine-in** (best authentic place; the booking-call action is V2).

## 3. Scope — v0.3 (must be true for the demo)

| ID | Requirement | Acceptance |
|---|---|---|
| F1 | Voice over WebRTC | First audio < 1.5 s; barge-in works |
| F2 | Craving intake + light interview | Dish + delivery/dine-in + ≥1 refiner (spice/authenticity/area) in ≤4 turns |
| F3 | Non-blocking research | `start_research` returns `job_id` < 500 ms; agent never pauses |
| F4 | Parallel live sources | Delivery apps (≥2) + discovery fetched concurrently via **real** context.dev; each 20 s timeout |
| F5 | Live progress | Source cards fill while the agent is still talking |
| F6 | Two-option verdict | Best place + best-value app: dish, live AED price, delivery fee, ETA, why, the catch |
| F7 | Spoken summary | ≤60-word natural summary; never reads JSON/URLs aloud |
| F8 | **Deep-link hand-off** | Agent calls a client tool that navigates the browser to the winning app's restaurant page |
| F9 | Live screenshot | Verdict card shows a context.dev screenshot of the actual menu page (spike-verify first) |
| F10 | **Genuinely live or labelled** | Every price traces to a live fetch + timestamp; any fixture is badged "sample data" — never silently faked |

## 4. Non-goals (this build)

In-app cart pre-fill / completed checkout (V2 — partner APIs) · **telephony booking call (V2)** · > 2–3 seeded cuisines · Arabic *voice* (Arabic sources OK) · accounts / persistence · multi-voice debate (V2) · off-script robustness (rehearsed demo).

## 5. Prize mapping

- **context.dev** — concurrent live delivery-app extraction (price · fee · ETA), **screenshot** proof on cards, brand logos, credit telemetry. The demo has no content without it.
- **ElevenLabs** — voice-first intake + barge-in + the **client-tool deep-link** (the agent drives the browser to the order). Non-blocking webhook tools; latency hidden as conversation.
- **Devin** — food source adapters + synthesizer as bounded, fixture-backed PRs with human-review notes ([AGENTIC_ENGINEERING.md](AGENTIC_ENGINEERING.md)).

## 6. Success criteria

A stranger completes a spoken session unaided; source cards fill *while the agent talks*; the verdict names a real cross-app deal catch; the **agent deep-links to the order** on camera; every number carries a live timestamp; runs on public HTTPS. Deliberately killing one source still ships a lower-confidence verdict.

## 7. V2

See **[FOOD-FLOW.md §7](FOOD-FLOW.md)** — headlined by **the agent phoning the restaurant to book a table** (dine-in's action, via ElevenLabs telephony), plus in-app checkout, multi-voice council, taste memory, Arabic voice, group ordering, and WhatsApp entry.
