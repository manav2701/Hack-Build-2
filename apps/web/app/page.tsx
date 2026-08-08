'use client';

import React, { useState, useCallback } from 'react';
import { AnimatedAvatar } from '../components/AnimatedAvatar';
import { ResearchTrail } from '../components/ResearchTrail';
import { VerdictCards } from '../components/VerdictCards';
import { TranscriptRail } from '../components/TranscriptRail';
import { useDalalAgent } from '../hooks/useDalalAgent';
import { useResearchStream, useAgentJobDiscovery } from '../hooks/useResearchStream';
import { Sparkles, MapPin, Search, UtensilsCrossed, Flame, User as UserIcon } from 'lucide-react';

export default function Home() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [inputQuery, setInputQuery] = useState('');

  const {
    status,
    messages,
    startSession,
    stopSession,
    sendContextualUpdate,
    isSpeaking,
    handedOffTo
  } = useDalalAgent((jobId) => setActiveJobId(jobId));

  const { sources, verdict, isResearching, setSources, setVerdict, setIsResearching } = useResearchStream(activeJobId);

  const lastAgentMessage = messages.filter((m) => m.sender === 'agent').slice(-1)[0]?.text;

  // Attach the page to whatever job the VOICE AGENT started.
  const handleAgentJob = useCallback((jobId: string) => setActiveJobId(jobId), []);
  useAgentJobDiscovery(true, handleAgentJob);

  // Quick Craving Triggers for Food
  const triggerFoodResearch = async (craving: string) => {
    setIsResearching(true);
    setSources([]);
    setVerdict(null);

    const envApi = process.env.NEXT_PUBLIC_API_URL;
    const apiUrl = envApi && !envApi.includes('localhost') && !envApi.includes('127.0.0.1')
      ? envApi
      : 'https://hack-build-2-production.up.railway.app';
    try {
      const res = await fetch(`${apiUrl}/v1/tools/start_research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dalal-Key': 'dalal-secret-123' },
        body: JSON.stringify({
          session_id: 'daleelbites-browser-session',
          category: 'food',
          dish: craving,
          budget_aed: 100,
          usage: 'Dubai Marina delivery'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setActiveJobId(data.job_id);

        // Fallback polling if Supabase Realtime is not active locally
        setTimeout(async () => {
          const verdictRes = await fetch(`${apiUrl}/v1/tools/get_verdict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Dalal-Key': 'dalal-secret-123' },
            body: JSON.stringify({ job_id: data.job_id })
          });
          if (verdictRes.ok) {
            const vData = await verdictRes.json();
            setVerdict(vData);
            setIsResearching(false);
            sendContextualUpdate(`RESEARCH_COMPLETE for job ${data.job_id}`);
          }
        }, 1500);
      }
    } catch (err) {
      console.warn('Backend API connection fallback active:', err);
      setIsResearching(false);
    }
  };

  const toggleConnect = () => {
    if (status === 'disconnected') {
      startSession();
    } else {
      stopSession();
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;
    triggerFoodResearch(inputQuery.trim());
    setInputQuery('');
  };

  return (
    <main className="min-h-screen bg-[#0A0D14] text-slate-100 flex flex-col justify-between selection:bg-amber-500 selection:text-slate-950 font-sans">
      {/* Glow Background */}
      <div className="fixed top-0 left-1/4 w-[600px] h-[300px] bg-amber-500/10 blur-[150px] pointer-events-none rounded-full" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[300px] bg-orange-600/10 blur-[150px] pointer-events-none rounded-full" />

      {/* Top Navbar */}
      <header className="w-full border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-400 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <UtensilsCrossed className="w-5 h-5 font-extrabold" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-100 flex items-center gap-1.5">
                Daleel<span className="text-amber-400">Bites</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium tracking-wide">UAE VOICE FOOD BROKER</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-400">
            <a href="#" className="text-amber-400 font-bold hover:text-amber-300">Home</a>
            <a href="#" className="hover:text-slate-200 transition-colors">Discover</a>
            <a href="#" className="hover:text-slate-200 transition-colors">Cravings</a>
            <a href="#" className="hover:text-slate-200 transition-colors">Reservations</a>
          </nav>

          {/* Location & Profile */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>Dubai, UAE</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer">
              <UserIcon className="w-4 h-4" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Two-Column Dashboard Content */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Column: Voice Agent & Conversation Panel (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-slate-950/60 rounded-3xl p-6 border border-slate-800/80 shadow-2xl backdrop-blur-sm">
          <div>
            {/* Animated Avatar */}
            <AnimatedAvatar status={status} isSpeaking={isSpeaking} onToggleConnect={toggleConnect} lastMessage={lastAgentMessage} />

            {/* Research Trail */}
            <ResearchTrail sources={sources} isResearching={isResearching} />

            {/* Transcript Rail */}
            <div className="mt-4">
              <TranscriptRail messages={messages} />
            </div>
          </div>

          {/* Input & Quick Craving Triggers */}
          <div className="mt-6 pt-4 border-t border-slate-800">
            {/* Quick Craving Triggers */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[11px] font-semibold text-slate-400 shrink-0 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Popular Cravings:
              </span>
              {[
                'Cigkoftem Wrap',
                'Sichuan Wontons',
                'Royal Biryani',
                'Gourmet Smash Burger'
              ].map((craving) => (
                <button
                  key={craving}
                  onClick={() => triggerFoodResearch(craving)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-semibold whitespace-nowrap transition-colors"
                >
                  {craving}
                </button>
              ))}
            </div>

            {/* Manual Text Query Form */}
            <form onSubmit={handleCustomSubmit} className="relative flex items-center">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Speak or type your food craving (e.g. Biryani under 40 AED)..."
                className="w-full py-3 pl-4 pr-12 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all"
              />
              <button
                type="submit"
                aria-label="Search food craving"
                className="absolute right-2 p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Top Food Verdict Picks Panel (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-950/60 rounded-3xl p-6 border border-slate-800/80 shadow-2xl backdrop-blur-sm min-h-[550px] flex flex-col justify-start">
          {handedOffTo && (
            <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold text-amber-300">🔗 Order Page Hand-Off Active</h4>
                <p className="text-[11px] text-slate-300">DaleelBites opened your deal page on Deliveroo / Talabat / Noon Food.</p>
              </div>
              <a
                href={handedOffTo}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shrink-0 transition-colors"
              >
                Open Order Page ↗
              </a>
            </div>
          )}

          {verdict ? (
            <VerdictCards verdict={verdict} />
          ) : isResearching ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-amber-500/30 rounded-2xl my-auto">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 mb-4 animate-spin">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-amber-400 mb-1">Searching Live UAE Deals...</h3>
              <p className="text-xs text-slate-300 max-w-md leading-relaxed">
                Extracting live menu prices & reviews across <strong>Noon Food, Talabat, Deliveroo, and Zomato</strong>...
              </p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-800/80 rounded-2xl my-auto">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-200 mb-1">Waiting for Your Food Craving</h3>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                Click the avatar on the left or tap a popular craving to talk to <strong className="text-amber-400">DaleelBites</strong>. Live deals across Noon Food, Talabat, and Deliveroo will appear right here!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/60 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between max-w-7xl mx-auto">
        <div>
          <strong className="text-slate-300">DaleelBites UAE</strong> • Live Food Deal Broker
        </div>
        <div className="flex items-center gap-4 mt-2 sm:mt-0">
          <span>ElevenLabs Voice</span>
          <span>•</span>
          <span>context.dev Live Scrape</span>
          <span>•</span>
          <span>Noon Food / Talabat / Deliveroo</span>
        </div>
      </footer>
    </main>
  );
}
