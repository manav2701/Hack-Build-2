# DaleelBites Chrome Extension (MV3)

Compare a dish live across Talabat / Deliveroo / Noon Food from the toolbar, or from
inside the delivery app you are already browsing.

## What it does

| Surface | Behaviour |
| --- | --- |
| **Popup** (toolbar icon) | Type a craving → live verdict cards with the dish photo, price, rating, a real reviewer's words, and a direct order link. Sign in / sign up against the same accounts as the web app. |
| **Service worker** | Keeps tracking a job after the popup closes. Badges the icon and fires a desktop notification when the verdict lands. |
| **Content script** | On a Talabat / Deliveroo / Noon Food page, adds a "Compare on DaleelBites" button. It pre-fills the craving from the page and renders the verdict inline, so you never leave the tab. |

## Install (development)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (`apps/extension`)
4. Pin **DaleelBites** to the toolbar

That is the whole setup. The production API URL is already compiled in, so the
extension works against the live backend with no configuration.

## What you must set up manually

**Nothing, to run it locally.** The two items below only apply if you change the
deployment or want to publish it.

### 1. Pointing it at a different backend

The API origin appears in **two** places and both must agree — `host_permissions`
is what actually authorises the request, so changing only the constant produces a
silently blocked extension:

- `src/config.js` → `API_BASE`
- `manifest.json` → `host_permissions`

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
| `alarms` | Finishes polling a research job after the popup closes. |
| `notifications` | Tells the user their comparison is ready. |
| `host_permissions` (Railway API) | The extension's own backend; performs the comparison. |
| Content-script matches | Adds the compare button on the supported delivery apps. |

## Architecture notes

**Why the service worker does the fetching.** A content script's cross-origin request
is governed by the *host page's* CORS policy, not by the extension's host permissions.
So the content script asks the worker to call the API and hand back the result.

**Why the popup polls too.** `chrome.alarms` cannot fire more than once a minute, which
is far too slow to watch a ~30 s job. While the popup is open it polls every 2 s; the
alarm is the backstop for when it is closed.

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
src/config.js        API origin, storage keys, order-link allow-list
src/api.js           backend calls + session storage (popup & worker)
src/background.js    service worker: job tracking, badge, notifications, message bus
src/popup.{html,css,js}   toolbar UI
src/content.{js,css}      in-page compare button + verdict panel
src/images.js        dish-photo resolution (mirrors apps/web/lib/foodImages.ts)
icons/               generated PNG mark
```
