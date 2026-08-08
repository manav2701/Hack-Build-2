'use client';

import React from 'react';

/**
 * The dark block that ends the page, with the year set as background-weight type —
 * the one place the composition inverts from paper to ink.
 */
export const SiteFooter: React.FC = () => (
  <footer className="relative mt-24 overflow-hidden bg-raw-ink text-raw-base">
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4 sm:px-10">
      <div className="lg:col-span-2">
        <p className="font-display text-4xl uppercase leading-none tracking-brutal">
          Daleel<span className="text-raw-red">Bites</span>
        </p>
        <p className="mt-4 max-w-sm font-sans text-sm leading-relaxed text-raw-base/60">
          Advice is commoditized. The moat is the action — craving to order page, out loud,
          in one conversation.
        </p>
      </div>

      <div>
        <p className="label-raw text-raw-base/50">Live sources</p>
        <ul className="mt-4 space-y-2 font-sans text-sm text-raw-base/75">
          <li>Talabat</li>
          <li>Deliveroo</li>
          <li>Noon Food</li>
          <li>Zomato · TripAdvisor</li>
        </ul>
      </div>

      <div>
        <p className="label-raw text-raw-base/50">Built with</p>
        <ul className="mt-4 space-y-2 font-sans text-sm text-raw-base/75">
          <li>ElevenLabs Agents</li>
          <li>context.dev</li>
          <li>FastAPI · Next.js</li>
        </ul>
      </div>
    </div>

    <div className="relative flex items-end justify-between px-6 pb-6 sm:px-10">
      <span
        aria-hidden
        className="pointer-events-none select-none font-display text-[10vw] leading-none tracking-brutal text-white/10"
      >
        2026
      </span>
      <span className="label-raw pb-2 text-raw-base/50">
        © {new Date().getFullYear()} DaleelBites UAE
      </span>
    </div>
  </footer>
);
