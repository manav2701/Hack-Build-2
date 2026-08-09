# DaleelBites — Chrome Extension

The same voice broker as the web app, in your toolbar. Talk to it in a side panel, or compare a dish right from the Talabat / Deliveroo / Noon Food page you're already on.

## Demo

[![Watch the extension demo](https://drive.google.com/thumbnail?id=1DsnuPCDhiJ5WtbAn18-GRJIZTf5yFRBV&sz=w1280)](https://drive.google.com/file/d/1DsnuPCDhiJ5WtbAn18-GRJIZTf5yFRBV/view)

*Click to play on Google Drive.*

## What it does

- **Side panel** (click the toolbar icon) — talk to the voice agent with an animated avatar, or type a craving. Shows verdict cards with the dish photo, price, rating, a real review, and an order button. Sign in to save your history (same account as the web app).
- **In-page compare button** — visit Talabat, Deliveroo, or Noon Food, and a "Compare on DaleelBites" button appears. It reads the dish off the page and shows the verdict without leaving the tab.
- **Background tracking** — close the panel while a search is running; you'll get a notification when it's done.

## Install

The side panel needs one build step first (it bundles the ElevenLabs voice SDK):

```bash
cd apps/extension
npm install
npm run build
```

Then:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**, select this folder (`apps/extension`)
4. Pin the icon, then click it to open the side panel

Nothing else to configure — the backend URL and voice agent ID are already set in `src/config.js`. Requires Chrome 114+.

While making changes: `npm run watch` rebuilds automatically, but you still need to hit **↻** on the extension card in `chrome://extensions`, and reload any open delivery-app tab.

## Using the voice agent

Click the toolbar icon, then click the face. Chrome will ask for microphone access — allow it, and start talking.

**If the mic prompt doesn't show up:** a side panel has no address bar, so the usual "click the lock icon" fix doesn't apply here. The panel will show a **"Grant microphone access"** button instead — it opens a normal tab where the permission prompt can appear properly. Grant it there, close the tab, and the side panel will have access too.

## Publishing (optional)

To let people install this without turning on Developer mode, publish it to the Chrome Web Store:

1. Register a developer account (one-time $5 fee) at the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
2. Zip the **contents** of this folder — `manifest.json` needs to be at the root of the zip
3. Upload, fill in the listing (description, category, icon, at least one 1280×800 screenshot, privacy policy URL)
4. Justify each permission when asked — see the table below
5. Submit for review (typically a few business days)

| Permission | Why it's needed |
|---|---|
| `storage` | Saves your session token and last search locally |
| `sidePanel` | The extension's UI lives in a side panel |
| `alarms` | Keeps checking on a search after the panel is closed |
| `notifications` | Tells you when a comparison is ready |
| `host_permissions` (Railway URL) | The extension's own backend |
| Content-script matches | Adds the compare button on the delivery apps |

## Changing the backend URL

If you deploy your own backend, update it in **two** places (both are required — `host_permissions` is what actually authorizes the request):

- `src/config.js` → `API_BASE`
- `manifest.json` → `host_permissions`

## Files

```
manifest.json                 MV3 manifest
build.mjs                     bundler for the side panel (the only built file)
src/config.js                 backend URL, agent ID, storage keys
src/api.js                    backend calls + session storage
src/background.js             service worker: job tracking, notifications, message routing
src/sidepanel.{html,css,js}   the side panel UI
src/avatar.js                 the animated face
src/content.{js,css}          in-page compare button + verdict panel
src/images.js                 picks a dish photo for a card
icons/                        toolbar icon
dist/                         build output (generated, not committed)
```

<details>
<summary><b>Design notes</b> — why a side panel, why one build step, why no innerHTML</summary>

**Why a side panel and not a popup.** An extension popup closes the instant it loses focus — and the microphone permission prompt itself takes focus, so the popup closes before you can grant it. Even with access granted, any stray click would kill the voice session mid-sentence. `chrome.sidePanel` stays open across clicks and page navigation, which a conversation actually needs.

**Why only one file gets built.** Everything except the side panel is a plain JavaScript file Chrome loads as-is — edit it, hit reload, done. The side panel is the exception because it imports the ElevenLabs SDK from npm, and Chrome's extension security policy won't load a script from a CDN, so that one file has to be bundled.

**Why the service worker does the network calls, not the content script.** A content script's requests are governed by the CORS policy of the page it's injected into (Talabat's, Deliveroo's), not by the extension's own permissions. So the content script asks the background worker to make the call.

**Why no `innerHTML` anywhere.** Every restaurant name, review, and dish description shown in the UI came from a live web page and passed through an LLM before reaching here — that makes it untrusted text. All of it is inserted with `textContent`, never parsed as HTML. The one place a value becomes a link (the order button) is checked against a fixed list of delivery-app domains first, both in the content script and again in the background worker, before a tab is ever opened.

**Why the in-page panel is a closed shadow root.** Delivery-app stylesheets are global and aggressive. A closed shadow root keeps their CSS from leaking into our panel, and ours from leaking into their page.

</details>
