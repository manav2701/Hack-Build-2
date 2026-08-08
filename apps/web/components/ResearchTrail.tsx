'use client';

import React from 'react';
import { ShoppingBag, Star, MessageSquare, ShieldCheck, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { SourceResult } from '../lib/types';

interface ResearchTrailProps {
  sources: SourceResult[];
  isResearching: boolean;
}

export const ResearchTrail: React.FC<ResearchTrailProps> = ({ sources, isResearching }) => {
  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'marketplace':
        return <ShoppingBag className="w-5 h-5 text-amber-400" />;
      case 'reviews':
        return <Star className="w-5 h-5 text-blue-400" />;
      case 'community':
        return <MessageSquare className="w-5 h-5 text-emerald-400" />;
      case 'warranty':
        return <ShieldCheck className="w-5 h-5 text-purple-400" />;
      default:
        return <ShoppingBag className="w-5 h-5 text-amber-400" />;
    }
  };

  const allTypes = ['marketplace', 'reviews', 'community', 'warranty'] as const;

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-xl mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Live UAE Scrapes (context.dev Parallel Pipeline)
        </h3>
        {isResearching && (
          <span className="text-xs text-amber-400/90 font-mono animate-pulse">
            Scraping live Noon, Amazon.ae & Reddit...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {allTypes.map((type) => {
          const match = sources.find((s) => s.source === type);
          const isDone = !!match;
          const isFailed = match?.status === 'failed';

          return (
            <div
              key={type}
              className={`p-4 rounded-xl border transition-all duration-300 ${
                isDone
                  ? isFailed
                    ? 'bg-rose-950/20 border-rose-800/40'
                    : 'bg-slate-800/80 border-slate-700/60 shadow-lg'
                  : isResearching
                  ? 'bg-slate-800/30 border-amber-500/30 animate-pulse'
                  : 'bg-slate-900/40 border-slate-800/50 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getSourceIcon(type)}
                  <span className="text-xs font-bold text-slate-200 capitalize">{type}</span>
                </div>
                {isDone ? (
                  isFailed ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )
                ) : (
                  <Clock className="w-4 h-4 text-slate-500 animate-spin" />
                )}
              </div>

              {match && match.facts.length > 0 ? (
                <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                  "{match.facts[0]}"
                </p>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  {isResearching ? 'Gathering facts...' : 'Waiting for query...'}
                </p>
              )}

              {match?.latency_ms && (
                <span className="mt-2 block text-[10px] text-slate-400 font-mono">
                  {match.latency_ms}ms latency
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
