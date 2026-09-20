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
//
// pausedHosts (optional): hostnames (canonical: lowercase, no "www.") for which
// AccessEase is paused. If this frame's host, or the top page's host (via
// ancestorOrigins), is listed, all styling is removed instead.
export function applyCssInPage(css, pausedHosts) {
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
    // Leaf-text markers set by tagLeaves() below.
    if (doc.body) {
      for (const n of doc.body.querySelectorAll('[data-ae-s]')) {
        if (typeof n.removeAttribute === 'function') n.removeAttribute('data-ae-s');
      }
    }
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

  if (Array.isArray(pausedHosts) && pausedHosts.length) {
    const key = (h) => String(h || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    const hosts = [location.hostname];
    try {
      const ao = location.ancestorOrigins;
      if (ao && ao.length) hosts.push(new URL(ao[ao.length - 1]).hostname);
    } catch {
      // No ancestor info: the frame's own host is used.
    }
    if (hosts.some((h) => pausedHosts.includes(key(h)))) css = '';
  }

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

  // Leaf text (div/span/a/... with only text inside) sized in px does not follow
  // the root change and is not covered by the floor block. Measure such leaves
  // (with our styling out of the way), then tag the ones that did NOT grow
  // with their original size, bucketed, and scale each bucket by the factor.
  // Conservative: small leaves only, skips clipped/ellipsised boxes and icon
  // elements, and looks at a bounded number of elements. See DECISIONS.md.
  const LEAF_MAX = 3000;
  const BUCKETS_MAX = 24;
  const leaves = doc.body
    ? [...doc.body.querySelectorAll('div,span,a,strong,b,em,small')]
        .slice(0, LEAF_MAX)
        .filter(
          (el) =>
            el.childElementCount === 0 &&
            typeof el.textContent === 'string' &&
            el.textContent.trim() !== '' &&
            typeof el.setAttribute === 'function' &&
            !/icon|(^|[\s-])fa-|material|glyph/i.test(String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '')),
        )
    : [];
  const leafBefore = leaves.map(px);
  const tagLeaves = () => {
    const sizes = new Set();
    const rules = [];
    leaves.forEach((el, i) => {
      const o = leafBefore[i];
      if (!(o > 0) || o > 32 || px(el) >= o * (1 + (factor - 1) / 2)) return; // grew already
      const cs = getComputedStyle(el);
      const clip = (v) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
      if (clip(cs.overflowX) || clip(cs.overflowY) || cs.textOverflow === 'ellipsis') return;
      const key = String(round1(o));
      if (!sizes.has(key)) {
        if (sizes.size >= BUCKETS_MAX) return;
        sizes.add(key);
        rules.push(`body [data-ae-s="${key}"]{font-size:${round1(o * factor)}px !important}`);
      }
      el.setAttribute('data-ae-s', key);
    });
    return rules.join('\n');
  };

  write(resolve(false));
  let withFloor = false;
  if (positive.length) {
    // Did sampled text follow the root change? If most did not, the site sizes
    // text in px, so add the floor that lifts body text.
    const grew = samples.filter((el, i) => before[i] > 0 && px(el) >= before[i] * (1 + (factor - 1) / 2)).length;
    if (grew < positive.length / 2) {
      withFloor = true;
      write(resolve(true));
    }
  }
  const leafRules = tagLeaves();
  if (leafRules) write(`${resolve(withFloor)}\n${leafRules}`);
  return true;
}
