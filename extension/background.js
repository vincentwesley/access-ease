import { loadSettings, setAllSitesOff } from './lib/settings.js';
import { reconcileFresh } from './lib/allsites.js';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function reconcile() {
  try {
    const { settings, ok } = await reconcileFresh(loadSettings);
    // Access was revoked (chrome://extensions) while the setting says on: make the
    // setting true to reality; an open panel picks this up via storage.onChanged.
    if (settings.allSites && !ok) await setAllSitesOff();
  } catch {
    // Nothing useful to do; the panel re-checks whenever it opens.
  }
}

// Listeners must be registered synchronously at top level so the service worker
// is woken for these events.
chrome.runtime.onInstalled.addListener(reconcile);
chrome.runtime.onStartup.addListener(reconcile);
// The user can grant or revoke all-sites access from chrome://extensions at any time.
chrome.permissions.onAdded.addListener(reconcile);
chrome.permissions.onRemoved.addListener(reconcile);
