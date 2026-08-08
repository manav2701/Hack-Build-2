'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

interface AnimatedAvatarProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'speaking';
  isSpeaking: boolean;
  onToggleConnect: () => void;
  lastMessage?: string;
}

const MOUTHS = {
  rest: 'M 42 84 Q 60 92 78 84',
  closed: 'M 45 82 Q 60 82 75 82',
  teeth: 'M 42 84 Q 60 86 78 84',
  narrow: 'M 47 80 Q 60 86 73 80',
  round: 'M 45 78 Q 60 90 75 78',
  open: 'M 40 80 Q 60 95 80 80',
  wide: 'M 38 82 Q 60 88 82 82',
  medium: 'M 42 80 Q 60 90 78 80',
};

function visemeForWord(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return MOUTHS.closed;

  const first = w.charAt(0);
  const firstTwo = w.slice(0, 2);

  // Plosives / closed lips
  if (['m', 'b', 'p'].includes(first)) return MOUTHS.closed;
  // F / V (teeth on lip)
  if (['f', 'v'].includes(first)) return MOUTHS.teeth;
  // Th / Sh / Ch / J
  if (['th', 'sh', 'ch', 'zh'].includes(firstTwo) || first === 'j') return MOUTHS.narrow;
  // R / L / W (rounded)
  if (['r', 'l', 'w'].includes(first)) return MOUTHS.round;
  // Open vowels
  if (['a', 'o', 'u'].includes(first)) return MOUTHS.open;
  // Wide vowels
  if (['e', 'i', 'y'].includes(first)) return MOUTHS.wide;
  // Long words / neutral
  if (w.length > 6) return MOUTHS.medium;

  return MOUTHS.medium;
}

export const AnimatedAvatar: React.FC<AnimatedAvatarProps> = ({
  status,
  isSpeaking,
  onToggleConnect,
  lastMessage,
}) => {
  const isConnected = status === 'connected' || status === 'speaking';
  const [mouthIndex, setMouthIndex] = useState(0);
  const wasSpeaking = useRef(false);

  const words = useMemo(
    () => (lastMessage || '').split(/\s+/).filter(Boolean),
    [lastMessage]
  );
  const wordsRef = useRef(words);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  useEffect(() => {
    if (!isSpeaking) {
      wasSpeaking.current = false;
      return;
    }

    // Reset the word pointer only when speech starts, not on every transcript update
    if (!wasSpeaking.current) {
      setMouthIndex(0);
      wasSpeaking.current = true;
    }

    const interval = setInterval(() => {
      setMouthIndex((prev) => {
        const current = wordsRef.current;
        if (current.length === 0) return 0;
        return (prev + 1) % current.length;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isSpeaking]);

  const mouthPath = useMemo(() => {
    if (!isSpeaking) return MOUTHS.rest;
    if (words.length === 0) return MOUTHS.open;
    return visemeForWord(words[mouthIndex % words.length]);
  }, [isSpeaking, words, mouthIndex]);

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <button
        onClick={onToggleConnect}
        className="relative focus:outline-none"
        aria-label="Toggle Dalal voice session"
      >
        <svg
          width="160"
          height="160"
          viewBox="0 0 120 120"
          className={clsx(
            'transition-transform duration-300',
            isConnected ? 'drop-shadow-[0_0_18px_rgba(245,158,11,0.35)]' : 'opacity-80'
          )}
        >
          <defs>
            <radialGradient id="dalalFace" cx="50%" cy="50%" r="50%" fx="25%" fy="25%">
              <stop offset="0%" stopColor="#FFEDA8" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </radialGradient>
            <radialGradient id="dalalShade" cx="50%" cy="50%" r="50%" fx="50%" fy="80%">
              <stop offset="70%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(120,53,15,0.45)" />
            </radialGradient>
            <linearGradient id="gloss" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity="0.35" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
            </filter>
          </defs>

          {/* Head */}
          <ellipse
            cx="62"
            cy="105"
            rx="38"
            ry="7"
            fill="rgba(0,0,0,0.25)"
            filter="url(#blur)"
            className="pointer-events-none"
          />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="url(#dalalFace)"
            strokeWidth={isConnected ? 2.5 : 1}
            stroke={isConnected ? '#10B981' : '#475569'}
            className={clsx('transition-all duration-300', isSpeaking && 'animate-bob-slow')}
          />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="url(#dalalShade)"
            className="pointer-events-none"
          />
          <ellipse
            cx="42"
            cy="36"
            rx="16"
            ry="10"
            fill="url(#gloss)"
            transform="rotate(-20 42 36)"
            className="pointer-events-none"
          />

          {/* Eyes */}
          <g
            className={clsx(!isSpeaking && 'animate-blink')}
            style={{ transformOrigin: '60px 60px' }}
          >
            <ellipse
              cx="42"
              cy="48"
              rx="6"
              ry={isSpeaking ? 6.5 : 5}
              fill="#1F2937"
              style={{ transformOrigin: '42px 48px' }}
            />
            <circle
              cx="44"
              cy="45"
              r="2"
              fill="#E5E7EB"
              opacity="0.9"
            />
            <ellipse
              cx="78"
              cy="48"
              rx="6"
              ry={isSpeaking ? 6.5 : 5}
              fill="#1F2937"
              style={{ transformOrigin: '78px 48px' }}
            />
            <circle
              cx="80"
              cy="45"
              r="2"
              fill="#E5E7EB"
              opacity="0.9"
            />
          </g>

          {/* Mouth */}
          <path
            d={mouthPath}
            stroke="#1F2937"
            strokeWidth="4"
            strokeLinecap="round"
            fill="transparent"
            style={{ transformOrigin: '60px 82px' }}
            className={clsx('transition-transform duration-75', isSpeaking && 'animate-talk')}
          />

          {status === 'connecting' && (
            <text x="60" y="112" textAnchor="middle" fill="#F59E0B" fontSize="8" fontWeight="bold">
              Connecting…
            </text>
          )}
        </svg>
      </button>

      <div className="mt-4 text-center">
        <span
          className={clsx(
            'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border',
            isConnected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          )}
        >
          <span
            className={clsx('w-2 h-2 rounded-full', isConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-500')}
          />
          {status === 'disconnected' && 'Click Avatar to Talk to Dalal'}
          {status === 'connecting' && 'Connecting WebRTC Session…'}
          {status === 'connected' && 'Dalal Listening…'}
          {status === 'speaking' && 'Dalal Speaking…'}
        </span>
      </div>
    </div>
  );
};
