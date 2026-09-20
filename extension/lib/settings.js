// Settings schema, validation, migration and storage. Pure except load/save.

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'settings';

export const LIMITS = Object.freeze({
  textScale: Object.freeze({ min: 100, max: 200, step: 10 }),
});

export const CONTRAST_VALUES = Object.freeze(['off', 'dark', 'light']);

export const DEFAULTS = Object.freeze({
  v: SCHEMA_VERSION,
  textScale: 100,
  contrast: 'off',
  dyslexiaFont: false,
  reduceMotion: false,
  allSites: false,
});

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function clampStep(value, { min, max, step }, fallback, decimals) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Number(Math.min(max, snapped).toFixed(decimals));
}

export function defaultSettings() {
  return { ...DEFAULTS };
}

/** Coerce any value into a complete, valid settings object at the current version.
 *  Unknown keys are dropped, so old stored data with a removed `tts` key is tolerated. */
export function normalize(raw) {
  const src = isObject(raw) ? raw : {};
  return {
    v: SCHEMA_VERSION,
    textScale: clampStep(src.textScale, LIMITS.textScale, DEFAULTS.textScale, 0),
    contrast: CONTRAST_VALUES.includes(src.contrast) ? src.contrast : DEFAULTS.contrast,
    dyslexiaFont: src.dyslexiaFont === true,
    reduceMotion: src.reduceMotion === true,
    allSites: src.allSites === true,
  };
}

// MIGRATIONS[n] upgrades a version-n object to version n+1.
const MIGRATIONS = {
  // Unversioned data has the same shape; just stamp it.
  0: (d) => ({ ...d, v: 1 }),
};

/** Upgrade stored data of any older version, then normalize. */
// `steps` and `target` are parameters only so tests can exercise a missing step.
export function migrate(raw, steps = MIGRATIONS, target = SCHEMA_VERSION) {
  if (!isObject(raw)) return defaultSettings();
  let data = { ...raw };
  let v = Number.isInteger(data.v) && data.v >= 0 ? data.v : 0;
  while (v < target) {
    const step = steps[v];
    if (typeof step !== 'function') return defaultSettings(); // unknown/gap: safe defaults
    data = step(data);
    v += 1;
  }
  // Data from a newer version: keep whatever we understand.
  return normalize(data);
}

export async function loadSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return migrate(stored[STORAGE_KEY]);
}

export async function saveSettings(settings) {
  const clean = normalize(settings);
  await chrome.storage.local.set({ [STORAGE_KEY]: clean });
  return clean;
}

/** Load -> merge -> save at write time, so a concurrent edit to other keys is never reverted. */
export async function setAllSitesOff() {
  const current = await loadSettings();
  if (!current.allSites) return current; // nothing to change: no write, no echo
  return saveSettings({ ...current, allSites: false });
}
