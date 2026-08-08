'use client';

import React from 'react';

/**
 * The atmospheric depth behind the typography.
 *
 * Three large, heavily-blurred shapes in the warm accents, composited with
 * `mix-blend-mode: multiply` so they sink INTO the paper instead of glowing on top of
 * it — that difference is what keeps the page a printed poster rather than a dark-mode
 * dashboard wearing light colours.
 *
 * `fixed` + `-z-10` puts them behind every section at once, so scrolling reveals the
 * same field of colour rather than a seam at each block boundary.
 *
 * On opacity: the reference spec's 0.6-0.9 is written for accents *behind headline
 * type*. Applied to shapes this large it stops being atmosphere and becomes the
 * background — the first build tinted the entire viewport and the paper base
 * disappeared, taking the contrast of the black headline with it. These sit low enough
 * that #E4E2DD still reads as paper and the colour registers as a wash across it.
 */

interface Blob {
  size: string;
  color: string;
  opacity: number;
  position: React.CSSProperties;
  slow?: boolean;
  delay?: string;
}

const BLOBS: Blob[] = [
  {
    size: '52vw',
    color: 'var(--raw-red)',
    opacity: 0.22,
    position: { top: '-22vw', left: '-16vw' },
  },
  {
    size: '46vw',
    color: 'var(--raw-orange)',
    opacity: 0.26,
    position: { top: '38vh', right: '-20vw' },
    slow: true,
    delay: '-6s',
  },
  {
    size: '38vw',
    color: 'var(--raw-pink)',
    opacity: 0.18,
    position: { bottom: '-16vw', left: '22vw' },
    delay: '-11s',
  },
];

export const Blobs: React.FC = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    {BLOBS.map((blob, index) => (
      <div
        key={index}
        className={`blob ${blob.slow ? 'animate-blob-slow' : 'animate-blob'}`}
        style={{
          width: blob.size,
          height: blob.size,
          background: blob.color,
          opacity: blob.opacity,
          animationDelay: blob.delay,
          ...blob.position,
        }}
      />
    ))}
  </div>
);
