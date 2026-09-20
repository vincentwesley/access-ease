import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, defaultSettings, normalize, migrate, SCHEMA_VERSION, setAllSitesOff } from '../extension/lib/settings.js';

test('defaults match the spec schema', () => {
  assert.deepEqual(defaultSettings(), {
    v: 1, textScale: 100, contrast: 'off', dyslexiaFont: false, reduceMotion: false,
    allSites: false,
  });
  assert.ok(Object.isFrozen(DEFAULTS));
});

test('defaultSettings returns an independent copy', () => {
  const a = defaultSettings();
  a.textScale = 200;
  assert.equal(defaultSettings().textScale, 100);
});

test('normalize fills a missing object with defaults', () => {
  assert.deepEqual(normalize(undefined), defaultSettings());
  assert.deepEqual(normalize('junk'), defaultSettings());
  assert.deepEqual(normalize([]), defaultSettings());
});

test('textScale clamps to 100-200 and snaps to step 10', () => {
  assert.equal(normalize({ textScale: 50 }).textScale, 100);
  assert.equal(normalize({ textScale: 999 }).textScale, 200);
  assert.equal(normalize({ textScale: 143 }).textScale, 140);
  assert.equal(normalize({ textScale: 145 }).textScale, 150);
  assert.equal(normalize({ textScale: '130' }).textScale, 130);
  assert.equal(normalize({ textScale: NaN }).textScale, 100);
  assert.equal(normalize({ textScale: 'big' }).textScale, 100);
});

test('enums and booleans are validated', () => {
  assert.equal(normalize({ contrast: 'dark' }).contrast, 'dark');
  assert.equal(normalize({ contrast: 'light' }).contrast, 'light');
  assert.equal(normalize({ contrast: 'neon' }).contrast, 'off');
  assert.equal(normalize({ dyslexiaFont: 'yes' }).dyslexiaFont, false);
  assert.equal(normalize({ reduceMotion: true }).reduceMotion, true);
  assert.equal(normalize({ allSites: 1 }).allSites, false);
});

test('a removed tts key in old stored data is dropped, not an error', () => {
  const m = migrate({ v: 1, textScale: 120, tts: { rate: 1.5, voiceURI: 'x' } });
  assert.equal('tts' in m, false);
  assert.equal(m.textScale, 120);
  assert.equal('tts' in normalize({ tts: 'bad' }), false);
});

test('normalize is idempotent', () => {
  const once = normalize({ textScale: 173, contrast: 'dark' });
  assert.deepEqual(normalize(once), once);
});

test('migrate handles unversioned and old data', () => {
  assert.deepEqual(migrate(undefined), defaultSettings());
  assert.deepEqual(migrate(null), defaultSettings());
  const m = migrate({ textScale: 150, contrast: 'light' });
  assert.equal(m.v, SCHEMA_VERSION);
  assert.equal(m.textScale, 150);
  assert.equal(m.contrast, 'light');
  assert.equal(migrate({ v: 0, dyslexiaFont: true }).dyslexiaFont, true);
});

test('migrate tolerates data from a newer version', () => {
  const m = migrate({ v: 99, textScale: 120, futureThing: true });
  assert.equal(m.v, SCHEMA_VERSION);
  assert.equal(m.textScale, 120);
  assert.equal('futureThing' in m, false);
});

test('migrate returns defaults instead of throwing when a migration step is missing', () => {
  const steps = { 0: (d) => ({ ...d, v: 1 }) }; // no step 1 -> 2
  assert.deepEqual(migrate({ v: 0, textScale: 150 }, steps, 3), defaultSettings());
  assert.deepEqual(migrate({ v: 1, textScale: 150 }, steps, 3), defaultSettings());
  // A complete chain still works.
  const full = { ...steps, 1: (d) => ({ ...d, v: 2 }) };
  assert.equal(migrate({ v: 0, textScale: 150 }, full, 2).textScale, 150);
  assert.doesNotThrow(() => migrate({ v: 1.5 }));
});

test('setAllSitesOff skips the write when allSites is already false', async () => {
  let sets = 0;
  globalThis.chrome = {
    storage: { local: { get: async () => ({ settings: { v: 1, allSites: false } }), set: async () => { sets += 1; } } },
  };
  try {
    const r = await setAllSitesOff();
    assert.equal(r.allSites, false);
    assert.equal(sets, 0);
  } finally {
    delete globalThis.chrome;
  }
});
