import { loadSettings, saveSettings, setAllSitesOff, normalize, defaultSettings, LIMITS, STORAGE_KEY } from '../lib/settings.js';
import { buildCss, fontUrls } from '../lib/css.js';
import { applyCssInPage } from '../lib/inject.js';
import { isProtectedUrl } from '../lib/pages.js';
import { requestAllSitesPermission, reconcileFresh } from '../lib/allsites.js';
import {
  createStickyNotices,
  isProtectedError,
  turnAllSitesOn,
  turnAllSitesOff,
  describeOn,
  describeOff,
  adoptExternalSettings,
  noteOwnSave,
} from '../lib/panel-logic.js';

const $ = (id) => document.getElementById(id);

const MSG_NO_ACCESS =
  "AccessEase can't change this page yet. Use the button above, or click the AccessEase icon in your toolbar twice (close, then reopen) to allow just this page.";
const MSG_RELOAD =
  'Apply on all sites is on, but this page was open before that. Reload the page to apply your settings.';
const MSG_PROTECTED =
  "Chrome doesn't let any extension change this page. Open a normal website and AccessEase will work there.";
const MSG_SAVE = 'AccessEase could not save your settings, so they may be lost when you close the panel.';
const MSG_LOAD = "AccessEase couldn't load your saved settings, so the defaults are shown.";

let settings = normalize(null);
let activeTabId = null;
let windowId = null;

// ---------- small helpers ----------
const say = (text) => {
  $('status').textContent = '';
  // Re-set on next tick so identical messages are announced again.
  setTimeout(() => {
    $('status').textContent = text;
  }, 30);
};
const notice = (text) => {
  const el = $('notice');
  el.textContent = text;
  el.hidden = !text;
};
// #notice shows a short-lived confirmation ("flash") over the page-status message.
let statusMsg = '';
let flash = '';
let flashTimer = null;
const showNotice = () => notice(flash || statusMsg);
function flashNotice(text) {
  flash = text;
  showNotice();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flash = '';
    showNotice();
  }, 4000);
}
// Messages that must survive the next apply (which rewrites the status message).
const sticky = createStickyNotices((text, count) => {
  const el = $('sticky-notice');
  el.textContent = text;
  el.hidden = count === 0;
});
const setSticky = (key, text) => sticky.set(key, text);

// ---------- settings ----------
let saveChain = Promise.resolve();
const echoes = []; // our own saved values, to recognise late storage echoes
let pendingSaves = 0; // our own in-flight saves: their storage events are echoes, not other windows
function update(patch) {
  settings = normalize({ ...settings, ...patch });
  render();
  const snapshot = settings;
  pendingSaves += 1;
  noteOwnSave(echoes, snapshot);
  // Write only the keys this update changed, merged over what is stored now, so a
  // background change to allSites (revocation) is never overwritten with a stale value.
  const attempt = saveChain.then(async () => {
    const stored = await loadSettings();
    const next = normalize({ ...stored, ...patch });
    // Storage has no transactions: skip a write that would change nothing, so a
    // no-op update (e.g. Reset on defaults) can never race with another context's write.
    if (JSON.stringify(next) === JSON.stringify(stored)) return stored;
    return saveSettings(next);
  });
  saveChain = attempt
    .then(() => setSticky('save', ''))
    .catch(() => setSticky('save', MSG_SAVE))
    .finally(() => {
      pendingSaves -= 1;
    });
  applyToActiveTab();
  return attempt; // rejects if this save failed (the sticky notice is shown either way)
}

// Another window's panel (or the service worker) changed the settings.
function onStorageChanged(changes, area) {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  const next = adoptExternalSettings(settings, changes[STORAGE_KEY].newValue, pendingSaves, echoes);
  if (!next) return;
  settings = next;
  render();
  applyToActiveTab();
}

function render() {
  const s = settings;
  $('size').value = String(s.textScale);
  $('size').setAttribute('aria-valuetext', `${s.textScale} percent`);
  $('size-out').textContent = `${s.textScale}%`;
  for (const r of document.querySelectorAll('input[name="contrast"]')) r.checked = r.value === s.contrast;
  $('dyslexia').checked = s.dyslexiaFont;
  $('motion').checked = s.reduceMotion;
  $('allsites').checked = s.allSites;
}

// ---------- applying CSS to the tab ----------
let applying = false;
let again = false;

async function applyToActiveTab() {
  if (applying) {
    again = true;
    return;
  }
  applying = true;
  try {
    do {
      again = false;
      await doApply();
    } while (again);
  } finally {
    applying = false;
  }
}

function showPageStatus(active, protectedPage) {
  const el = $('page-status');
  el.dataset.active = active ? 'yes' : 'no';
  el.textContent = active ? 'Active on this page' : 'Not active on this page';
  // A click in the panel is a valid user gesture for permissions.request.
  $('enable-all').hidden = active || protectedPage || settings.allSites;
  // Dim (but keep usable) the page controls while they cannot take effect.
  $('main').dataset.inactive = active ? 'no' : 'yes';
  statusMsg = active ? '' : protectedPage ? MSG_PROTECTED : settings.allSites ? MSG_RELOAD : MSG_NO_ACCESS;
  showNotice();
}

async function doApply() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    showPageStatus(false, false);
    return;
  }
  if (!tab || tab.id == null) {
    showPageStatus(false, false);
    return;
  }
  activeTabId = tab.id;
  // tab.url is only visible once AccessEase has access to the tab, so a missing
  // url means "not allowed yet", not "protected".
  if (tab.url != null && isProtectedUrl(tab.url)) {
    showPageStatus(false, true);
    return;
  }
  const css = buildCss(settings, fontUrls((p) => chrome.runtime.getURL(p)));
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: applyCssInPage,
      args: [css],
    });
    showPageStatus(true, false);
  } catch (err) {
    // With no url to look at, the browser's own error tells a page nobody can
    // script (chrome://, the Web Store) from one we just have not been allowed on.
    showPageStatus(false, isProtectedError(err));
  }
}

// ---------- controls ----------
function bindControls() {
  const size = $('size');
  size.addEventListener('input', () => update({ textScale: Number(size.value) }));
  const step = (d) => {
    const next = settings.textScale + d * LIMITS.textScale.step;
    if (next > LIMITS.textScale.max || next < LIMITS.textScale.min) {
      say(d > 0 ? 'Already at the largest size' : 'Already at the smallest size');
      return;
    }
    update({ textScale: next });
    say(`Text size ${settings.textScale} percent`);
  };
  $('size-down').addEventListener('click', () => step(-1));
  $('size-up').addEventListener('click', () => step(1));

  for (const r of document.querySelectorAll('input[name="contrast"]')) {
    r.addEventListener('change', () => r.checked && update({ contrast: r.value }));
  }
  $('dyslexia').addEventListener('change', (e) => update({ dyslexiaFont: e.target.checked }));
  $('motion').addEventListener('change', (e) => update({ reduceMotion: e.target.checked }));

  $('reset').addEventListener('click', () => {
    const d = defaultSettings();
    // Page settings only: the all-sites choice stays.
    update({
      textScale: d.textScale,
      contrast: d.contrast,
      dyslexiaFont: d.dyslexiaFont,
      reduceMotion: d.reduceMotion,
    });
    say('Text, contrast, font and motion were reset.');
    flashNotice('Text, contrast, font and motion were reset.');
  });

  $('allsites').addEventListener('change', onAllSitesChange);
}

const getCss = () => buildCss(settings, fontUrls((p) => chrome.runtime.getURL(p)));

// Must be called synchronously from a click: the permission prompt needs the
// gesture, so the request is the first thing that happens.
function enableAllSites(onDenied) {
  const request = requestAllSitesPermission();
  (async () => {
    try {
      const res = await turnAllSitesOn(request, getCss, {
        persist: async (on) => {
          // The button hides once allSites is true; keep keyboard focus in the panel.
          if (on && document.activeElement === $('enable-all')) $('allsites').focus();
          await update({ allSites: on }); // a failed save must abort the enable and roll back
        },
      });
      if (res.failed) {
        onDenied();
        setSticky(
          'perm',
          res.stillGranted
            ? 'Apply on all sites could not be set up, and Chrome still lets AccessEase read and change all sites. You can remove that under Details on chrome://extensions.'
            : 'Apply on all sites could not be set up, so it was not turned on.',
        );
        say('Apply on all sites was not turned on.');
        return;
      }
      if (!res.ok) throw new Error('denied');
      setSticky('perm', res.failedTabs ? 'Other tabs will update when you reload them.' : '');
      say(describeOn(res));
    } catch {
      onDenied();
      setSticky('perm', 'All-sites access was not turned on.');
      say('Apply on all sites was not turned on.');
    }
  })();
}

function onAllSitesChange(e) {
  const box = e.target;
  if (box.checked) {
    enableAllSites(() => {
      box.checked = false;
    });
    return;
  }
  (async () => {
    update({ allSites: false });
    const result = await turnAllSitesOff();
    const msg = describeOff(result);
    setSticky('perm', msg.sticky);
    say(msg.say);
    applyToActiveTab(); // refresh the status line for this tab
  })();
}

// ---------- init ----------
async function init() {
  try {
    settings = await loadSettings();
  } catch {
    settings = defaultSettings();
    setSticky('load', MSG_LOAD);
  }
  try {
    const win = await chrome.windows.getCurrent();
    windowId = win.id;
    const fresh = await reconcileFresh(loadSettings);
    settings = fresh.settings;
    if (settings.allSites && !fresh.ok) {
      settings = await setAllSitesOff();
    }
  } catch {
    // Keep going with what we have.
  }
  bindControls();
  $('enable-all').addEventListener('click', () => enableAllSites(() => {}));
  render();
  // Listeners first, so nothing that happens during the first apply is missed.
  chrome.tabs.onActivated.addListener(({ windowId: w }) => {
    if (windowId != null && w !== windowId) return;
    applyToActiveTab();
  });
  chrome.tabs.onUpdated.addListener((id, info) => {
    if (id === activeTabId && info.status === 'complete') applyToActiveTab();
  });
  chrome.storage.onChanged.addListener(onStorageChanged);
  // Access revoked from chrome://extensions: the service worker clears the setting; refresh the status.
  chrome.permissions.onRemoved.addListener(async () => {
    try {
      const fresh = await reconcileFresh(loadSettings);
      if (fresh.settings.allSites && !fresh.ok) {
        noteOwnSave(echoes, await setAllSitesOff());
      }
      const allSites = fresh.settings.allSites && fresh.ok;
      if (allSites !== settings.allSites) {
        settings = normalize({ ...settings, allSites });
        render();
      }
    } catch {
      // The storage event from the service worker still refreshes us.
    }
    applyToActiveTab();
  });
  await applyToActiveTab();
}

init();
