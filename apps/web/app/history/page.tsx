'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';

import { Blobs } from '../../components/Blobs';
import { AccountBar } from '../../components/AccountBar';
import { SiteFooter } from '../../components/SiteFooter';
import { useAuth } from '../../components/AuthProvider';
import { Rise } from '../../components/Rise';
import { api } from '../../lib/api';
import { HistoryEntry, DishRecommendation, isDish } from '../../lib/types';
import { getFoodThumb } from '../../lib/foodImages';

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wait for the session restore to finish before deciding this is an anonymous visit,
  // otherwise a signed-in user gets bounced to /login on every hard refresh.
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api<{ jobs: HistoryEntry[] }>('/v1/auth/history');
        if (!cancelled) setEntries(data.jobs || []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load your cravings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <main className="relative min-h-screen">
      <Blobs />
      <AccountBar />

      <section className="mx-auto max-w-5xl px-6 pb-10 pt-12 sm:px-10">
        <Rise
          as="h1"
          className="font-display uppercase leading-poster tracking-brutal"
          style={{ fontSize: 'clamp(2.8rem, 10vw, 8rem)' }}
        >
          My
          <br />
          <span className="pl-[6vw] text-raw-red">cravings.</span>
        </Rise>

        <div className="mt-14">
          {loading || authLoading ? (
            <p className="label-raw">Loading…</p>
          ) : error ? (
            <p className="border-l-2 border-raw-red bg-raw-red/10 py-2 pl-3 font-sans text-sm">{error}</p>
          ) : entries.length === 0 ? (
            <div className="border-t-2 border-raw-ink/15 pt-8">
              <p className="font-sans text-sm leading-relaxed text-raw-mute">
                Nothing saved yet. Every craving you research while signed in lands here with its
                verdict.
              </p>
              <Link href="/" className="link-raw mt-5">
                Start one <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <ul className="space-y-0">
              {entries.map((entry, index) => {
                const pick = entry.verdict?.pick;
                const food = pick && isDish(pick) ? (pick as DishRecommendation) : null;

                return (
                  <Rise
                    as="li"
                    key={entry.job_id}
                    delay={Math.min(index, 6) * 0.06}
                    className="group grid grid-cols-[64px_1fr_auto] items-center gap-5 border-t-2 border-raw-ink/15 py-5"
                  >
                    <div className="h-16 w-16 overflow-hidden bg-raw-panel">
                      {pick && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getFoodThumb(pick.name, food?.restaurant || '', food)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 ease-raw group-hover:scale-110"
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="label-raw">
                        {new Date((entry.created_at || 0) * 1000).toLocaleString('en-AE', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        {entry.area ? ` · ${entry.area}` : ''}
                      </p>
                      <p className="mt-1.5 truncate font-sans text-sm font-bold uppercase tracking-wide3 transition-colors group-hover:text-raw-pink">
                        {entry.dish || pick?.name || 'Craving'}
                      </p>
                      <p className="mt-1 truncate font-sans text-xs text-raw-mute">
                        {entry.verdict
                          ? `${food?.restaurant || pick?.name} · ${entry.verdict.confidence} confidence`
                          : 'Still researching…'}
                      </p>
                    </div>

                    <div className="text-right">
                      {pick?.price_aed ? (
                        <div className="font-display text-2xl leading-none tracking-brutal">
                          {pick.price_aed.toLocaleString('en-AE')}
                          <span className="label-raw ml-1">AED</span>
                        </div>
                      ) : (
                        <span className="label-raw">—</span>
                      )}
                      {pick?.url && (
                        <a
                          href={pick.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-raw mt-2"
                        >
                          Order <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </Rise>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
