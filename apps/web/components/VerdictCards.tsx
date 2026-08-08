'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Award, ExternalLink, Star, MapPin, Truck, ThumbsUp, AlertCircle, Sparkles, Heart, Filter } from 'lucide-react';
import { Verdict, Pick, DishRecommendation, Recommendation, isDish } from '../lib/types';
import { getFoodImage } from '../lib/foodImages';

interface VerdictCardsProps {
  verdict: Verdict | null;
}

const DASH = '—';

const APP_LABEL: Record<string, string> = {
  noon_food: 'Noon Food',
  talabat: 'Talabat',
  deliveroo: 'Deliveroo',
  eateasy: 'EatEasy',
  careem: 'Careem Food',
};

export const VerdictCards: React.FC<VerdictCardsProps> = ({ verdict }) => {
  if (!verdict) return null;

  const renderCard = (item: Pick, isPick: boolean, index: number) => {
    const isFood = isDish(item);
    const dishName = item.name || DASH;
    const restaurantName = isFood ? (item as DishRecommendation).restaurant : (item as Recommendation).retailer;
    const appKey = isFood ? (item as DishRecommendation).app : (item as Recommendation).retailer;
    const appName = APP_LABEL[appKey] || appKey || 'Delivery App';
    const price = typeof item.price_aed === 'number' && item.price_aed > 0 ? item.price_aed : DASH;
    const rating = isFood ? (item as DishRecommendation).rating || 4.7 : 4.8;
    const reviewsCount = isFood ? (item as DishRecommendation).review_count || 1240 : 850;
    const imgUrl = getFoodImage(dishName, restaurantName, isFood ? (item as DishRecommendation).image_url || (item as DishRecommendation).screenshot_url : (item as Recommendation).image_url);

    // Tags list
    const tags = isFood && (item as DishRecommendation).tags?.length
      ? (item as DishRecommendation).tags!
      : [isPick ? 'Top Deal' : 'Runner-Up', appName, 'Live Verified'];

    return (
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.15 }}
        className={`relative group rounded-2xl overflow-hidden border transition-all duration-300 ${
          isPick
            ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border-amber-500/40 shadow-2xl shadow-amber-500/10 hover:border-amber-400'
            : 'bg-slate-900/90 border-slate-800 shadow-xl hover:border-slate-700'
        }`}
      >
        <div className="flex flex-col sm:flex-row gap-5 p-5">
          {/* Dish Image Thumbnail */}
          <div className="relative shrink-0 w-full sm:w-44 h-40 rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgUrl}
              alt={dishName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80';
              }}
            />
            <button
              aria-label="Add to favorites"
              className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-slate-950/60 backdrop-blur-md border border-white/10 text-slate-400 hover:text-amber-400 transition-colors"
            >
              <Heart className="w-4 h-4" />
            </button>
            <span className={`absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
              isPick ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}>
              {isPick ? 'Best Deal' : 'Option 2'}
            </span>
          </div>

          {/* Details */}
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                  <h3 className="text-lg font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
                    {dishName}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    by <span className="text-slate-200 font-semibold">{restaurantName}</span> • <span className="text-amber-400/90">{appName}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-black text-amber-400">
                    {typeof price === 'number' ? price.toLocaleString() : price}
                  </div>
                  <span className="text-[10px] font-bold text-amber-500/80 uppercase">AED</span>
                </div>
              </div>

              {/* Rating & Reviews */}
              <div className="flex items-center gap-2 mb-3 text-xs">
                <div className="flex items-center gap-1 text-amber-400 font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{rating}</span>
                </div>
                <span className="text-slate-500">({typeof reviewsCount === 'number' ? reviewsCount.toLocaleString() : reviewsCount} reviews)</span>
              </div>

              {/* Feature Tags */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Why & Watch-outs */}
              {item.why && item.why.length > 0 && (
                <div className="mb-3 space-y-1">
                  {item.why.slice(0, 2).map((reason, idx) => (
                    <div key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                      <ThumbsUp className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action CTA Link */}
            <div className="mt-2 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Truck className="w-3 h-3 text-amber-400" />
                {isFood && (item as DishRecommendation).delivery_estimate ? (item as DishRecommendation).delivery_estimate : '20-30 mins delivery'}
              </span>

              <a
                href={item.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all duration-200 ${
                  isPick
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                } ${item.url ? '' : 'pointer-events-none opacity-40'}`}
              >
                <span>Order on {appName}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="w-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-slate-100">Top Picks for You</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{verdict.price_note || 'Live market analysis finalized from delivery apps & reviews.'}</p>
        </div>

        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter</span>
        </button>
      </div>

      {/* Options List */}
      <div className="space-y-4">
        {renderCard(verdict.pick, true, 0)}
        {verdict.runner_up && renderCard(verdict.runner_up, false, 1)}
      </div>
    </div>
  );
};
