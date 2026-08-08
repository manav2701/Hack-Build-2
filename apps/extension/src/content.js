/**
 * In-page companion for Talabat / Deliveroo / Noon Food.
 *
 * The pitch of this product is that you should not have to check three apps. So when
 * you are already looking at a dish on one of them, this offers the one thing the page
 * cannot: is it cheaper, or better rated, somewhere else?
 *
 * Two constraints shape the implementation:
 *
 *  * **The page is hostile input.** Everything read off it (dish names, prices) is
 *    treated as text, never as markup, and it only ever leaves as a search string.
 *  * **A content script cannot open the popup.** Chrome has no API for that. So the
 *    panel renders the verdict inline, and the service worker handles the tab-opening
 *    on click, re-validating the URL before it does.
 *
 * Isolation: the whole UI lives in a closed shadow root so the host page's stylesheet
 * cannot bleed in and ours cannot bleed out.
 */

(() => {
  if (window.__daleelbitesInjected) return;
  window.__daleelbitesInjected = true;

  const DASH = '—';
  const POLL_MS = 2500;
  const MAX_POLLS = 60; // ~2.5 minutes, then stop bothering the backend

  const ALLOWED_ORDER_HOSTS = [
    'talabat.com', 'deliveroo.ae', 'deliveroo.com',
    'eateasy.ae', 'noon.com', 'food.noon.com', 'careem.com',
  ];

  function isSafeOrderUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return false;
    let parsed;
    try {
      parsed = new URL(url.trim());
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_ORDER_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  }

  // ------------------------------------------------------------------ page read

  /**
   * The dish this page is about, as a search string.
   *
   * Deliberately shallow: a per-app DOM selector would break the week either app
   * ships a redesign. The document title is the one thing every restaurant page on
   * every app puts the restaurant/dish in, so it is the stable-enough signal, and the
   * user can edit it before searching anyway.
   */
  function guessCraving() {
    const heading = document.querySelector('h1');
    const raw = (heading?.textContent || document.title || '').trim();
    return raw
      .replace(/\s*[|\-–—]\s*(talabat|deliveroo|noon food|noon)\b.*$/i, '')
      .replace(/\b(order online|delivery|menu|restaurant)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 80);
  }

  // ------------------------------------------------------------------ shadow UI

  const host = document.createElement('div');
  host.id = 'daleelbites-root';
  // A high z-index and fixed position, set inline: the host page cannot restyle what
  // it cannot see, but it CAN stack something above our container.
  host.style.cssText = 'position:fixed;z-index:2147483647;right:0;bottom:0;width:0;height:0;';
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .fab {
      position: fixed; right: 20px; bottom: 20px;
      display: flex; align-items: center; gap: 8px;
      background: #1E1E1E; color: #E4E2DD; border: 0; cursor: pointer;
      padding: 12px 16px; font: 700 11px/1 'Satoshi', system-ui, sans-serif;
      letter-spacing: .1em; text-transform: uppercase;
      box-shadow: 5px 5px 0 0 #DB4A2B; transition: transform .3s cubic-bezier(.16,1,.3,1);
    }
    .fab:hover { transform: translate(-2px,-2px); }
    .fab .dot { width: 7px; height: 7px; border-radius: 50%; background: #DB4A2B; }

    .panel {
      position: fixed; right: 20px; bottom: 20px; width: 340px;
      max-height: min(560px, 80vh); overflow-y: auto;
      background: #E4E2DD; color: #1E1E1E;
      border: 2px solid #1E1E1E; box-shadow: 8px 8px 0 0 #DB4A2B;
      font: 400 13px/1.5 'Satoshi', system-ui, sans-serif;
      animation: rise .5s cubic-bezier(.16,1,.3,1) both;
    }
    @keyframes rise { from { opacity: 0; transform: translateY(16px); } }
    .panel header {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 14px 16px 10px;
    }
    .brand { font: 700 17px/1.15 Impact, 'Clash Display', sans-serif; letter-spacing: -.04em; text-transform: uppercase; }
    .brand span { color: #DB4A2B; }
    .x { border: 0; background: none; cursor: pointer; font-size: 17px; line-height: 1; color: #444; padding: 2px 4px; }
    .x:hover { color: #DB4A2B; }
    .body { padding: 0 16px 16px; }
    .label { font: 700 9px/1 'Satoshi', system-ui, sans-serif; letter-spacing: .15em; text-transform: uppercase; color: #444; }
    .row { display: flex; gap: 8px; margin-top: 6px; }
    input {
      flex: 1; border: 0; border-bottom: 2px solid rgba(30,30,30,.2); background: none;
      padding: 8px 0; font: inherit; color: #1E1E1E; border-radius: 0;
    }
    input:focus { outline: none; border-color: #DB4A2B; }
    .btn {
      border: 0; background: #1E1E1E; color: #E4E2DD; cursor: pointer;
      padding: 9px 15px; font: 700 10px/1 'Satoshi', system-ui, sans-serif;
      letter-spacing: .1em; text-transform: uppercase; transition: background .25s;
    }
    .btn:hover { background: #DB4A2B; }
    .headline { font: 700 26px/.95 Impact, 'Clash Display', sans-serif; letter-spacing: -.04em; text-transform: uppercase; }
    .headline em { color: #DB4A2B; font-style: normal; }
    .subtle { margin-top: 10px; font-size: 12px; color: #444; }
    .pulse { animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .5; } }

    .card { border-top: 2px solid rgba(30,30,30,.15); padding: 12px 0; }
    .card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; background: #D9D6D0; display: block; }
    .card-top { display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; }
    .name { font: 700 11px/1.35 'Satoshi', system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; margin-top: 4px; }
    .price { font: 700 23px/1.12 Impact, 'Clash Display', sans-serif; letter-spacing: -.04em; text-align: right; white-space: nowrap; }
    .meta { margin-top: 8px; font-size: 11px; color: #444; }
    .why { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 5px; }
    .why li { font-size: 12px; padding-left: 14px; position: relative; }
    .why li::before { content: ''; position: absolute; left: 0; top: 8px; width: 9px; height: 1px; background: #DB4A2B; }
    .order { display: block; width: 100%; margin-top: 11px; text-align: center; text-decoration: none; }
    .badge { display: inline-block; margin-bottom: 8px; padding: 3px 7px; background: #F8A348;
             font: 700 9px/1.4 'Satoshi', system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;
  root.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.type = 'button';
  fab.appendChild(Object.assign(document.createElement('span'), { className: 'dot' }));
  fab.appendChild(document.createTextNode('Compare on DaleelBites'));
  root.appendChild(fab);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;
  root.appendChild(panel);

  // ------------------------------------------------------------------ helpers

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  };

  function openPanel() {
    fab.style.display = 'none';
    panel.hidden = false;
  }

  function closePanel() {
    panel.hidden = true;
    fab.style.display = '';
    stopPolling();
  }

  function shell(bodyBuilder) {
    panel.replaceChildren();

    const header = document.createElement('header');
    const brand = make('p', 'brand');
    brand.appendChild(document.createTextNode('Daleel'));
    brand.appendChild(make('span', null, 'Bites'));
    header.appendChild(brand);

    const close = make('button', 'x', '✕');
    close.type = 'button';
    close.title = 'Close';
    close.addEventListener('click', closePanel);
    header.appendChild(close);
    panel.appendChild(header);

    const body = make('div', 'body');
    bodyBuilder(body);
    panel.appendChild(body);
  }

  function renderSearch() {
    shell((body) => {
      body.appendChild(make('p', 'label', 'Compare this dish across apps'));

      const row = make('div', 'row');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = guessCraving();
      input.placeholder = 'e.g. chicken biryani';
      row.appendChild(input);

      const go = make('button', 'btn', 'Compare');
      go.type = 'button';
      go.addEventListener('click', () => {
        const craving = input.value.trim();
        if (craving) research(craving);
      });
      row.appendChild(go);
      body.appendChild(row);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') go.click();
      });

      body.appendChild(
        make('p', 'subtle', 'DaleelBites checks Talabat, Deliveroo and Noon Food, then ranks by reviews first, price second.')
      );
      setTimeout(() => input.focus(), 60);
    });
  }

  function renderStatus(lead, accent, sub, pulse) {
    shell((body) => {
      const h = make('h2', pulse ? 'headline pulse' : 'headline');
      h.appendChild(document.createTextNode(lead));
      h.appendChild(document.createElement('br'));
      h.appendChild(make('em', null, accent));
      body.appendChild(h);
      if (sub) body.appendChild(make('p', 'subtle', sub));
    });
  }

  function renderVerdict(verdict) {
    const pick = verdict?.pick;
    const nothing = !pick || (!pick.price_aed && !pick.url && !pick.restaurant);
    if (nothing) {
      renderStatus('Nothing', 'carried it.', pick?.watch_outs?.[0] || 'No live listing carried this dish nearby.');
      return;
    }

    shell((body) => {
      if (verdict.is_fixture) body.appendChild(make('span', 'badge', 'Sample data'));
      if (verdict.price_note) body.appendChild(make('p', 'subtle', verdict.price_note));

      [pick, verdict.runner_up].filter(Boolean).forEach((item, index) => {
        const card = make('article', 'card');

        if (item.image_url || item.screenshot_url) {
          const img = document.createElement('img');
          img.src = item.image_url || item.screenshot_url;
          img.alt = item.name || '';
          img.loading = 'lazy';
          card.appendChild(img);
        }

        const top = make('div', 'card-top');
        const left = make('div');
        left.appendChild(make('p', 'label', `${index === 0 ? 'The pick' : 'Runner-up'} · ${item.app || item.retailer || DASH}`));
        left.appendChild(make('p', 'name', item.restaurant || item.retailer || DASH));
        top.appendChild(left);

        const priceBox = make('div');
        priceBox.appendChild(
          make('div', 'price', typeof item.price_aed === 'number' && item.price_aed > 0 ? item.price_aed : DASH)
        );
        priceBox.appendChild(make('p', 'label', 'AED'));
        top.appendChild(priceBox);
        card.appendChild(top);

        if (item.name) card.appendChild(make('p', 'meta', item.name));
        if (typeof item.rating === 'number') {
          const reviews = typeof item.review_count === 'number' ? ` (${item.review_count} reviews)` : '';
          card.appendChild(make('p', 'meta', `★ ${item.rating}${reviews}`));
        }

        if (Array.isArray(item.why) && item.why.length) {
          const list = make('ul', 'why');
          item.why.slice(0, 3).forEach((reason) => list.appendChild(make('li', null, reason)));
          card.appendChild(list);
        }

        if (isSafeOrderUrl(item.url)) {
          const button = make('button', 'btn order', `Order on ${item.app || item.retailer || 'the app'}`);
          button.type = 'button';
          // Routed through the worker rather than window.open: it re-checks the URL and
          // owns tab creation, so the host page can never see or intercept the click.
          button.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'OPEN_ORDER_PAGE', url: item.url }).catch(() => {});
          });
          card.appendChild(button);
        }

        body.appendChild(card);
      });

      const again = make('button', 'btn order', 'Compare something else');
      again.type = 'button';
      again.addEventListener('click', renderSearch);
      body.appendChild(again);
    });
  }

  // ------------------------------------------------------------------ research

  let pollTimer = null;

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function research(craving) {
    renderStatus('Searching', 'live.', `Comparing “${craving}” across the delivery apps…`, true);

    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'START_RESEARCH', dish: craving, area: 'Dubai' });
    } catch {
      response = { ok: false, error: 'The DaleelBites background worker is not responding. Try reloading the page.' };
    }
    if (!response?.ok) {
      renderStatus('Could not', 'start.', response?.error || 'Something went wrong reaching the backend.');
      return;
    }

    stopPolling();
    const jobId = response.jobId;
    let polls = 0;

    pollTimer = setInterval(async () => {
      if (++polls > MAX_POLLS) {
        stopPolling();
        renderStatus('Still', 'running.', 'This is taking longer than usual — open the DaleelBites popup to check on it.');
        return;
      }
      let result;
      try {
        result = await chrome.runtime.sendMessage({ type: 'POLL_JOB', jobId });
      } catch {
        return; // the worker was asleep; the next tick wakes it
      }
      if (result?.ok && result.verdict) {
        stopPolling();
        renderVerdict(result.verdict);
      }
    }, POLL_MS);
  }

  // ------------------------------------------------------------------ mount

  fab.addEventListener('click', () => {
    openPanel();
    renderSearch();
  });

  document.documentElement.appendChild(host);
})();
