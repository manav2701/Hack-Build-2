'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, authHeaders } from '../lib/api';
import { Verdict } from '../lib/types';

const POLL_MS = 1500;

export type StreamPhase = 'idle' | 'researching' | 'done' | 'error';

/**
 * Tracks one research job to completion.
 *
 * HTTP polling is the ONLY path. Supabase Realtime used to sit alongside it, but the
 * deployed project is configured with placeholder credentials, so every page load
 * opened a websocket that could only fail — a permanent source of console noise and
 * one badly-timed throw away from taking the effect down with it. Polling a job that
 * finishes in ~30s costs about twenty requests; it is the honest tool for the job.
 */
export function useResearchStream(jobId: string | null) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [phase, setPhase] = useState<StreamPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const settled = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Re-attaching to the job we are already showing must not blank the panel.
    if (settled.current === jobId) return;

    setPhase('researching');
    setError(null);
    setVerdict(null);

    let cancelled = false;
    let consecutiveFailures = 0;

    const poll = async () => {
      if (cancelled || settled.current === jobId) return;
      try {
        const res = await fetch(
          `${API_BASE}/v1/tools/get_verdict?job_id=${encodeURIComponent(jobId)}`,
          { headers: authHeaders() }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        consecutiveFailures = 0;

        // `{status:"running"}` is the normal answer on every poll before the pipeline
        // finishes. Only a body carrying a real pick is a verdict.
        if (data?.status === 'done' || data?.pick) {
          settled.current = jobId;
          setVerdict(data as Verdict);
          setPhase('done');
        }
      } catch (err) {
        consecutiveFailures += 1;
        // One blip while the backend is busy is expected; a sustained outage is not,
        // and silently spinning forever is exactly the failure the user reported.
        if (consecutiveFailures >= 6 && !cancelled) {
          setPhase('error');
          setError('Cannot reach the DaleelBites backend right now.');
        }
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId]);

  const reset = useCallback(() => {
    settled.current = null;
    setVerdict(null);
    setError(null);
    setPhase('idle');
  }, []);

  return {
    verdict,
    phase,
    error,
    isResearching: phase === 'researching',
    setVerdict,
    reset,
  };
}

/**
 * Discovers the job the VOICE AGENT started.
 *
 * The agent calls `start_research` from ElevenLabs' cloud, so the job_id in that
 * response never reaches this page — without this, speaking a craving leaves the panel
 * empty while the research completes perfectly well server-side. Polling `latest_job`
 * attaches the browser to whatever was just kicked off; when signed in, the backend
 * scopes that to the caller's own jobs.
 */
export function useAgentJobDiscovery(enabled: boolean, onFound: (jobId: string) => void) {
  const seen = useRef<string | null>(null);
  const callback = useRef(onFound);

  // Kept in a ref so a caller passing an inline arrow does not restart the poll loop
  // on every render.
  useEffect(() => {
    callback.current = onFound;
  }, [onFound]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${API_BASE}/v1/tools/latest_job`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.job_id && data.job_id !== seen.current) {
          seen.current = data.job_id;
          callback.current(data.job_id);
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
  }, [enabled]);
}
