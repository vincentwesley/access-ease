import test from 'node:test';
import assert from 'node:assert/strict';

// background.js registers its listeners at import time, so import it once with a stub.
const listeners = {};
const ev = (name) => ({ addListener: (fn) => (listeners[name] = fn) });
const st = { granted: false, registered: true, unregisters: 0, allSites: true, textScale: 100, saved: [] };
globalThis.chrome = {
  sidePanel: { setPanelBehavior: async () => {} },
  runtime: { onInstalled: ev('installed'), onStartup: ev('startup') },
  permissions: { onAdded: ev('added'), onRemoved: ev('removed'), contains: async () => st.granted },
  storage: {
    local: {
      get: async () => ({ settings: { v: 1, allSites: st.allSites, textScale: st.textScale } }),
      set: async (o) => {
        st.saved.push(o.settings.allSites);
        st.allSites = o.settings.allSites;
        st.textScale = o.settings.textScale;
      },
    },
  },
  scripting: {
    getRegisteredContentScripts: async () => (st.registered ? [{ id: 'accessease-apply' }] : []),
    unregisterContentScripts: async () => {
      st.unregisters += 1;
      st.registered = false;
    },
    registerContentScripts: async () => {
      st.registered = true;
    },
  },
};
await import('../extension/background.js');

test('all four lifecycle listeners are registered synchronously at top level', () => {
  for (const n of ['installed', 'startup', 'added', 'removed']) assert.equal(typeof listeners[n], 'function', n);
});

test('permission removed from chrome://extensions: the stale content script is unregistered', async () => {
  st.granted = false;
  st.registered = true;
  await listeners.removed({ origins: ['<all_urls>'] });
  assert.equal(st.registered, false);
  assert.equal(st.unregisters, 1);
});

test('permission added while the setting is on: the script is (re)registered', async () => {
  st.granted = true;
  st.registered = false;
  st.allSites = true;
  await listeners.added({ origins: ['<all_urls>'] });
  assert.equal(st.registered, true);
});

test('permission revoked while the setting is on: the setting is written back to off (open panels follow via storage.onChanged)', async () => {
  st.granted = false;
  st.registered = true;
  st.allSites = true;
  st.saved.length = 0;
  await listeners.removed({ origins: ['<all_urls>'] });
  assert.deepEqual(st.saved, [false]);
  assert.equal(st.allSites, false);
});

test('revocation write-back keeps other keys as stored at write time (textScale survives)', async () => {
  st.granted = false;
  st.registered = true;
  st.allSites = true;
  st.textScale = 150;
  st.saved.length = 0;
  await listeners.removed({ origins: ['<all_urls>'] });
  assert.equal(st.allSites, false);
  assert.equal(st.textScale, 150);
});
