/**
 * Popup controller.
 *
 * Every node here is built with `document.createElement` and `textContent`. Verdict
 * fields are scraped restaurant and review text that has passed through an LLM, so
 * they are untrusted; `innerHTML` on any of it would be a script-injection hole in a
 * privileged extension page. The one place a value reaches an attribute is the order
 * link, and that URL is allow-listed first.
 */

import { STORAGE, WEB_APP, isSafeOrderUrl } from './config.js';
import { api, clearSession, login, me, signup } from './api.js';
import { foodImage, isStock } from './images.js';

const POPULAR = ['Sichuan wontons', 'Biryani', 'Shawarma', 'Smash burger'];
const POPUP_POLL_MS = 2000;
const DASH = '—';

const el = (id) => document.getElementById(id);
const views = {
  search: el('search-view'),
  result: el('result-view'),
  auth: el('auth-view'),
};

let pollTimer = null;
let authMode = 'login';
let currentUser = null;

// ---------------------------------------------------------------- view switching

function show(name) {
  Object.entries(views).forEach(([key, node]) => {
    node.hidden = key !== name;
  });
}

function setError(node, message) {
  node.textContent = message || '';
  node.hidden = !message;
}

// ---------------------------------------------------------------- rendering

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function headline(lines, sub, pulse = false) {
  const body = el('result-body');
  body.replaceChildren();

  const h = makeEl('h2', pulse ? 'headline pulse' : 'headline');
  lines.forEach((line, i) => {
    if (i > 0) h.appendChild(document.createElement('br'));
    if (line.accent) {
      h.appendChild(makeEl('em', null, line.text));
    } else {
      h.appendChild(document.createTextNode(line.text));
    }
  });
  body.appendChild(h);
  if (sub) body.appendChild(makeEl('p', 'subtle', sub));
}

function money(value) {
  return typeof value === 'number' && value > 0 ? value.toLocaleString('en-AE') : DASH;
}

const APP_LABEL = {
  talabat: 'Talabat',
  deliveroo: 'Deliveroo',
  noon_food: 'Noon Food',
  eateasy: 'EatEasy',
  careem: 'Careem Food',
};

function renderCard(pick, rank) {
  const card = makeEl('article', 'card');
  const place = pick.restaurant || pick.retailer || '';
  const channel = APP_LABEL[pick.app || pick.retailer] || pick.app || pick.retailer || DASH;

  // -- media
  const media = makeEl('div', 'card-media');
  const img = makeEl('img');
  const src = foodImage(pick);
  img.src = src;
  img.alt = pick.name || 'Dish';
  img.loading = rank === 0 ? 'eager' : 'lazy';
  media.appendChild(img);
  media.appendChild(makeEl('span', rank === 0 ? 'rank' : 'rank second', rank === 0 ? 'The pick' : 'Runner-up'));
  if (isStock(src)) {
    const tag = makeEl('span', 'stock-tag', 'Illustrative');
    tag.title = 'The app published no photo for this dish, so this is artwork — not this restaurant’s plate.';
    media.appendChild(tag);
  }
  card.appendChild(media);

  // -- headline row
  const top = makeEl('div', 'card-top');
  const left = makeEl('div');
  const label = makeEl('p', 'label');
  label.appendChild(document.createTextNode(place || DASH));
  const channelEl = makeEl('span', null, ` / ${channel}`);
  channelEl.style.color = 'var(--red)';
  label.appendChild(channelEl);
  left.appendChild(label);
  left.appendChild(makeEl('p', 'card-name', pick.name || DASH));
  top.appendChild(left);

  const priceBox = makeEl('div');
  priceBox.appendChild(makeEl('div', 'price', money(pick.price_aed)));
  priceBox.appendChild(makeEl('p', 'label', 'AED'));
  top.appendChild(priceBox);
  card.appendChild(top);

  // -- evidence. Each line appears only if a source actually returned it.
  const meta = makeEl('div', 'meta');
  if (typeof pick.rating === 'number') {
    const span = makeEl('span');
    span.appendChild(makeEl('strong', null, `★ ${pick.rating}`));
    if (typeof pick.review_count === 'number') {
      span.appendChild(document.createTextNode(` (${pick.review_count.toLocaleString('en-AE')} reviews)`));
    }
    meta.appendChild(span);
  }
  if (pick.address) meta.appendChild(makeEl('span', null, pick.address));
  if (pick.delivery_estimate) meta.appendChild(makeEl('span', null, pick.delivery_estimate));
  if (meta.childElementCount) card.appendChild(meta);

  if (Array.isArray(pick.why) && pick.why.length) {
    const list = makeEl('ul', 'why');
    pick.why.forEach((reason) => list.appendChild(makeEl('li', null, reason)));
    card.appendChild(list);
  }

  if (pick.top_review?.text) {
    const quote = makeEl('blockquote', 'quote', `“${pick.top_review.text}”`);
    const by = [pick.top_review.author || 'Anonymous', pick.top_review.source].filter(Boolean).join(' · ');
    quote.appendChild(makeEl('footer', null, by));
    card.appendChild(quote);
  }

  if (Array.isArray(pick.watch_outs) && pick.watch_outs.length) {
    const list = makeEl('ul', 'warn');
    pick.watch_outs.forEach((warning) => list.appendChild(makeEl('li', null, warning)));
    card.appendChild(list);
  }

  if (isSafeOrderUrl(pick.url)) {
    const link = makeEl('a', 'btn full order');
    link.href = pick.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.appendChild(makeEl('span', null, `Order on ${channel}`));
    card.appendChild(link);
  } else if (pick.url) {
    // A link we will not follow is reported, not silently dropped.
    card.appendChild(makeEl('p', 'label', 'Order link refused — not a known delivery app'));
  }

  return card;
}

function renderVerdict(verdict, craving) {
  el('result-label').textContent = craving ? `Verdict · ${craving}` : 'The verdict';

  const body = el('result-body');
  body.replaceChildren();

  const pick = verdict?.pick;
  const nothing = !pick || (!pick.price_aed && !pick.url && !pick.restaurant);
  if (nothing) {
    headline(
      [{ text: 'Nothing' }, { text: 'carried it.', accent: true }],
      pick?.watch_outs?.[0] || 'No live listing carried this dish in the area searched.'
    );
    return;
  }

  if (verdict.is_fixture) {
    body.appendChild(makeEl('span', 'badge-fixture', 'Sample data — not a live fetch'));
  }
  if (verdict.price_note) {
    body.appendChild(makeEl('p', 'subtle', verdict.price_note));
  }

  body.appendChild(renderCard(pick, 0));
  if (verdict.runner_up) body.appendChild(renderCard(verdict.runner_up, 1));
}

// ---------------------------------------------------------------- job polling

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/**
 * Poll while the popup is open.
 *
 * The service worker also polls, but `chrome.alarms` cannot fire faster than once a
 * minute — far too slow to watch. While the user is looking at the popup, this drives
 * the update; the alarm remains the backstop for when the popup closes.
 */
function pollJob(jobId, craving) {
  stopPolling();

  const tick = async () => {
    let verdict;
    try {
      const data = await api(`/v1/tools/get_verdict?job_id=${encodeURIComponent(jobId)}`);
      verdict = data?.status === 'done' || data?.pick ? data : null;
    } catch {
      return; // the backstop retries; a blip mid-research is expected
    }
    if (!verdict) return;

    stopPolling();
    await chrome.storage.local.set({ [STORAGE.lastVerdict]: verdict });
    chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' }).catch(() => {});
    renderVerdict(verdict, craving);
  };

  tick();
  pollTimer = setInterval(tick, POPUP_POLL_MS);
}

async function beginResearch(dish, area) {
  show('result');
  el('result-label').textContent = 'Researching';
  headline(
    [{ text: 'Searching' }, { text: 'live.', accent: true }],
    `Reading menus and reviews for “${dish}” across Talabat, Deliveroo and Noon Food.`,
    true
  );

  // Routed through the service worker so the job keeps being tracked (badge +
  // notification) even if the popup is closed a second later.
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'START_RESEARCH', dish, area });
  } catch {
    response = { ok: false, error: 'Extension background worker is not responding.' };
  }

  if (!response?.ok) {
    headline(
      [{ text: 'Could not' }, { text: 'start.', accent: true }],
      response?.error || 'Something went wrong reaching the backend.'
    );
    return;
  }
  pollJob(response.jobId, dish);
}

// ---------------------------------------------------------------- accounts

function renderAccount() {
  const button = el('account-btn');
  const signinLink = el('signin-link');

  if (currentUser) {
    button.hidden = false;
    button.textContent = currentUser.name || currentUser.email;
    button.title = 'Sign out';
    signinLink.hidden = true;
  } else {
    button.hidden = true;
    signinLink.hidden = false;
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

// ---------------------------------------------------------------- wiring

el('craving-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const dish = el('craving').value.trim();
  if (!dish) return;
  setError(el('search-error'), '');
  beginResearch(dish, el('area').value.trim() || 'Dubai');
});

el('new-search').addEventListener('click', () => {
  stopPolling();
  show('search');
  el('craving').focus();
});

el('signin-link').addEventListener('click', () => {
  setAuthMode('login');
  show('auth');
});

el('account-btn').addEventListener('click', async () => {
  await clearSession();
  currentUser = null;
  renderAccount();
  show('search');
});

el('auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
el('auth-back').addEventListener('click', () => show('search'));

el('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setError(el('auth-error'), '');

  const email = el('auth-email').value.trim();
  const password = el('auth-password').value;
  const name = el('auth-name').value.trim();

  try {
    currentUser = authMode === 'signup' ? await signup(email, password, name) : await login(email, password);
    renderAccount();
    show('search');
  } catch (err) {
    setError(el('auth-error'), err?.message || 'Could not sign you in.');
  }
});

// ---------------------------------------------------------------- boot

(async function boot() {
  el('webapp-link').href = WEB_APP;

  const chips = el('chips');
  POPULAR.forEach((craving) => {
    const chip = makeEl('button', 'chip', craving);
    chip.type = 'button';
    chip.addEventListener('click', () => beginResearch(craving, el('area').value.trim() || 'Dubai'));
    chips.appendChild(chip);
  });

  // Restore whatever was on screen last. A popup that forgets a finished verdict the
  // moment it closes makes the notification useless — you would have nowhere to read it.
  const stored = await chrome.storage.local.get([
    STORAGE.lastJob,
    STORAGE.lastVerdict,
    STORAGE.lastCraving,
    STORAGE.user,
  ]);

  currentUser = stored[STORAGE.user] || null;
  renderAccount();

  const verdict = stored[STORAGE.lastVerdict];
  const job = stored[STORAGE.lastJob];

  if (verdict) {
    show('result');
    renderVerdict(verdict, stored[STORAGE.lastCraving]);
    chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' }).catch(() => {});
  } else if (job?.jobId) {
    show('result');
    headline([{ text: 'Searching' }, { text: 'live.', accent: true }], 'Picking up where you left off…', true);
    pollJob(job.jobId, job.craving);
  } else {
    show('search');
    el('craving').focus();
  }

  // Revalidate the session in the background; a rotated secret should not leave a
  // stale name in the header.
  const fresh = await me();
  if (fresh?.id !== currentUser?.id) {
    currentUser = fresh;
    renderAccount();
  }
})();

window.addEventListener('unload', stopPolling);
