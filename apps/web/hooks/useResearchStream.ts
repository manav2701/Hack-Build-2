'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { SourceResult, Verdict } from '../lib/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://hack-build-2-production.up.railway.app';
const KEY = process.env.NEXT_PUBLIC_DALAL_KEY || 'dalal-secret-123';
const POLL_MS = 2000;

/**
 * Tracks one research job to completion.
 *
 * HTTP polling is the PRIMARY path, not a fallback. Supabase Realtime only fires when a
 * real Supabase project is configured; locally the backend uses its in-memory store, so
 * a realtime-only hook left the UI spinning forever while the research actually finished
 * server-side. Realtime is kept purely as a nice-to-have for the live source trail.
 */
export function useResearchStream(jobId: string | null) {
  const [sources, setSources] = useState<SourceResult[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [isResearching, setIsResearching] = useState<boolean>(false);
  const settled = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setIsResearching(true);
    setSources([]);
    setVerdict(null);
    settled.current = null;

    let cancelled = false;

    const poll = async () => {
      if (cancelled || settled.current === jobId) return;
      try {
        const res = await fetch(`${API}/v1/tools/get_verdict?job_id=${encodeURIComponent(jobId)}`, {
          headers: { 'X-Dalal-Key': KEY },
        });
        if (!res.ok) return;
        const data = await res.json();
        // Only render a finished verdict — a {status:"running"} body must not be
        // treated as a (malformed) verdict.
        if (data?.status === 'done' || data?.pick) {
          settled.current = jobId;
          setVerdict(data as Verdict);
          setIsResearching(false);
        }
      } catch {
        // Transient network blips are expected while the backend is busy; keep polling.
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'source_results', filter: `job_id=eq.${jobId}` },
        (payload) => {
          const newSource = payload.new.payload as SourceResult;
          setSources((prev) => [...prev.filter((s) => s.source !== newSource.source), newSource]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { sources, verdict, isResearching, setSources, setVerdict, setIsResearching };
}

/**
 * Discovers the job the VOICE AGENT started.
 *
 * The agent calls start_research from ElevenLabs' cloud, so the job_id in that response
 * never reaches this page — previously nothing set it except the demo buttons, which is
 * why speaking a craving left the UI searching forever. Polling the backend for the
 * newest job attaches the browser to whatever the agent just kicked off.
 */
export function useAgentJobDiscovery(enabled: boolean = true, onFound: (jobId: string) => void) {
  const seen = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${API}/v1/tools/latest_job`, { headers: { 'X-Dalal-Key': KEY } });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.job_id && data.job_id !== seen.current) {
          seen.current = data.job_id;
          onFound(data.job_id);
        }
      } catch {
        /* backend not up yet — keep trying */
      }
    };

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [onFound]);
}
