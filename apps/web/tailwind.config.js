/** @type {import('tailwindcss').Config} */

// "Raw Form" — Swiss-brutalist poster aesthetic on a warm paper base. Clash Display
// carries the drama, Satoshi does the reading, and the whole surface sits on #E4E2DD
// rather than in dark glass cards.
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        raw: {
          base: '#E4E2DD',      // paper
          panel: '#D9D6D0',     // a shade down, for banded sections
          ink: '#1E1E1E',       // primary text / the dark footer block
          mute: '#444444',      // prices, secondary copy
          red: '#DB4A2B',       // the accent — CTAs, rules, focus
          orange: '#F8A348',
          pink: '#FF89A9',      // hover shift on titles
        },
      },
      fontFamily: {
        // Loaded from Fontshare in app/layout.tsx; the stacks degrade to system faces
        // so a blocked font host costs polish, never legibility.
        display: ['"Clash Display"', 'Impact', 'Haettenschweiler', 'sans-serif'],
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        brutal: '-0.05em',
        wide2: '0.1em',
        wide3: '0.15em',
      },
      lineHeight: {
        poster: '0.75',
        tight9: '0.9',
      },
      transitionTimingFunction: {
        // The house curve. Everything that enters or moves uses it.
        raw: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'rise': 'rise 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
        'blob': 'blob 14s ease-in-out infinite',
        'blob-slow': 'blob 19s ease-in-out infinite',
        'ripple': 'ripple 2s infinite',
        'talk': 'talk 0.28s ease-in-out infinite alternate',
        'blink': 'blink 3.2s ease-in-out infinite',
        'bob-slow': 'bob-slow 2.2s ease-in-out infinite',
        'marquee': 'marquee 34s linear infinite',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Transform only. Animating opacity here would override the per-blob value set
        // inline, which is where each shape's weight is actually tuned.
        blob: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(4%, -6%, 0) scale(1.12)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        talk: {
          '0%': { transform: 'scaleY(0.4)' },
          '100%': { transform: 'scaleY(1)' },
        },
        blink: {
          '0%, 90%, 100%': { transform: 'scaleY(1)' },
          '95%': { transform: 'scaleY(0.15)' },
        },
        'bob-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}
