# DaleelBites Chrome Extension (MV3)

Compare a dish live across Talabat / Deliveroo / Noon Food from the toolbar, or from
inside the delivery app you are already browsing.

## What it does

| Surface | Behaviour |
| --- | --- |
| **Side panel** (toolbar icon) | The full broker: **talk to the voice agent** with the animated avatar, or type a craving. Live verdict cards with the dish photo, price, rating, a real reviewer's words and a direct order link. Sign in / sign up against the same accounts as the web app. |
| **Service worker** | Keeps tracking a job after the panel closes. Badges the icon and fires a desktop notification when the verdict lands. |
| **Content script** | On a Talabat / Deliveroo / Noon Food page, adds a "Compare on DaleelBites" button. It pre-fills the craving from the page and renders the verdict inline, so you never leave the tab. |

## Install (development)

The side panel bundles the ElevenLabs SDK, so it needs one build before you load it:

```bash
cd apps/extension
npm install
npm run build      # writes dist/sidepanel.js
```

Then:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (`apps/extension`)
4. Pin **DaleelBites** to the toolbar, and click it to open the side panel

Nothing else to configure — the production API URL and the agent id are compiled in.
Chrome 114+ is required (`chrome.sidePanel`).

While iterating: `npm run watch` rebuilds on save. You still have to hit **↻** on the
extension card, and refresh any delivery-app tab for content-script changes.

## Why a side panel and not a popup

An extension popup closes the moment it loses focus. Two consequences, both fatal for
voice:

* the **microphone permission prompt itself takes focus**, so the popup closes and the
  request dies — mic access in a popup is unwinnable;
* even once granted, clicking anywhere would tear down the WebRTC session mid-sentence.

`chrome.sidePanel` persists across clicks and navigation, which is what a conversation
needs — and it puts the broker *beside* the delivery site you are actually reading.
The panel replaced the popup entirely rather than sitting alongside it: it does
everything the popup did, and two surfaces with one purpose drift apart.

## What you must set up manually

**Nothing, to run it locally.** The two items below only apply if you change the
deployment or want to publish it.

### 1. Pointing it at a different backend

The API origin appears in **two** places and both must agree — `host_permissions`
is what actually authorises the request, so changing only the constant produces a
silently blocked extension:

- `src/config.js` → `API_BASE`
- `manifest.json` → `host_permissions`

`src/config.js` also holds `AGENT_ID`, the ElevenLabs voice agent. It is a public
identifier (the web app already ships it to every browser), and the agent is public,
so `startSession` needs no signed URL. If you make the agent private, this has to
become a token minted by the backend instead.

### 2. Publishing to the Chrome Web Store

Required for anyone to install it without Developer mode:

1. Register a Chrome Web Store developer account (one-time **$5** fee) at
   <https://chrome.google.com/webstore/devconsole>
2. Zip the **contents** of `apps/extension` (the `manifest.json` must be at the root
   of the zip, not inside a folder)
3. Upload, then fill in the listing: description, category, a 128×128 icon (already in
   `icons/`), at least one 1280×800 screenshot, and a privacy policy URL
4. Under **Privacy practices**, justify each permission — see the table below; the
   review bounces submissions that leave these blank
5. Submit. First review typically takes a few business days.

| Permission | Justification for the review form |
| --- | --- |
| `storage` | Stores the user's session token and their last search result locally. |
| `sidePanel` | The extension's whole UI is a side panel. |
| `alarms` | Finishes polling a research job after the side panel closes. |
| `notifications` | Tells the user their comparison is ready. |
| `host_permissions` (Railway API) | The extension's own backend; performs the comparison. |
| Content-script matches | Adds the compare button on the supported delivery apps. |

## Architecture notes

**Why the service worker does the fetching.** A content script's cross-origin request
is governed by the *host page's* CORS policy, not by the extension's host permissions.
So the content script asks the worker to call the API and hand back the result.

**Why the panel polls too.** `chrome.alarms` cannot fire more than once a minute, which
is far too slow to watch a ~30 s job. While the panel is open it polls every 2 s; the
alarm is the backstop for when it is closed.

**Why `@elevenlabs/client` and not `@elevenlabs/react`.** The panel is a few dozen DOM
nodes; bundling a renderer for that is not a trade worth making. The avatar is a
hand-ported SVG (`src/avatar.js`) rather than a shared React component.

**Why only one file is bundled.** Everything except the side panel is a plain ES module
Chrome loads directly, so "edit, reload" stays true for most work. Only `sidepanel.js`
pulls an npm package, and MV3's `script-src 'self'` leaves no CDN escape hatch.

**Why the injected UI is in a closed shadow root.** Delivery-app stylesheets are
aggressive and global. A closed shadow root means their CSS cannot reach our panel and
ours cannot leak onto their page.

**Why no `innerHTML`.** Verdict fields are scraped restaurant and review text that has
passed through an LLM — untrusted by definition. Every node is built with
`createElement` + `textContent`. The only value that reaches an attribute is the order
URL, and it is checked against the delivery-app allow-list first (in the content script
*and* again in the worker before a tab opens).

## Files

```
manifest.json        MV3 manifest
build.mjs            esbuild bundler for the side panel (the only built file)
src/config.js        API origin, agent id, storage keys, order-link allow-list
src/api.js           backend calls + session storage (panel & worker)
src/background.js    service worker: job tracking, badge, notifications, message bus
src/sidepanel.{html,css,js}   the side panel: voice, avatar, transcript, verdict, auth
src/avatar.js        the animated face (vanilla SVG port of the web component)
src/content.{js,css}          in-page compare button + verdict panel
src/images.js        dish-photo resolution (mirrors apps/web/lib/foodImages.ts)
icons/               generated PNG mark
dist/                build output — gitignored, produced by `npm run build`
```
