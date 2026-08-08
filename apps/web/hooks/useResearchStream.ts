'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { SourceResult, Verdict } from '../lib/types';

export function useResearchStream(jobId: string | null) {
  const [sources, setSources] = useState<SourceResult[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [isResearching, setIsResearching] = useState<boolean>(false);

  useEffect(() => {
    if (!jobId) return;

    setIsResearching(true);
    setSources([]);
    setVerdict(null);

    // Subscribe to realtime updates on source_results
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
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'verdicts', filter: `job_id=eq.${jobId}` },
        (payload) => {
          const newVerdict = payload.new.payload as Verdict;
          setVerdict(newVerdict);
          setIsResearching(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { sources, verdict, isResearching, setSources, setVerdict, setIsResearching };
}
