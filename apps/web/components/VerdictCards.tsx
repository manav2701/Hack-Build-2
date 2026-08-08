'use client';

import React from 'react';
import { ArrowUpRight, Star, MapPin, Truck, AlertTriangle, Quote } from 'lucide-react';
import { Verdict, Pick, DishRecommendation, Recommendation, isDish } from '../lib/types';
import { getFoodImage, isStockImage } from '../lib/foodImages';
import { Rise } from './Rise';

interface VerdictCardsProps {
  verdict: Verdict;
}

/** Rendered wherever a source gave us nothing. Never a zero, never a guess. */
const DASH = '—';

const APP_LABEL: Record<string, string> = {
  noon_food: 'Noon Food',
  talabat: 'Talabat',
  deliveroo: 'Deliveroo',
  eateasy: 'EatEasy',
  careem: 'Careem Food',
};

function appLabel(key: string): string {
  return APP_LABEL[key] || key || DASH;
}

function money(value: unknown): string {
  return typeof value === 'number' && value > 0 ? value.toLocaleString('en-AE') : DASH;
}

const VerdictCard: React.FC<{ item: Pick; rank: number }> = ({ item, rank }) => {
  const isPick = rank === 0;
  const food = isDish(item) ? (item as DishRecommendation) : null;
  const product = food ? null : (item as Recommendation);

  const place = food ? food.restaurant : product!.retailer;
  const channel = appLabel(food ? food.app : product!.retailer);
  const image = getFoodImage(item.name, place, food ?? { image_url: product?.image_url });
  const stock = isStockImage(image);

  // Every one of these is optional in the contract. An absent rating is an absent
  // rating — it renders as nothing at all rather than as a plausible-looking 4.7.
  const rating = food?.rating ?? null;
  const reviews = food?.review_count ?? null;
  const review = food?.top_review ?? null;
  const hasOrderLink = Boolean(item.url);

  return (
    <Rise
      as="article"
      delay={rank * 0.12}
      className="group grid grid-cols-1 gap-x-8 gap-y-5 border-t-2 border-raw-ink/15 pt-8 sm:grid-cols-12"
    >
      {/* Image — 3/4 aspect, no radius, subtle scale on hover. */}
      <div className="relative sm:col-span-5">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-raw-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={item.name || 'Dish'}
            loading={isPick ? 'eager' : 'lazy'}
            className="h-full w-full object-cover transition-transform duration-700 ease-raw group-hover:scale-105"
          />
          <span
            className={`absolute left-0 top-0 px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-wide3 ${
              isPick ? 'bg-raw-red text-white' : 'bg-raw-ink text-raw-base'
            }`}
          >
            {isPick ? 'The Pick' : 'Runner-up'}
          </span>
          {stock && (
            <span
              className="absolute bottom-0 right-0 bg-raw-ink/80 px-2 py-1 font-sans text-[9px] font-bold uppercase tracking-wide2 text-raw-base"
              title="The app published no photo for this dish, so this is illustrative artwork — not a picture of this restaurant's plate."
            >
              Illustrative
            </span>
          )}
        </div>
      </div>

      {/* Detail column */}
      <div className="flex flex-col sm:col-span-7">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="label-raw">
              {place || DASH} <span className="text-raw-red">/ {channel}</span>
            </p>
            <h3 className="mt-2 font-sans text-sm font-bold uppercase leading-snug tracking-wide3 text-raw-ink transition-colors duration-300 group-hover:text-raw-pink">
              {item.name || DASH}
            </h3>
          </div>

          <div className="shrink-0 text-right">
            <div className="font-display text-4xl leading-none tracking-brutal text-raw-ink">
              {money(item.price_aed)}
            </div>
            <span className="label-raw">AED</span>
          </div>
        </div>

        {/* Evidence row — only what a source actually returned. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-xs text-raw-mute">
          {rating !== null && (
            <span className="inline-flex items-center gap-1.5 font-bold text-raw-ink">
              <Star className="h-3.5 w-3.5 fill-raw-red text-raw-red" />
              {rating}
              {reviews !== null && (
                <span className="font-normal text-raw-mute">({reviews.toLocaleString('en-AE')} reviews)</span>
              )}
            </span>
          )}
          {food?.address && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-raw-red" />
              {food.address}
            </span>
          )}
          {food?.delivery_estimate && (
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-raw-red" />
              {food.delivery_estimate}
            </span>
          )}
        </div>

        {/* Why — the grounded reasons, verbatim from the synthesizer. */}
        {item.why?.length > 0 && (
          <ul className="mt-5 space-y-2">
            {item.why.map((reason, i) => (
              <li key={i} className="flex gap-3 font-sans text-sm leading-relaxed text-raw-ink/85">
                <span className="mt-2 h-px w-4 shrink-0 bg-raw-red" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}

        {/* A real reviewer's own words. Rendered only when one could be attributed. */}
        {review?.text && (
          <blockquote className="mt-5 border-l-2 border-raw-red/50 bg-raw-panel/60 py-3 pl-4 pr-3">
            <Quote className="mb-1.5 h-3.5 w-3.5 text-raw-red" />
            <p className="font-sans text-sm italic leading-relaxed text-raw-ink/80">“{review.text}”</p>
            <footer className="label-raw mt-2">
              {review.author || 'Anonymous'} · {review.source}
              {review.rating ? ` · ${review.rating}★` : ''}
            </footer>
          </blockquote>
        )}

        {item.watch_outs?.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {item.watch_outs.map((warning, i) => (
              <li key={i} className="flex items-start gap-2 font-sans text-xs text-raw-mute">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-raw-orange" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center gap-5 pt-1">
          {hasOrderLink ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-raw">
              <span>Order on {channel}</span>
              <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : (
            <span className="label-raw">No order link — nothing to hand off to</span>
          )}
        </div>
      </div>
    </Rise>
  );
};

export const VerdictCards: React.FC<VerdictCardsProps> = ({ verdict }) => {
  if (!verdict) return null;

  // The empty verdict the backend returns when nothing carried the dish: a pick with
  // no restaurant and no price. Showing it as a card would render a row of dashes, so
  // it gets its own honest panel instead.
  const nothingFound =
    !verdict.pick ||
    (!verdict.pick.price_aed && !verdict.pick.url && !(verdict.pick as DishRecommendation).restaurant);

  if (nothingFound) {
    return (
      <Rise className="border-t-2 border-raw-ink/15 pt-8">
        <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-poster tracking-brutal">
          NOTHING
          <br />
          <span className="text-raw-red">CARRIED IT.</span>
        </h2>
        <p className="mt-5 max-w-md font-sans text-sm leading-relaxed text-raw-mute">
          {verdict.pick?.watch_outs?.[0] ||
            'No live listing carried this dish in the area we searched.'}{' '}
          Try a different dish, or widen the area.
        </p>
      </Rise>
    );
  }

  return (
    <div className="w-full">
      <Rise as="header" className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-poster tracking-brutal">
            THE
            <br />
            <span className="text-raw-red">VERDICT.</span>
          </h2>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="label-raw">
              Confidence: <span className="text-raw-ink">{verdict.confidence}</span>
            </span>
            {verdict.sources_used?.length > 0 && (
              <span className="label-raw">Sources: {verdict.sources_used.join(' · ')}</span>
            )}
            {verdict.is_fixture && (
              <span className="bg-raw-orange px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-wide2 text-raw-ink">
                Sample data — not a live fetch
              </span>
            )}
          </div>
        </div>

        {verdict.price_note && (
          <p className="mt-5 max-w-2xl font-sans text-sm leading-relaxed text-raw-mute">
            {verdict.price_note}
          </p>
        )}
      </Rise>

      <div className="space-y-10">
        <VerdictCard item={verdict.pick} rank={0} />
        {verdict.runner_up && <VerdictCard item={verdict.runner_up} rank={1} />}
      </div>
    </div>
  );
};
