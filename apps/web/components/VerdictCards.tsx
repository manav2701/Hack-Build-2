'use client';

import React from 'react';
import { Award, ExternalLink, Shield, ThumbsUp, AlertCircle, MapPin, Star, Quote, Truck, FlaskConical } from 'lucide-react';
import { Verdict, Pick, DishRecommendation, Recommendation, isDish } from '../lib/types';

interface VerdictCardsProps {
  verdict: Verdict | null;
}

/** Missing values render as an em dash. We never invent a price, rating or address. */
const DASH = '—';

const APP_LABEL: Record<string, string> = {
  talabat: 'Talabat',
  deliveroo: 'Deliveroo',
  eateasy: 'EatEasy',
};

export const VerdictCards: React.FC<VerdictCardsProps> = ({ verdict }) => {
  if (!verdict) return null;

  const renderDish = (item: DishRecommendation, isPick: boolean) => {
    const appName = APP_LABEL[item.app] || item.app || DASH;
    const review = item.top_review;

    return (
      <div
        className={`relative flex flex-col justify-between rounded-2xl p-6 border transition-all duration-300 ${
          isPick
            ? 'bg-gradient-to-b from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/50 shadow-2xl shadow-amber-500/10'
            : 'bg-gradient-to-b from-emerald-950/20 via-slate-900 to-slate-900 border-emerald-500/30 shadow-xl'
        }`}
      >
        <div>
          <div className="flex items-center justify-between mb-4">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                isPick
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              <Award className="w-4 h-4" />
              {isPick ? "Dalal's Pick" : 'Runner-Up'}
            </span>

            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 px-2.5 py-0.5 rounded border border-slate-700 bg-slate-800">
              {item.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.logo_url} alt="" className="w-3.5 h-3.5 rounded-sm object-contain"
                     onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              {appName}
            </span>
          </div>

          {/* Restaurant + address — where the food actually comes from */}
          <h3 className="text-lg font-bold text-slate-100 leading-snug">{item.restaurant || DASH}</h3>
          <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 mb-3">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            <span>{item.address || DASH}</span>
          </p>

          {/* The menu item */}
          <p className="text-sm text-slate-200 font-medium mb-1">{item.name || DASH}</p>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-extrabold text-amber-400">
              {typeof item.price_aed === 'number' && item.price_aed > 0
                ? item.price_aed.toLocaleString()
                : DASH}
            </span>
            <span className="text-sm font-semibold text-amber-500/80">AED</span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-3 mb-4 text-xs">
            <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {item.rating ?? DASH}
            </span>
            <span className="text-slate-500">
              {item.review_count ? `${item.review_count.toLocaleString()} reviews` : 'review count not published'}
            </span>
          </div>

          {item.screenshot_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.screenshot_url} alt={`${item.restaurant} menu`}
                 className="w-full h-28 object-cover rounded-lg border border-slate-700/60 mb-4"
                 onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          )}

          {/* TOP REVIEW — a real customer's own words, from Zomato/TripAdvisor */}
          {review && (
            <div className="mb-4 p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                  <Quote className="w-3.5 h-3.5 text-sky-400" />
                  {review.author || 'Verified reviewer'}
                </span>
                <span className="inline-flex items-center gap-2 text-[10px] text-slate-500">
                  {review.rating != null && (
                    <span className="inline-flex items-center gap-0.5 text-amber-300">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {review.rating}
                    </span>
                  )}
                  <span className="capitalize">{review.source}</span>
                </span>
              </div>
              {/* Real reviews run long (1,000+ chars is common on TripAdvisor). Clamp
                  visually rather than truncating the payload, and link out for the rest. */}
              <p
                className="text-[11px] leading-relaxed text-slate-300 italic overflow-hidden"
                style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}
              >
                “{review.text}”
              </p>
              {review.url && (
                <a href={review.url} target="_blank" rel="noopener noreferrer"
                   className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300">
                  read on {review.source} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          )}

          {item.why.length > 0 && (
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
          )}

          {item.watch_outs.length > 0 && (
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
          )}

          {/* Always labelled as the app's estimate, never a checkout total */}
          {item.delivery_estimate && (
            <div className="mb-6 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-[11px] text-slate-300">{item.delivery_estimate}</span>
            </div>
          )}
        </div>

        <a
          href={item.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm transition-all duration-200 ${
            isPick
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/25'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          } ${item.url ? '' : 'pointer-events-none opacity-40'}`}
        >
          <span>Order on {appName}</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    );
  };

  const renderProduct = (item: Recommendation, isPick: boolean) => (
    <div className={`relative flex flex-col justify-between rounded-2xl p-6 border ${
      isPick ? 'bg-slate-900 border-amber-500/50' : 'bg-slate-900 border-emerald-500/30'
    }`}>
      <div>
        <h3 className="text-lg font-bold text-slate-100 mb-2">{item.name}</h3>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-extrabold text-amber-400">{item.price_aed.toLocaleString()}</span>
          <span className="text-sm font-semibold text-amber-500/80">AED</span>
        </div>
        <ul className="space-y-1.5 mb-4">
          {item.why.map((r, i) => (
            <li key={i} className="text-xs text-slate-300">• {r}</li>
          ))}
        </ul>
        {item.warranty_note && (
          <div className="mb-6 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-[11px] text-slate-300">{item.warranty_note}</span>
          </div>
        )}
      </div>
      <a href={item.url} target="_blank" rel="noopener noreferrer"
         className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-amber-500 text-slate-950">
        <span>View on {item.retailer.replace('_', '.')}</span>
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );

  const renderCard = (item: Pick, isPick: boolean) =>
    isDish(item) ? renderDish(item, isPick) : renderProduct(item, isPick);

  return (
    <div className="w-full mt-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-100 mb-1">Your verdict</h2>
        <p className="text-xs text-slate-400 max-w-lg mx-auto">{verdict.price_note}</p>

        {/* Honesty rule: fixture data must never look live. */}
        {verdict.is_fixture && (
          <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/40">
            <FlaskConical className="w-3.5 h-3.5" />
            Sample data — not a live fetch
          </span>
        )}
      </div>

      {/* runner_up is genuinely null when only one place carried the dish. */}
      <div className={`grid grid-cols-1 gap-6 ${verdict.runner_up ? 'md:grid-cols-2' : 'max-w-md mx-auto'}`}>
        {renderCard(verdict.pick, true)}
        {verdict.runner_up && renderCard(verdict.runner_up, false)}
      </div>
    </div>
  );
};
