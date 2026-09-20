// Runs INSIDE web pages. Must stay fully self-contained (no imports, no closures):
// it is passed to chrome.scripting.executeScript and also imported by the
// content script. Pass '' to remove all AccessEase styling. Idempotent.
//
// Uses a constructable stylesheet (adoptedStyleSheets) so strict page CSP
// (style-src without 'unsafe-inline') cannot block it; falls back to <style>.
//
// It also resolves the text-size tokens emitted by lib/css.js
// (__AE_ROOT(N)__, __AE_BASE(N)__ and the AE_FLOOR block) against the page's
// ORIGINAL computed font sizes, measured with our own styling removed. See the
// header of lib/css.js.
export function applyCssInPage(css) {
  const KEY = '__accessEaseStyle';
  const ID = 'accessease-style';
  const state = window[KEY] || (window[KEY] = { sheet: null });
  const doc = document;

  const removeAll = () => {
    if (state.sheet && 'adoptedStyleSheets' in doc) {
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== state.sheet);
    }
    state.sheet = null;
    const el = doc.getElementById(ID);
    if (el) el.remove();
  };

  const write = (text) => {
    if ('adoptedStyleSheets' in doc && typeof CSSStyleSheet === 'function') {
      try {
        if (!state.sheet) state.sheet = new CSSStyleSheet();
        state.sheet.replaceSync(text);
        if (!doc.adoptedStyleSheets.includes(state.sheet)) {
          doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, state.sheet];
        }
        const stale = doc.getElementById(ID);
        if (stale) stale.remove();
        return;
      } catch {
        // Do not leave an orphaned sheet (with stale rules) adopted, then fall
        // through to <style>.
        if (state.sheet) doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== state.sheet);
        state.sheet = null;
      }
    }
    let el = doc.getElementById(ID);
    if (!el) {
      el = doc.createElement('style');
      el.id = ID;
      (doc.head || doc.documentElement).appendChild(el);
    }
    el.textContent = text;
  };

  if (!css) {
    removeAll();
    return true;
  }

  const text = String(css);
  const scaleMatch = /__AE_ROOT\((\d+)\)__/.exec(text);
  if (!scaleMatch) {
    write(text);
    return true;
  }

  // Measure the page's own sizes with our styling out of the way. Removal and
  // re-adding happen in one task, so nothing is painted in between.
  removeAll();
  const factor = Number(scaleMatch[1]) / 100;
  const px = (el) => parseFloat(getComputedStyle(el).fontSize) || 0;
  const round1 = (n) => Math.round(n * 10) / 10;
  const rootPx = px(doc.documentElement) || 16;
  const samples = doc.body
    ? [...doc.body.querySelectorAll('p,li,dd,dt,td,blockquote')].slice(0, 12)
    : [];
  const before = samples.map(px);
  const positive = before.filter((n) => n > 0).sort((a, b) => a - b);
  const base = positive.length ? positive[Math.floor(positive.length / 2)] : rootPx;
  const resolve = (withFloor) =>
    text
      .replace(/\/\*AE_FLOOR_START\*\/[\s\S]*?\/\*AE_FLOOR_END\*\//g, (m) => (withFloor ? m : ''))
      .replace(/__AE_ROOT\(\d+\)__/g, `${round1(rootPx * factor)}px`)
      .replace(/__AE_BASE\(\d+\)__/g, `${round1(base * factor)}px`);

  write(resolve(false));
  if (positive.length) {
    // Did sampled text follow the root change? If most did not, the site sizes
    // text in px, so add the floor that lifts body text.
    const grew = samples.filter((el, i) => before[i] > 0 && px(el) >= before[i] * (1 + (factor - 1) / 2)).length;
    if (grew < positive.length / 2) write(resolve(true));
  }
  return true;
}
