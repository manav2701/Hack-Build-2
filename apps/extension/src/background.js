/**
 * Service worker — the part that keeps working after the popup closes.
 *
 * An MV3 service worker is evicted whenever it goes idle, so nothing here may rely on
 * a variable surviving between events. Every piece of state that must outlive a call
 * lives in `chrome.storage.local`, and the poll loop is driven by `chrome.alarms`,
 * which wakes the worker back up.
 *
 * Division of labour with the popup: while the popup is open it polls at its own
 * (fast) cadence because the user is watching. This alarm is the backstop for a job
 * started from a content script or left running when the popup closed — it finishes
 * the job, badges the icon and fires a notification.
 */

import { getVerdict, startResearch } from './api.js';
import { STORAGE, isSafeOrderUrl } from './config.js';

const ALARM = 'daleelbites-poll';
// chrome.alarms clamps periods below one minute in a packed extension, so this is the
// real floor. Research takes ~30-60s; the popup covers the fast path when it is open.
const POLL_MINUTES = 1;
// A job that has not finished in this long is not going to. Stop polling rather than
// waking the worker forever.
const JOB_TIMEOUT_MS = 6 * 60 * 1000;

async function setBadge(text, color = '#DB4A2B') {
  try {
    await chrome.action.setBadgeText({ text });
    if (text) await chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    /* the action API is unavailable while the worker is shutting down */
  }
}

/** Begin tracking a job so the alarm loop will finish it. */
async function trackJob(jobId, craving) {
  await chrome.storage.local.set({
    [STORAGE.lastJob]: { jobId, craving, startedAt: Date.now() },
    [STORAGE.lastCraving]: craving,
    [STORAGE.lastVerdict]: null,
  });
  await setBadge('···');
  await chrome.alarms.create(ALARM, { periodInMinutes: POLL_MINUTES, when: Date.now() + 20_000 });
}

async function stopTracking() {
  await chrome.alarms.clear(ALARM);
}

/** One poll of the tracked job. Resolves quietly when there is nothing to do. */
async function pollTrackedJob() {
  const stored = await chrome.storage.local.get([STORAGE.lastJob]);
  const job = stored[STORAGE.lastJob];
  if (!job?.jobId) {
    await stopTracking();
    return;
  }

  if (Date.now() - (job.startedAt || 0) > JOB_TIMEOUT_MS) {
    await stopTracking();
    await setBadge('');
    return;
  }

  let verdict = null;
  try {
    verdict = await getVerdict(job.jobId);
  } catch {
    // Transient failure; the next alarm tries again inside the timeout window.
    return;
  }
  if (!verdict) return;

  await chrome.storage.local.set({ [STORAGE.lastVerdict]: verdict });
  await stopTracking();
  await setBadge('1', '#DB4A2B');
  await notifyVerdict(verdict, job.craving);
}

async function notifyVerdict(verdict, craving) {
  const pick = verdict?.pick;
  if (!pick) return;

  const price = typeof pick.price_aed === 'number' && pick.price_aed > 0 ? `AED ${pick.price_aed}` : '';
  const place = pick.restaurant || pick.retailer || '';
  const message = [place, price].filter(Boolean).join(' · ') || 'Open DaleelBites for the verdict.';

  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `Verdict ready${craving ? `: ${craving}` : ''}`,
      message,
      priority: 1,
    });
  } catch {
    // Notifications can be disabled at the OS level; the badge already carries the signal.
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) pollTrackedJob();
});

/**
 * Message bus for the popup and the content scripts.
 *
 * `sendResponse` is called asynchronously, so every handled branch returns `true` to
 * keep the message channel open — without it Chrome closes the port and the caller's
 * promise resolves as undefined.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'START_RESEARCH') {
    (async () => {
      try {
        const craving = String(message.dish || '').trim();
        if (!craving) throw new Error('No craving given.');
        const data = await startResearch(craving, message.area || 'Dubai');
        await trackJob(data.job_id, craving);
        sendResponse({ ok: true, jobId: data.job_id });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'Could not start research.' });
      }
    })();
    return true;
  }

  // A single immediate check, for a caller that is watching (the content-script panel).
  // It cannot wait on the alarm loop: chrome.alarms will not fire more than once a
  // minute, so an alarm-only path would leave the panel blank for most of the wait even
  // though the verdict was ready. The worker does the fetch because a content script's
  // cross-origin request is subject to the host page's CORS, not our host permissions.
  if (message?.type === 'POLL_JOB') {
    (async () => {
      try {
        const verdict = await getVerdict(String(message.jobId || ''));
        if (verdict) {
          await chrome.storage.local.set({ [STORAGE.lastVerdict]: verdict });
          await stopTracking();
          await setBadge('');
        }
        sendResponse({ ok: true, verdict });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'Poll failed.' });
      }
    })();
    return true;
  }

  if (message?.type === 'GET_STATE') {
    (async () => {
      const stored = await chrome.storage.local.get([
        STORAGE.lastJob,
        STORAGE.lastVerdict,
        STORAGE.lastCraving,
        STORAGE.user,
      ]);
      sendResponse({ ok: true, state: stored });
    })();
    return true;
  }

  if (message?.type === 'CLEAR_BADGE') {
    setBadge('').then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'OPEN_ORDER_PAGE') {
    // The URL came from an LLM turn over scraped content, so it is re-validated HERE
    // even though the sender also checked: the service worker is the last gate before
    // a tab actually opens.
    if (isSafeOrderUrl(message.url)) {
      chrome.tabs.create({ url: message.url });
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'Refused: not a known delivery-app link.' });
    }
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  setBadge('');
});
