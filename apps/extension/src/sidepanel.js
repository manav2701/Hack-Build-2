/**
 * Side-panel controller — the voice broker, living beside whatever you are browsing.
 *
 * Why the side panel and not the popup: an extension popup closes the instant it loses
 * focus, and the microphone permission prompt itself takes focus. So a popup cannot
 * reliably *obtain* mic access, and even once granted, clicking anywhere would tear
 * down the WebRTC session mid-sentence. `chrome.sidePanel` persists across clicks and
 * navigation, which is what a conversation needs.
 *
 * Uses `@elevenlabs/client` (framework-agnostic) rather than `@elevenlabs/react`, so
 * the bundle carries no renderer for what is a handful of DOM nodes.
 *
 * As everywhere in this extension, verdict text is scraped restaurant/review content
 * that has passed through an LLM. It is written with `textContent`, never `innerHTML`.
 */

import { Conversation } from '@elevenlabs/client';

import { AGENT_ID, STORAGE, WEB_APP, isSafeOrderUrl } from './config.js';
import { api, clearSession, login, me, signup } from './api.js';
import { foodImage, isStock } from './images.js';
import { createAvatar } from './avatar.js';

const POPULAR = ['Sichuan wontons', 'Biryani', 'Shawarma', 'Smash burger'];
const POLL_MS = 2000;
const DASH = '—';

const APP_LABEL = {
  talabat: 'Talabat',
  deliveroo: 'Deliveroo',
  noon_food: 'Noon Food',
  eateasy: 'EatEasy',
  careem: 'Careem Food',
};

const el = (id) => document.getElementById(id);

let conversation = null;
let connecting = false;
let pollTimer = null;
let currentUser = null;
let authMode = 'login';
let avatar = null;

// ---------------------------------------------------------------- dom helpers

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function setError(node, message) {
  node.textContent = message || '';
  node.hidden = !message;
}

function money(value) {
  return typeof value === 'number' && value > 0 ? value.toLocaleString('en-AE') : DASH;
}

// ---------------------------------------------------------------- transcript

function addMessage(sender, text) {
  const box = el('transcript');
  box.hidden = false;

  const row = make('div', `msg ${sender}`);
  row.appendChild(make('p', 'label', sender === 'user' ? 'You' : 'Dalal'));
  row.appendChild(make('p', 'msg-text', text));
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;

  // The panel is narrow and a long conversation would push the verdict off-screen.
  while (box.children.length > 12) box.removeChild(box.firstChild);
}

function setStatus(text, live) {
  const pill = el('status-pill');
  pill.textContent = text;
  pill.classList.toggle('live', Boolean(live));
}

// ---------------------------------------------------------------- verdict

function headline(lead, accent, sub, pulse) {
  const body = el('result-body');
  body.replaceChildren();

  const h = make('h2', pulse ? 'headline pulse' : 'headline');
  h.appendChild(document.createTextNode(lead));
  h.appendChild(document.createElement('br'));
  h.appendChild(make('em', null, accent));
  body.appendChild(h);
  if (sub) body.appendChild(make('p', 'subtle', sub));
}

function renderCard(pick, rank) {
  const card = make('article', 'card');
  const place = pick.restaurant || pick.retailer || '';
  const channel = APP_LABEL[pick.app || pick.retailer] || pick.app || pick.retailer || DASH;

  const media = make('div', 'card-media');
  const img = make('img');
  const src = foodImage(pick);
  img.src = src;
  img.alt = pick.name || 'Dish';
  img.loading = rank === 0 ? 'eager' : 'lazy';
  media.appendChild(img);
  media.appendChild(make('span', rank === 0 ? 'rank' : 'rank second', rank === 0 ? 'The pick' : 'Runner-up'));
  if (isStock(src)) {
    const tag = make('span', 'stock-tag', 'Illustrative');
    tag.title = 'The app published no photo for this dish, so this is artwork — not this restaurant’s plate.';
    media.appendChild(tag);
  }
  card.appendChild(media);

  const top = make('div', 'card-top');
  const left = make('div');
  const label = make('p', 'label');
  label.appendChild(document.createTextNode(place || DASH));
  const chan = make('span', null, ` / ${channel}`);
  chan.style.color = 'var(--red)';
  label.appendChild(chan);
  left.appendChild(label);
  left.appendChild(make('p', 'card-name', pick.name || DASH));
  top.appendChild(left);

  const priceBox = make('div');
  priceBox.appendChild(make('div', 'price', money(pick.price_aed)));
  priceBox.appendChild(make('p', 'label', 'AED'));
  top.appendChild(priceBox);
  card.appendChild(top);

  // Each line appears only if a source actually returned it — no invented 4.7s.
  const meta = make('div', 'meta');
  if (typeof pick.rating === 'number') {
    const span = make('span');
    span.appendChild(make('strong', null, `★ ${pick.rating}`));
    if (typeof pick.review_count === 'number') {
      span.appendChild(document.createTextNode(` (${pick.review_count.toLocaleString('en-AE')} reviews)`));
    }
    meta.appendChild(span);
  }
  if (pick.address) meta.appendChild(make('span', null, pick.address));
  if (pick.delivery_estimate) meta.appendChild(make('span', null, pick.delivery_estimate));
  if (meta.childElementCount) card.appendChild(meta);

  if (Array.isArray(pick.why) && pick.why.length) {
    const list = make('ul', 'why');
    pick.why.forEach((reason) => list.appendChild(make('li', null, reason)));
    card.appendChild(list);
  }

  if (pick.top_review?.text) {
    const quote = make('blockquote', 'quote', `“${pick.top_review.text}”`);
    const by = [pick.top_review.author || 'Anonymous', pick.top_review.source].filter(Boolean).join(' · ');
    quote.appendChild(make('footer', null, by));
    card.appendChild(quote);
  }

  if (Array.isArray(pick.watch_outs) && pick.watch_outs.length) {
    const list = make('ul', 'warn');
    pick.watch_outs.forEach((w) => list.appendChild(make('li', null, w)));
    card.appendChild(list);
  }

  if (isSafeOrderUrl(pick.url)) {
    const link = make('a', 'btn full order');
    link.href = pick.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.appendChild(make('span', null, `Order on ${channel}`));
    card.appendChild(link);
  } else if (pick.url) {
    card.appendChild(make('p', 'label', 'Order link refused — not a known delivery app'));
  }

  return card;
}

function renderVerdict(verdict, craving) {
  el('result-label').textContent = craving ? `Verdict · ${craving}` : 'The verdict';
  el('new-search').hidden = false;

  const body = el('result-body');
  body.replaceChildren();

  const pick = verdict?.pick;
  if (!pick || (!pick.price_aed && !pick.url && !pick.restaurant)) {
    headline('Nothing', 'carried it.',
      pick?.watch_outs?.[0] || 'No live listing carried this dish in the area searched.');
    return;
  }

  if (verdict.is_fixture) body.appendChild(make('span', 'badge-fixture', 'Sample data — not a live fetch'));
  if (verdict.price_note) body.appendChild(make('p', 'subtle', verdict.price_note));

  body.appendChild(renderCard(pick, 0));
  if (verdict.runner_up) body.appendChild(renderCard(verdict.runner_up, 1));
}

// ---------------------------------------------------------------- research

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function pollJob(jobId, craving) {
  stopPolling();

  const tick = async () => {
    let verdict;
    try {
      const data = await api(`/v1/tools/get_verdict?job_id=${encodeURIComponent(jobId)}`);
      verdict = data?.status === 'done' || data?.pick ? data : null;
    } catch {
      return; // transient; keep polling
    }
    if (!verdict) return;

    stopPolling();
    await chrome.storage.local.set({ [STORAGE.lastVerdict]: verdict });
    chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' }).catch(() => {});
    renderVerdict(verdict, craving);
  };

  tick();
  pollTimer = setInterval(tick, POLL_MS);
}

async function research(craving) {
  setError(el('search-error'), '');
  el('new-search').hidden = true;
  el('result-label').textContent = 'Researching';
  headline('Searching', 'live.', `Reading menus and reviews for “${craving}”.`, true);

  let response;
  try {
    // Through the worker so the job stays tracked (badge + notification) even if the
    // panel is closed a second later.
    response = await chrome.runtime.sendMessage({ type: 'START_RESEARCH', dish: craving, area: 'Dubai' });
  } catch {
    response = { ok: false, error: 'Extension background worker is not responding.' };
  }
  if (!response?.ok) {
    headline('Could not', 'start.', response?.error || 'Something went wrong reaching the backend.');
    return;
  }
  pollJob(response.jobId, craving);
}

/**
 * Watches for a job the VOICE AGENT started.
 *
 * The agent calls start_research from ElevenLabs' cloud, so that job_id never reaches
 * this panel. Polling latest_job is how the panel attaches to what was just spoken —
 * the same mechanism the web app uses.
 */
let lastSeenJob = null;
async function watchForAgentJobs() {
  try {
    const data = await api('/v1/tools/latest_job');
    if (data?.job_id && data.job_id !== lastSeenJob) {
      lastSeenJob = data.job_id;
      pollJob(data.job_id, data.query?.dish || '');
    }
  } catch {
    /* backend unreachable; try again next tick */
  }
}

// ---------------------------------------------------------------- voice

/**
 * Explain a microphone failure, and offer the one thing that actually fixes it.
 *
 * A side panel has no address bar and no lock icon, so the usual "click the padlock"
 * advice is useless here — there is nothing to click. Chrome will also not reliably
 * show a permission prompt inside a panel.
 *
 * The reliable path is to open this same page as a normal TAB: a tab has an origin bar,
 * so the prompt appears and behaves. The grant is stored against the extension's origin,
 * which the panel shares — so once it is allowed in the tab, the panel has it too.
 */
function showMicHelp(rawError) {
  const box = el('mic-error');
  box.replaceChildren();
  box.hidden = false;

  if (rawError) {
    box.appendChild(make('p', null, `Could not start the voice session: ${rawError}`));
    return;
  }

  box.appendChild(make('p', null,
    'The microphone is blocked. A side panel has no address bar, so the permission ' +
    'has to be granted once in a normal tab — after that this panel can use it.'));

  const button = make('button', 'btn full', null);
  button.type = 'button';
  button.style.marginTop = '10px';
  button.appendChild(make('span', null, 'Grant microphone access'));
  button.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel.html?grant=1') });
  });
  box.appendChild(button);
}

/**
 * Opened as a tab with ?grant=1: ask for the microphone, then say what happened.
 *
 * This exists purely so the permission prompt has somewhere it can legitimately appear.
 * The stream is stopped immediately — we want the grant, not the audio.
 */
async function runGrantFlow() {
  const box = el('mic-error');
  box.replaceChildren();
  box.hidden = false;
  box.appendChild(make('p', null, 'Requesting microphone access…'));

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    box.replaceChildren(
      make('p', null, 'Microphone granted. You can close this tab — open the DaleelBites side panel and tap the face.')
    );
  } catch (err) {
    box.replaceChildren(
      make('p', null,
        'Microphone still blocked. Open your browser settings → Privacy → Site settings → ' +
        'Microphone, remove any block for this extension, then reload this tab and try again.')
    );
  }
}

async function startVoice() {
  if (conversation || connecting) return;
  connecting = true;
  setError(el('mic-error'), '');
  setStatus('Connecting…');

  try {
    conversation = await Conversation.startSession({
      agentId: AGENT_ID,
      connectionType: 'webrtc',

      clientTools: {
        /**
         * The deep-link hand-off. The agent cannot open a tab from its own cloud, so
         * it calls down the live connection and this runs here. The URL originates
         * from an LLM turn over scraped content, so the worker re-validates it before
         * a tab actually opens — this is a request, not a command.
         */
        open_order_page: async (params) => {
          const url = params?.url;
          if (!isSafeOrderUrl(url)) {
            return 'Refused: that is not a known delivery-app link.';
          }
          await chrome.runtime.sendMessage({ type: 'OPEN_ORDER_PAGE', url }).catch(() => {});
          return 'Opened the order page.';
        },
      },

      onConnect: () => {
        connecting = false;
        avatar.setConnected(true);
        setStatus('Listening', true);
      },
      onDisconnect: () => {
        conversation = null;
        connecting = false;
        avatar.setConnected(false);
        avatar.setSpeaking(false);
        setStatus('Tap to talk');
      },
      onMessage: ({ message, source }) => {
        if (!message) return;
        addMessage(source === 'user' ? 'user' : 'agent', message);
        if (source !== 'user') avatar.setMessage(message);
      },
      onModeChange: ({ mode }) => {
        const speaking = mode === 'speaking';
        avatar.setSpeaking(speaking);
        setStatus(speaking ? 'Speaking' : 'Listening', true);
      },
      onError: (message) => {
        console.error('ElevenLabs error:', message);
        setError(el('mic-error'), String(message || 'Voice session error.'));
      },
    });
  } catch (err) {
    connecting = false;
    conversation = null;
    avatar.setConnected(false);
    setStatus('Tap to talk');

    // Overwhelmingly the failure here is the microphone, and the raw SDK error says
    // nothing a person can act on.
    const raw = String(err?.message || err || '');
    const micProblem = /permission|denied|NotAllowed|NotFound|device|audio|media/i.test(raw);
    showMicHelp(micProblem ? null : raw);
  }
}

async function stopVoice() {
  if (!conversation) return;
  try {
    await conversation.endSession();
  } catch {
    /* already gone */
  }
  conversation = null;
  avatar.setConnected(false);
  avatar.setSpeaking(false);
  setStatus('Tap to talk');
}

function toggleVoice() {
  if (conversation) stopVoice();
  else startVoice();
}

// ---------------------------------------------------------------- accounts

function renderAccount() {
  const button = el('account-btn');
  if (currentUser) {
    button.hidden = false;
    button.textContent = currentUser.name || currentUser.email;
    button.title = 'Sign out';
    el('signin-link').hidden = true;
  } else {
    button.hidden = true;
    el('signin-link').hidden = false;
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  el('auth-title').textContent = isSignup ? 'Create account' : 'Sign in';
  el('auth-submit-text').textContent = isSignup ? 'Create account' : 'Sign in';
  el('auth-name').hidden = !isSignup;
  el('auth-switch-text').textContent = isSignup ? 'Already have an account?' : 'No account yet?';
  el('auth-switch').textContent = isSignup ? 'Sign in' : 'Sign up';
  setError(el('auth-error'), '');
}

function showAuth(visible) {
  el('auth-view').hidden = !visible;
  ['agent', 'search', 'result'].forEach((id) => {
    el(id).hidden = visible;
  });
}

// ---------------------------------------------------------------- wiring

el('craving-go').addEventListener('click', () => {
  const craving = el('craving').value.trim();
  if (!craving) return;
  research(craving);
  el('craving').value = '';
});

el('craving').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') el('craving-go').click();
});

el('new-search').addEventListener('click', () => {
  stopPolling();
  el('new-search').hidden = true;
  el('result-label').textContent = 'Live result';
  headline('Ready', 'when you are.', 'Tap the face and speak, or type a craving.');
  el('craving').focus();
});

el('signin-link').addEventListener('click', () => {
  setAuthMode('login');
  showAuth(true);
});

el('account-btn').addEventListener('click', async () => {
  await clearSession();
  currentUser = null;
  renderAccount();
});

el('auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
el('auth-back').addEventListener('click', () => showAuth(false));

el('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setError(el('auth-error'), '');
  try {
    const email = el('auth-email').value.trim();
    const password = el('auth-password').value;
    const name = el('auth-name').value.trim();
    currentUser = authMode === 'signup' ? await signup(email, password, name) : await login(email, password);
    renderAccount();
    showAuth(false);
  } catch (err) {
    setError(el('auth-error'), err?.message || 'Could not sign you in.');
  }
});

// ---------------------------------------------------------------- boot

(async function boot() {
  el('webapp-link').href = WEB_APP;

  avatar = createAvatar(toggleVoice);
  el('avatar-slot').appendChild(avatar.node);

  // Opened as a tab purely to host the microphone permission prompt.
  if (new URLSearchParams(location.search).get('grant') === '1') {
    setStatus('Microphone setup');
    runGrantFlow();
    return;
  }

  const chips = el('chips');
  POPULAR.forEach((craving) => {
    const chip = make('button', 'chip', craving);
    chip.type = 'button';
    chip.addEventListener('click', () => research(craving));
    chips.appendChild(chip);
  });

  const stored = await chrome.storage.local.get([STORAGE.lastVerdict, STORAGE.lastCraving, STORAGE.user]);
  currentUser = stored[STORAGE.user] || null;
  renderAccount();

  if (stored[STORAGE.lastVerdict]) {
    renderVerdict(stored[STORAGE.lastVerdict], stored[STORAGE.lastCraving]);
    chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' }).catch(() => {});
  } else {
    headline('Ready', 'when you are.', 'Tap the face and speak, or type a craving.');
  }

  // Pick up jobs the voice agent starts in ElevenLabs' cloud.
  watchForAgentJobs();
  setInterval(watchForAgentJobs, POLL_MS);

  const fresh = await me();
  if (fresh?.id !== currentUser?.id) {
    currentUser = fresh;
    renderAccount();
  }
})();

// A closing panel must not leave a live microphone behind.
window.addEventListener('pagehide', () => {
  stopPolling();
  if (conversation) conversation.endSession().catch(() => {});
});
