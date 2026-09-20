// Testable logic behind the side panel (no DOM). NOT web-accessible: only the
// panel and the service worker import it.
import { applyCssInPage } from './inject.js';
import { isProtectedUrl } from './pages.js';
import { migrate } from './settings.js';
import { registerApplyScript, disableAllSites, hasAllSitesPermission, ensureConsistent } from './allsites.js';

// Wording is Chrome's, not a stable API: if it changes we fall back to "not allowed yet".
const PROTECTED_ERROR = /chrome:\/\/|chrome-extension:\/\/|extensions gallery|cannot be scripted/i;
export const isProtectedError = (err) => PROTECTED_ERROR.test(String((err && err.message) || err));

/** Messages that must survive the next apply. onChange(text, count) re-renders. */
export function createStickyNotices(onChange = () => {}) {
  const map = new Map();
  const emit = () => onChange([...map.values()].join(' '), map.size);
  return {
    set(key, text) {
      if (text) map.set(key, text);
      else map.delete(key);
      emit();
    },
    get text() {
      return [...map.values()].join(' ');
    },
    get size() {
      return map.size;
    },
  };
}

/**
 * Apply css ('' clears) to every open tab except skipTabId.
 * failed = tabs that should have been reachable but were not (discarded tabs,
 * tabs we have no access to). Browser-protected pages never count as failures.
 */
export async function sweepTabs(css, { skipTabId = null } = {}) {
  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return { failed: 0, unknown: true };
  }
  const outcomes = await Promise.all(
    tabs
      .filter((t) => t.id != null && t.id !== skipTabId)
      .map(async (t) => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: t.id, allFrames: true },
            func: applyCssInPage,
            args: [css],
          });
          return 'ok';
        } catch (err) {
          return (t.url != null && isProtectedUrl(t.url)) || isProtectedError(err) ? 'protected' : 'failed';
        }
      }),
  );
  return { failed: outcomes.filter((o) => o === 'failed').length, unknown: false };
}

/**
 * Turn all-sites OFF: clear styling on ALL tabs including the active one while
 * we still hold the permission, then drop it and re-check what is really true.
 */
export async function turnAllSitesOff() {
  const swept = await sweepTabs('');
  try {
    await disableAllSites();
  } catch {
    // Re-checked below.
  }
  let stillGranted;
  try {
    stillGranted = await hasAllSitesPermission();
  } catch {
    stillGranted = true; // cannot tell: do not claim success
  }
  return { failedTabs: swept.failed + (swept.unknown ? 1 : 0), stillGranted };
}

export function describeOff({ failedTabs, stillGranted }) {
  const reload = failedTabs ? ' Some tabs could not be cleared and may need a reload to go back to normal.' : '';
  if (stillGranted) {
    return {
      sticky:
        'Apply on all sites is off, but Chrome still lets AccessEase read and change all sites. You can remove that under Details on chrome://extensions.',
      say: 'Apply on all sites is off, but Chrome still has access to all sites.' + reload,
    };
  }
  return {
    sticky: failedTabs ? reload.trim() : '',
    say: failedTabs
      ? 'Apply on all sites is off.' + reload
      : 'Apply on all sites is off. Other tabs are back to normal.',
  };
}

/**
 * Turn all-sites ON. `request` is the already-started permissions.request()
 * promise (it must be created synchronously inside the click). After
 * registering the script, already-open tabs are styled right away.
 * getCss() is evaluated after the grant so it sees the latest settings.
 */
export async function turnAllSitesOn(request, getCss, { persist = async () => {} } = {}) {
  if (!(await request)) return { ok: false };
  try {
    // Save the setting BEFORE registering: the grant already woke the service
    // worker (permissions.onAdded), and its reconcile must never read
    // allSites=false and unregister what we register next.
    await persist(true);
    await registerApplyScript();
    // Belt and braces: a reconcile that read the old value may still be running.
    await ensureConsistent(true);
  } catch {
    // Do not leave <all_urls> granted with the feature reported as off.
    try {
      await persist(false);
    } catch {
      // The save failure is reported by the panel.
    }
    try {
      await disableAllSites();
    } catch {
      // Re-checked below.
    }
    let stillGranted;
    try {
      stillGranted = await hasAllSitesPermission();
    } catch {
      stillGranted = true;
    }
    return { ok: false, failed: true, stillGranted };
  }
  const swept = await sweepTabs(getCss());
  return { ok: true, failedTabs: swept.failed + (swept.unknown ? 1 : 0) };
}

export function describeOn({ failedTabs }) {
  return failedTabs
    ? 'Apply on all sites is on. Other tabs will update when you reload them.'
    : 'Apply on all sites is on.';
}

/**
 * Settings changed in storage by someone else (another window's panel)?
 * Returns the new normalized settings to adopt, or null to ignore. Changes are
 * ignored while our own saves are in flight (they are echoes of ourselves) and
 * when they equal what we already show (no feedback loop).
 */
export function adoptExternalSettings(current, rawNewValue, pendingSaves, echoes = []) {
  if (consumeEcho(echoes, rawNewValue)) return null;
  const next = migrate(rawNewValue);
  if (pendingSaves > 0) {
    // Not necessarily our echo: never discard an external allSites change (permission
    // revoked in the background), or our next save would write the stale value back.
    return next.allSites !== current.allSites ? { ...current, allSites: next.allSites } : null;
  }
  return JSON.stringify(next) === JSON.stringify(current) ? null : next;
}

const ser = (v) => JSON.stringify(migrate(v));

/** Remember a value we are about to save, so its storage event can be recognised later. */
export function noteOwnSave(echoes, snapshot, max = 50) {
  echoes.push(ser(snapshot));
  if (echoes.length > max) echoes.shift();
}

/**
 * Is this storage value the (possibly late) echo of one of our own saves?
 * Consumes that echo and every older one, since events arrive in save order.
 * A late echo of an older save must not revert a newer local value.
 */
export function consumeEcho(echoes, rawNewValue) {
  const i = echoes.indexOf(ser(rawNewValue));
  if (i < 0) return false;
  echoes.splice(0, i + 1);
  return true;
}
