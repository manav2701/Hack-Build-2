'use client';

import React, { useCallback, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Flame } from 'lucide-react';

import { AnimatedAvatar } from '../components/AnimatedAvatar';
import { VerdictCards } from '../components/VerdictCards';
import { TranscriptRail } from '../components/TranscriptRail';
import { Blobs } from '../components/Blobs';
import { AccountBar } from '../components/AccountBar';
import { SiteFooter } from '../components/SiteFooter';
import { Rise } from '../components/Rise';
import { useDalalAgent } from '../hooks/useDalalAgent';
import { useResearchStream, useAgentJobDiscovery } from '../hooks/useResearchStream';
import { API_BASE, authHeaders } from '../lib/api';

const POPULAR = ['Cigkoftem Wrap', 'Sichuan Wontons', 'Royal Biryani', 'Smash Burger', 'Chicken Shawarma'];

export default function Home() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [inputQuery, setInputQuery] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { status, messages, startSession, stopSession, isSpeaking, handedOffTo } = useDalalAgent();
  const { verdict, phase, error, isResearching, reset } = useResearchStream(activeJobId);

  const lastAgentMessage = messages.filter((m) => m.sender === 'agent').slice(-1)[0]?.text;

  // Attach the page to whatever job the VOICE AGENT started in ElevenLabs' cloud.
  const handleAgentJob = useCallback((jobId: string) => setActiveJobId(jobId), []);
  useAgentJobDiscovery(true, handleAgentJob);

  /** Typed/tapped cravings take the same backend path the voice agent uses. */
  const research = async (craving: string) => {
    setStartError(null);
    reset();
    try {
      const res = await fetch(`${API_BASE}/v1/tools/start_research`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          session_id: 'daleelbites-browser-session',
          dish: craving,
          mode: 'delivery',
          area: 'Dubai',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setActiveJobId(data.job_id);
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      // Say so on screen. A dead request that leaves the panel looking merely empty is
      // the exact failure this rebuild is meant to remove.
      console.warn('start_research failed:', err);
      setStartError('Could not reach the DaleelBites backend. Check your connection and try again.');
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const craving = inputQuery.trim();
    if (!craving) return;
    research(craving);
    setInputQuery('');
  };

  return (
    <main className="relative min-h-screen">
      <Blobs />
      <AccountBar />

      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto max-w-7xl px-6 pb-16 pt-10 sm:px-10 sm:pt-16">
        <Rise
          as="h1"
          className="font-display uppercase leading-poster tracking-brutal"
          // Sized off the LONGER line ("you craving?", 12 characters) so it sets on one
          // line at every width. The floor matters as much as the ceiling: a 2.6rem
          // minimum overflowed a 430px phone, and because the headline is what the
          // layout viewport sizes itself to, that pushed the ENTIRE page off-screen.
          style={{ fontSize: 'clamp(1.85rem, 8.6vw, 11rem)' }}
        >
          What are
          <br />
          <span className="block pl-[4vw] text-raw-red sm:pl-[8vw]">you craving?</span>
        </Rise>

        <Rise
          delay={0.15}
          className="mt-10 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between"
        >
          <p className="max-w-[400px] font-sans text-lg leading-relaxed text-raw-mute">
            Say it out loud. DaleelBites compares the dish live across Talabat, Deliveroo and
            Noon Food — then hands you the order page.
          </p>

          <div className="flex items-center gap-6">
            <button onClick={status === 'disconnected' ? startSession : stopSession} className="btn-raw">
              <span>{status === 'disconnected' ? 'Start talking' : 'End session'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <a href="#craving" className="link-raw">
              Or type it <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </Rise>
      </section>

      {/* ------------------------------------------------------------ the console */}
      <section
        id="craving"
        className="mx-auto grid max-w-7xl grid-cols-1 gap-x-16 gap-y-14 px-6 py-12 sm:px-10 lg:grid-cols-12"
      >
        {/* Left: the agent */}
        <Rise className="lg:col-span-5">
          <p className="label-raw border-t-2 border-raw-ink pt-4">The broker</p>

          <AnimatedAvatar
            status={status}
            isSpeaking={isSpeaking}
            onToggleConnect={status === 'disconnected' ? startSession : stopSession}
            lastMessage={lastAgentMessage}
          />

          <div className="mt-6">
            <TranscriptRail messages={messages} />
          </div>

          {/* Typed craving */}
          <form onSubmit={submit} className="mt-8">
            <label htmlFor="craving-input" className="label-raw">
              Type a craving
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="craving-input"
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Biryani in JVC under 40 AED…"
                className="field-raw flex-1"
              />
              <button type="submit" className="btn-raw shrink-0 px-5 py-3" disabled={!inputQuery.trim()}>
                <span>Go</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* Popular cravings — a horizontal rail that scrolls inside itself. */}
          <div className="mt-7">
            <p className="label-raw mb-3 flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-raw-red" />
              Popular right now
            </p>
            {/* Wraps rather than scrolls: in a 5-of-12 column a rail cut the last chip a
                letter in, which reads as a layout bug rather than as an affordance. */}
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((craving) => (
                <button
                  key={craving}
                  onClick={() => research(craving)}
                  className="shrink-0 border border-raw-ink/25 px-3 py-2 font-sans text-[11px] font-bold uppercase tracking-wide2 text-raw-mute transition-colors duration-300 hover:border-raw-red hover:bg-raw-red hover:text-white"
                >
                  {craving}
                </button>
              ))}
            </div>
          </div>

          {startError && (
            <p className="mt-5 border-l-2 border-raw-red bg-raw-red/10 py-2 pl-3 font-sans text-xs text-raw-ink">
              {startError}
            </p>
          )}
        </Rise>

        {/* Right: the verdict */}
        <div ref={resultsRef} className="lg:col-span-7">
          <p className="label-raw border-t-2 border-raw-ink pt-4">Live result</p>

          {handedOffTo && (
            <Rise className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-raw-ink px-5 py-4 text-raw-base">
              <div>
                <p className="label-raw text-raw-orange">Order page opened</p>
                <p className="mt-1 font-sans text-sm">DaleelBites handed you off to the order page.</p>
              </div>
              <a href={handedOffTo} target="_blank" rel="noopener noreferrer" className="link-raw text-raw-orange">
                Reopen <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </Rise>
          )}

          <div className="mt-8">
            {verdict ? (
              <VerdictCards verdict={verdict} />
            ) : isResearching ? (
              <StatusPanel
                heading={<>SEARCHING<br /><span className="text-raw-red">LIVE.</span></>}
                body="Reading menus and reviews across Talabat, Deliveroo, Noon Food and Zomato. The conversation keeps going while this runs."
                pulse
              />
            ) : phase === 'error' ? (
              <StatusPanel
                heading={<>BACKEND<br /><span className="text-raw-red">UNREACHABLE.</span></>}
                body={error || 'The research API is not responding. It may be waking from sleep — this retries automatically.'}
              />
            ) : (
              <StatusPanel
                heading={<>READY<br /><span className="text-raw-red">WHEN YOU ARE.</span></>}
                body="Tap the face and speak, or type a craving. Live prices, ratings and a real reviewer's words land right here."
              />
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

const StatusPanel: React.FC<{
  heading: React.ReactNode;
  body: string;
  pulse?: boolean;
}> = ({ heading, body, pulse }) => (
  <Rise className="border-t-2 border-raw-ink/15 pt-8">
    <h2
      className={`font-display uppercase leading-poster tracking-brutal ${pulse ? 'animate-pulse' : ''}`}
      style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4rem)' }}
    >
      {heading}
    </h2>
    <p className="mt-5 max-w-md font-sans text-sm leading-relaxed text-raw-mute">{body}</p>
  </Rise>
);
