'use client';

import React, { useState } from 'react';
import { AnimatedAvatar } from '../components/AnimatedAvatar';
import { ResearchTrail } from '../components/ResearchTrail';
import { VerdictCards } from '../components/VerdictCards';
import { TranscriptRail } from '../components/TranscriptRail';
import { useDalalAgent } from '../hooks/useDalalAgent';
import { useResearchStream } from '../hooks/useResearchStream';
import { Sparkles, ShoppingBag, Radio, Cpu, ShieldCheck } from 'lucide-react';
import { Category } from '../lib/types';

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<Category>('laptop');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const {
    status,
    messages,
    startSession,
    stopSession,
    sendContextualUpdate,
    isSpeaking
  } = useDalalAgent((jobId) => setActiveJobId(jobId));

  const { sources, verdict, isResearching, setSources, setVerdict, setIsResearching } = useResearchStream(activeJobId);

  const lastAgentMessage = messages.filter((m) => m.sender === 'agent').slice(-1)[0]?.text;

  // Demo Trigger for instant testing without WebRTC connection
  const triggerDemoScrape = async (category: Category) => {
    setSelectedCategory(category);
    setIsResearching(true);
    setSources([]);
    setVerdict(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    try {
      const res = await fetch(`${apiUrl}/v1/tools/start_research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dalal-Key': 'dalal-secret-123' },
        body: JSON.stringify({
          session_id: 'browser-demo-session',
          category: category,
          budget_aed: category === 'laptop' ? 5000 : category === 'vacuum' ? 2800 : 1500,
          must_haves: ['Long battery life', 'Official UAE warranty'],
          usage: 'Daily use in Dubai Marina'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setActiveJobId(data.job_id);

        // Fallback polling if Supabase Realtime is not active locally
        setTimeout(async () => {
          const verdictRes = await fetch(`${apiUrl}/v1/tools/get_verdict?job_id=${data.job_id}`, {
            headers: { 'X-Dalal-Key': 'dalal-secret-123' }
          });
          if (verdictRes.ok) {
            const vData = await verdictRes.json();
            setVerdict(vData);
            setIsResearching(false);
            sendContextualUpdate(`RESEARCH_COMPLETE for job ${data.job_id}`);
          }
        }, 1200);
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

  return (
    <main className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col justify-between p-4 md:p-8 selection:bg-amber-500 selection:text-slate-950">
      {/* Background Decorative Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-amber-500/10 blur-[140px] pointer-events-none rounded-full" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[300px] bg-emerald-500/10 blur-[140px] pointer-events-none rounded-full" />

      <div className="max-w-5xl mx-auto w-full relative z-10">
        {/* Header Bar */}
        <header className="flex items-center justify-between py-4 border-b border-slate-800/80 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg shadow-amber-500/20">
              د
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
                Dalal <span className="text-amber-400 font-arabic text-lg font-normal">(دلال)</span>
              </h1>
              <p className="text-xs text-slate-400">Voice-First UAE Shopping Broker • Dubai AI Hub</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              ElevenLabs WebRTC
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              context.dev Parallel Pipeline
            </span>
          </div>
        </header>

        {/* Hero Section */}
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mb-2">
            No Search Bar. No SEO Spam. <span className="text-amber-400">Just Talk.</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Dalal interviews you on your budget, scrapes Noon, Amazon.ae & r/dubai live in the background, and gives you a 2-product verdict with UAE warranty coverage.
          </p>
        </div>

        {/* Voice Interface Orb */}
        <AnimatedAvatar status={status} isSpeaking={isSpeaking} onToggleConnect={toggleConnect} lastMessage={lastAgentMessage} />

        {/* Category Trigger Bar for Instant Demo Testing */}
        <div className="flex items-center justify-center gap-2 my-4">
          <span className="text-xs text-slate-400 mr-2 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Quick Demo Categories:
          </span>
          {(['laptop', 'vacuum', 'headphones'] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => triggerDemoScrape(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all duration-200 border ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Live Scrape Trail Cards */}
        <ResearchTrail sources={sources} isResearching={isResearching} />

        {/* Live Conversation Transcript */}
        <TranscriptRail messages={messages} />

        {/* Final 2-Product Verdict */}
        <VerdictCards verdict={verdict} />
      </div>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto w-full pt-8 mt-12 border-t border-slate-800/60 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
        <div>
          Built for <strong className="text-slate-300">Dubai AI Hub Builder Lab</strong> • Sat 8 Aug 2026
        </div>
        <div className="flex items-center gap-4">
          <span>ElevenLabs</span>
          <span>•</span>
          <span>context.dev</span>
          <span>•</span>
          <span>Devin</span>
          <span>•</span>
          <span>Supabase</span>
        </div>
      </footer>
    </main>
  );
}
