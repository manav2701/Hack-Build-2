'use client';

import React from 'react';
import { Award, ExternalLink, Shield, ThumbsUp, AlertCircle } from 'lucide-react';
import { Verdict, Recommendation } from '../lib/types';

interface VerdictCardsProps {
  verdict: Verdict | null;
}

export const VerdictCards: React.FC<VerdictCardsProps> = ({ verdict }) => {
  if (!verdict) return null;

  const renderCard = (item: Recommendation, type: 'pick' | 'runner_up') => {
    const isPick = type === 'pick';

    return (
      <div
        className={`relative flex flex-col justify-between rounded-2xl p-6 border transition-all duration-300 ${
          isPick
            ? 'bg-gradient-to-b from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/50 shadow-2xl shadow-amber-500/10'
            : 'bg-gradient-to-b from-emerald-950/20 via-slate-900 to-slate-900 border-emerald-500/30 shadow-xl'
        }`}
      >
        <div>
          {/* Badge */}
          <div className="flex items-center justify-between mb-4">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                isPick
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              <Award className="w-4 h-4" />
              {isPick ? 'Dalal Top Pick' : 'Runner-Up Pick'}
            </span>

            <span className="text-xs font-semibold text-slate-400 capitalize px-2.5 py-0.5 rounded border border-slate-700 bg-slate-800">
              {item.retailer.replace('_', '.')}
            </span>
          </div>

          {/* Title & Price */}
          <h3 className="text-lg font-bold text-slate-100 mb-2 leading-snug">{item.name}</h3>

          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-extrabold text-amber-400">{item.price_aed.toLocaleString()}</span>
            <span className="text-sm font-semibold text-amber-500/80">AED</span>
          </div>

          {/* Why Pick (3 Points) */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
              Why this choice
            </h4>
            <ul className="space-y-1.5">
              {item.why.map((reason, idx) => (
                <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Watch Outs (2 Points) */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              Watch-Outs
            </h4>
            <ul className="space-y-1.5">
              {item.watch_outs.map((out, idx) => (
                <li key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                  <span className="text-rose-400 font-bold">•</span>
                  <span>{out}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Warranty Note */}
          {item.warranty_note && (
            <div className="mb-6 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-[11px] text-slate-300">{item.warranty_note}</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm transition-all duration-200 ${
            isPick
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/25'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
        >
          <span>View on {item.retailer.replace('_', '.')}</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    );
  };

  return (
    <div className="w-full mt-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-100 mb-1">Your 2-Product Verdict</h2>
        <p className="text-xs text-slate-400 max-w-lg mx-auto">{verdict.price_note}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderCard(verdict.pick, 'pick')}
        {renderCard(verdict.runner_up, 'runner_up')}
      </div>
    </div>
  );
};
