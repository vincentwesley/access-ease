import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStickyNotices,
  sweepTabs,
  turnAllSitesOff,
  turnAllSitesOn,
  describeOff,
  describeOn,
  adoptExternalSettings,
  noteOwnSave,
  consumeEcho,
  isProtectedError,
} from '../extension/lib/panel-logic.js';
import { defaultSettings, normalize } from '../extension/lib/settings.js';

// chrome stub. tabs: [{ id, url?, fail?: 'discarded' | 'protected' }]
function installChrome({ tabs = [], granted = true, registered = false, removeWorks = true, queryFails = false } = {}) {
  const log = [];
  const st = { granted, registered, log };
  globalThis.chrome = {
    tabs: {
      query: async () => {
        if (queryFails) throw new Error('no tabs');
        return tabs;
      },
    },
    scripting: {
      executeScript: async ({ target, args }) => {
        const tab = tabs.find((t) => t.id === target.tabId);
        log.push(['exec', target.tabId, args[0]]);
        if (tab && tab.fail === 'discarded') throw new Error('The tab was closed.');
        if (tab && tab.fail === 'protected') throw new Error('Cannot access a chrome:// URL');
        return [{ result: true }];
      },
      getRegisteredContentScripts: async () => (st.registered ? [{ id: 'accessease-apply' }] : []),
      registerContentScripts: async () => {
        log.push(['register']);
        st.registered = true;
      },
      unregisterContentScripts: async () => {
        log.push(['unregister']);
        st.registered = false;
      },
    },
    permissions: {
      contains: async () => st.granted,
      remove: async () => {
        log.push(['remove']);
        if (removeWorks) st.granted = false;
        return removeWorks;
      },
    },
  };
  return st;
}
afterEach(() => delete globalThis.chrome);

const execs = (st) => st.log.filter((l) => l[0] === 'exec');

test('sticky notices: several keys join, empty text removes, callback reports count', () => {
  const seen = [];
  const s = createStickyNotices((text, n) => seen.push([text, n]));
  s.set('save', 'A');
  s.set('perm', 'B');
  assert.equal(s.text, 'A B');
  s.set('save', '');
  assert.equal(s.text, 'B');
  s.set('perm', '');
  assert.equal(s.size, 0);
  assert.deepEqual(seen.at(-1), ['', 0]);
});

test('isProtectedError recognises Chrome wording for unscriptable pages', () => {
  assert.equal(isProtectedError(new Error('Cannot access a chrome:// URL')), true);
  assert.equal(isProtectedError(new Error('The extensions gallery cannot be scripted.')), true);
  assert.equal(isProtectedError(new Error('The tab was closed.')), false);
});

test('sweepTabs: skips the given tab, and separates protected pages from real failures', async () => {
  const st = installChrome({
    tabs: [{ id: 1 }, { id: 2, fail: 'discarded' }, { id: 3, fail: 'protected' }, { id: 4, url: 'https://x.test/a.pdf', fail: 'discarded' }],
  });
  const r = await sweepTabs('css', { skipTabId: 1 });
  assert.deepEqual(execs(st).map((e) => e[1]).sort(), [2, 3, 4]);
  assert.equal(r.failed, 1, 'only the discarded tab is a real failure (3 is browser-protected, 4 is a pdf)');
});

test('sweepTabs: a failing tabs.query is reported as unknown, not as success', async () => {
  installChrome({ queryFails: true });
  const r = await sweepTabs('');
  assert.equal(r.unknown, true);
});

test('REGRESSION C1: turning all-sites OFF clears the ACTIVE tab too, and does it BEFORE permissions.remove', async () => {
  const st = installChrome({ tabs: [{ id: 1 }, { id: 2 }] }); // tab 1 is the active one
  const r = await turnAllSitesOff();
  const order = st.log.map((l) => (l[0] === 'exec' ? `exec${l[1]}:${JSON.stringify(l[2])}` : l[0]));
  assert.ok(order.includes('exec1:""'), 'active tab cleared');
  assert.ok(order.includes('exec2:""'), 'other tab cleared');
  assert.ok(order.indexOf('exec1:""') < order.indexOf('remove'), 'cleared while the permission is still held');
  assert.ok(order.indexOf('exec2:""') < order.indexOf('remove'));
  assert.deepEqual(r, { failedTabs: 0, stillGranted: false });
  assert.equal(describeOff(r).say, 'Apply on all sites is off. Other tabs are back to normal.');
});

test('turning all-sites OFF reports unreachable tabs honestly', async () => {
  installChrome({ tabs: [{ id: 1 }, { id: 2, fail: 'discarded' }] });
  const r = await turnAllSitesOff();
  assert.equal(r.failedTabs, 1);
  const d = describeOff(r);
  assert.match(d.say, /may need a reload/);
  assert.match(d.sticky, /may need a reload/);
});

test('turning all-sites OFF when Chrome keeps the permission says so (never claims success)', async () => {
  installChrome({ tabs: [{ id: 1 }], removeWorks: false });
  const r = await turnAllSitesOff();
  assert.equal(r.stillGranted, true);
  const d = describeOff(r);
  assert.match(d.sticky, /still lets AccessEase read and change all sites/);
  assert.match(d.say, /still has access/);
});

test('REGRESSION C3: turning all-sites ON registers the script, then styles already-open tabs right away', async () => {
  const st = installChrome({ granted: false, tabs: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  let cssCalls = 0;
  const r = await turnAllSitesOn(Promise.resolve(true), () => (cssCalls++, 'THE-CSS'));
  assert.equal(r.ok, true);
  assert.equal(cssCalls, 1, 'css computed after the grant');
  const order = st.log.map((l) => l[0]);
  assert.equal(order[0], 'register');
  assert.deepEqual(execs(st).map((e) => [e[1], e[2]]), [[1, 'THE-CSS'], [2, 'THE-CSS'], [3, 'THE-CSS']]);
  assert.equal(describeOn(r), 'Apply on all sites is on.');
});

test('turning all-sites ON: tabs that cannot be reached get the honest "reload" message', async () => {
  installChrome({ tabs: [{ id: 1 }, { id: 2, fail: 'discarded' }] });
  const r = await turnAllSitesOn(Promise.resolve(true), () => 'css');
  assert.equal(r.failedTabs, 1);
  assert.equal(describeOn(r), 'Apply on all sites is on. Other tabs will update when you reload them.');
});

test('turning all-sites ON when the prompt is denied does nothing else', async () => {
  const st = installChrome({ granted: false, tabs: [{ id: 1 }] });
  const r = await turnAllSitesOn(Promise.resolve(false), () => 'css');
  assert.equal(r.ok, false);
  assert.deepEqual(st.log, []);
});

test('adoptExternalSettings: another window changed a setting -> adopt; echo, equal or in-flight -> ignore', () => {
  const current = normalize({ textScale: 120 });
  const theirs = { ...current, textScale: 150, contrast: 'dark' };
  assert.equal(adoptExternalSettings(current, theirs, 0).textScale, 150);
  assert.equal(adoptExternalSettings(current, current, 0), null, 'same value: no feedback loop');
  assert.equal(adoptExternalSettings(current, theirs, 1), null, 'our own saves are still in flight');
  assert.deepEqual(adoptExternalSettings(current, undefined, 0), defaultSettings(), 'removed key -> defaults');
  assert.equal(adoptExternalSettings(current, { textScale: 999 }, 0).textScale, 200, 'normalized');
});

test('a late echo of an older own save never reverts a newer local value', () => {
  const echoes = [];
  const older = normalize({ textScale: 120 });
  const newer = normalize({ textScale: 140 });
  noteOwnSave(echoes, older);
  noteOwnSave(echoes, newer);
  // pending saves already drained (0) but the older echo arrives late
  assert.equal(adoptExternalSettings(newer, older, 0, echoes), null);
  assert.equal(adoptExternalSettings(newer, newer, 0, echoes), null);
  assert.deepEqual(echoes, [], 'echoes consumed');
  // the same value from another window afterwards is a real external change
  assert.equal(adoptExternalSettings(newer, older, 0, echoes).textScale, 120);
  assert.equal(consumeEcho([], older), false);
});

test('turning all-sites ON persists allSites before registering, so a reconcile racing the grant cannot undo it', async () => {
  const st = installChrome({ tabs: [{ id: 1 }], granted: true });
  const persisted = [];
  const order = [];
  const origRegister = globalThis.chrome.scripting.registerContentScripts;
  globalThis.chrome.scripting.registerContentScripts = async (...a) => { order.push('register'); return origRegister(...a); };
  const r = await turnAllSitesOn(Promise.resolve(true), () => 'css', {
    persist: async (on) => { persisted.push(on); order.push('persist'); },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(persisted, [true]);
  assert.deepEqual(order.slice(0, 2), ['persist', 'register']);
  assert.equal(st.registered, true);
});

test('turning all-sites ON: if registering fails after the grant, roll back the setting and the permission', async () => {
  const st = installChrome({ tabs: [{ id: 1 }], granted: true });
  globalThis.chrome.scripting.registerContentScripts = async () => { throw new Error('boom'); };
  const persisted = [];
  const r = await turnAllSitesOn(Promise.resolve(true), () => 'css', { persist: async (on) => { persisted.push(on); } });
  assert.equal(r.ok, false);
  assert.equal(r.failed, true);
  assert.equal(r.stillGranted, false);
  assert.deepEqual(persisted, [true, false]);
  assert.equal(st.granted, false);
});

test('turning all-sites ON: if saving the setting fails, nothing is left registered and the permission is removed', async () => {
  const st = installChrome({ tabs: [{ id: 1 }], granted: true });
  const calls = [];
  const r = await turnAllSitesOn(Promise.resolve(true), () => 'css', {
    persist: async (on) => {
      calls.push(on);
      if (on) throw new Error('storage full');
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.failed, true);
  assert.deepEqual(calls, [true, false]);
  assert.equal(st.registered, false, 'never registered');
  assert.equal(st.granted, false);
});

test('adoptExternalSettings: a background allSites change is adopted even while our own save is in flight', () => {
  const current = normalize({ textScale: 120, allSites: true });
  const theirs = { ...current, allSites: false };
  const next = adoptExternalSettings(current, theirs, 1, []);
  assert.equal(next.allSites, false);
  assert.equal(next.textScale, 120, 'only allSites is taken while saves are pending');
});
