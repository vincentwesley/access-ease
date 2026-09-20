import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureConsistent,
  reconcileFresh,
  disableAllSites,
  registerApplyScript,
  hasAllSitesPermission,
  SCRIPT_ID,
} from '../extension/lib/allsites.js';

// A stub of the chrome.permissions / chrome.scripting surface used by allsites.js.
function installChrome({ granted = false, registered = false, removeWorks = true } = {}) {
  const st = { granted, registered, removes: 0, registers: 0, unregisters: 0 };
  globalThis.chrome = {
    permissions: {
      contains: async () => st.granted,
      request: async () => (st.granted = true),
      remove: async () => {
        st.removes += 1;
        if (removeWorks) st.granted = false;
        return removeWorks;
      },
    },
    scripting: {
      getRegisteredContentScripts: async ({ ids } = {}) =>
        st.registered && (!ids || ids.includes(SCRIPT_ID)) ? [{ id: SCRIPT_ID }] : [],
      registerContentScripts: async (list) => {
        st.registers += 1;
        assert.equal(list[0].id, SCRIPT_ID);
        assert.deepEqual(list[0].js, ['content/apply.js']);
        st.registered = true;
      },
      unregisterContentScripts: async () => {
        st.unregisters += 1;
        st.registered = false;
      },
    },
  };
  return st;
}

beforeEach(() => installChrome());
afterEach(() => delete globalThis.chrome);

test('setting on + permission granted: registers the script when missing and returns true', async () => {
  const st = installChrome({ granted: true, registered: false });
  assert.equal(await ensureConsistent(true), true);
  assert.equal(st.registered, true);
  assert.equal(st.registers, 1);
});

test('setting on + permission granted + already registered: leaves it alone', async () => {
  const st = installChrome({ granted: true, registered: true });
  assert.equal(await ensureConsistent(true), true);
  assert.equal(st.registers, 0);
  assert.equal(st.unregisters, 0);
});

test('setting on but permission revoked: unregisters and returns false', async () => {
  const st = installChrome({ granted: false, registered: true });
  assert.equal(await ensureConsistent(true), false);
  assert.equal(st.registered, false);
});

test('setting OFF but permission still granted: still unregisters (the review bug)', async () => {
  const st = installChrome({ granted: true, registered: true });
  assert.equal(await ensureConsistent(false), false);
  assert.equal(st.registered, false, 'a stale script must not keep restyling every site');
  assert.equal(st.granted, true, 'permission itself is untouched here');
});

test('setting off, nothing granted, nothing registered: no-op', async () => {
  const st = installChrome();
  assert.equal(await ensureConsistent(false), false);
  assert.equal(st.unregisters, 0);
});

test('registerApplyScript replaces an existing registration instead of failing on a duplicate id', async () => {
  const st = installChrome({ granted: true, registered: true });
  await registerApplyScript();
  assert.equal(st.unregisters, 1);
  assert.equal(st.registers, 1);
});

test('disableAllSites unregisters then removes the permission', async () => {
  const st = installChrome({ granted: true, registered: true });
  await disableAllSites();
  assert.equal(st.registered, false);
  assert.equal(st.removes, 1);
  assert.equal(await hasAllSitesPermission(), false);
});

test('when Chrome refuses to remove the permission, hasAllSitesPermission reports the truth', async () => {
  installChrome({ granted: true, registered: true, removeWorks: false });
  await disableAllSites();
  assert.equal(await hasAllSitesPermission(), true);
});

test('reconcileFresh: re-reads settings and reconciles again if allSites changed mid-way (a panel enabling concurrently)', async () => {
  const st = installChrome({ granted: true, registered: false });
  let reads = 0;
  const load = async () => (reads++ === 0 ? { allSites: false } : { allSites: true });
  const { settings, ok } = await reconcileFresh(load);
  assert.equal(settings.allSites, true);
  assert.equal(ok, true);
  assert.equal(st.registered, true, 'the stale unregister did not win');
});

test('registerApplyScript: losing a register race (duplicate id) counts as success when the script is registered', async () => {
  const st = installChrome({ granted: true, registered: false });
  globalThis.chrome.scripting.registerContentScripts = async () => {
    st.registered = true; // the other context won
    throw new Error("Duplicate script ID 'accessease-apply'");
  };
  await registerApplyScript();
  assert.equal(st.registered, true);
});

test('registerApplyScript: a real failure (nothing registered) still rejects', async () => {
  installChrome({ granted: true, registered: false });
  globalThis.chrome.scripting.registerContentScripts = async () => {
    throw new Error('boom');
  };
  await assert.rejects(registerApplyScript(), /boom/);
});
