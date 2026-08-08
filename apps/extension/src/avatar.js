/**
 * The Dalal face — a vanilla port of apps/web/components/AnimatedAvatar.tsx.
 *
 * The mouth is driven by a crude viseme mapping: while the agent speaks we step
 * through the words of its latest message and pick a mouth shape from each word's
 * first letter. It is not real phoneme timing and does not pretend to be — but a face
 * whose mouth moves *with the shape of what is being said* reads as alive, where a
 * generic open/close loop reads as a spinner with eyes.
 *
 * Ported to DOM/SVG rather than shared with the web app because the extension has no
 * React: bundling a renderer for one 120×120 graphic is not a trade worth making.
 */

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

const WORD_MS = 200;

function visemeForWord(word) {
  const w = (word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return MOUTHS.closed;

  const first = w.charAt(0);
  const firstTwo = w.slice(0, 2);

  if (['m', 'b', 'p'].includes(first)) return MOUTHS.closed;       // lips together
  if (['f', 'v'].includes(first)) return MOUTHS.teeth;             // teeth on lip
  if (['th', 'sh', 'ch', 'zh'].includes(firstTwo) || first === 'j') return MOUTHS.narrow;
  if (['r', 'l', 'w'].includes(first)) return MOUTHS.round;
  if (['a', 'o', 'u'].includes(first)) return MOUTHS.open;
  if (['e', 'i', 'y'].includes(first)) return MOUTHS.wide;
  return MOUTHS.medium;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const MARKUP = `
<svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">
  <defs>
    <radialGradient id="dbFace" cx="50%" cy="50%" r="50%" fx="25%" fy="25%">
      <stop offset="0%" stop-color="#FFD9A0"/>
      <stop offset="50%" stop-color="#F8A348"/>
      <stop offset="100%" stop-color="#DB4A2B"/>
    </radialGradient>
    <radialGradient id="dbShade" cx="50%" cy="50%" r="50%" fx="50%" fy="80%">
      <stop offset="70%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(30,30,30,0.35)"/>
    </radialGradient>
    <linearGradient id="dbGloss" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="white" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <filter id="dbBlur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2"/>
    </filter>
  </defs>

  <ellipse cx="62" cy="105" rx="38" ry="7" fill="rgba(30,30,30,0.18)" filter="url(#dbBlur)"/>
  <circle class="db-head" cx="60" cy="60" r="50" fill="url(#dbFace)" stroke="rgba(30,30,30,0.25)" stroke-width="2"/>
  <circle cx="60" cy="60" r="50" fill="url(#dbShade)"/>
  <ellipse cx="42" cy="36" rx="16" ry="10" fill="url(#dbGloss)" transform="rotate(-20 42 36)"/>

  <g class="db-eyes">
    <ellipse class="db-eye" cx="42" cy="48" rx="6" ry="5" fill="#1E1E1E"/>
    <circle cx="44" cy="45" r="2" fill="#E4E2DD" opacity="0.9"/>
    <ellipse class="db-eye" cx="78" cy="48" rx="6" ry="5" fill="#1E1E1E"/>
    <circle cx="80" cy="45" r="2" fill="#E4E2DD" opacity="0.9"/>
  </g>

  <path class="db-mouth" d="${MOUTHS.rest}" stroke="#1E1E1E" stroke-width="4"
        stroke-linecap="round" fill="transparent"/>
</svg>`;

export function createAvatar(onToggle) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'avatar';
  button.innerHTML = MARKUP;          // static markup authored here, never user data
  button.addEventListener('click', onToggle);

  const head = button.querySelector('.db-head');
  const eyes = button.querySelectorAll('.db-eye');
  const mouth = button.querySelector('.db-mouth');

  let words = [];
  let index = 0;
  let timer = null;
  let speaking = false;

  function stopMouth() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    node: button,

    /** Connected state gets a hard ink ring — the brutalist grammar has no glow. */
    setConnected(connected) {
      head.setAttribute('stroke', connected ? '#1E1E1E' : 'rgba(30,30,30,0.25)');
      head.setAttribute('stroke-width', connected ? '3' : '2');
      button.classList.toggle('is-live', connected);
    },

    /** The agent's latest line. Feeding the mouth new words mid-sentence is fine. */
    setMessage(text) {
      words = String(text || '').split(/\s+/).filter(Boolean);
    },

    setSpeaking(isSpeaking) {
      if (isSpeaking === speaking) return;
      speaking = isSpeaking;
      button.classList.toggle('is-speaking', isSpeaking);

      if (!isSpeaking) {
        stopMouth();
        mouth.setAttribute('d', MOUTHS.rest);
        eyes.forEach((eye) => eye.setAttribute('ry', '5'));
        return;
      }

      // Reset the word pointer only when speech STARTS, so a transcript update
      // mid-sentence does not snap the mouth back to the first word.
      index = 0;
      eyes.forEach((eye) => eye.setAttribute('ry', '6.5'));
      stopMouth();
      timer = setInterval(() => {
        if (!words.length) {
          mouth.setAttribute('d', MOUTHS.open);
          return;
        }
        mouth.setAttribute('d', visemeForWord(words[index % words.length]));
        index += 1;
      }, WORD_MS);
    },

    destroy() {
      stopMouth();
    },
  };
}
