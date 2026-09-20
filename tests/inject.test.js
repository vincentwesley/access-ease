import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyCssInPage } from '../extension/lib/inject.js';
import { buildCss } from '../extension/lib/css.js';
import { normalize } from '../extension/lib/settings.js';

// A tiny fake page. Element sizes are computed from the CSS we applied, so the
// measure -> resolve -> re-measure logic of applyCssInPage is exercised for real.
//   rootBase: original root font-size in px (10 for the html{font-size:62.5%} trick)
//   paras:    [{ px }] fixed-size text, or [{ rel }] text sized in rem (rel * root)
function makeEnv({ rootBase = 16, paras = [{ px: 14 }], withBody = true, adopted = true, replaceThrows = false } = {}) {
  let throwing = replaceThrows;
  const styleEls = [];
  const html = { name: 'html' };
  const body = { name: 'body', querySelectorAll: () => paras };
  const appliedText = () => {
    const parts = [];
    for (const s of doc.adoptedStyleSheets || []) parts.push(s.text);
    for (const e of styleEls) parts.push(e.textContent);
    return parts.join('\n');
  };
  const rootPx = () => {
    const m = /html\{font-size:([\d.]+)px/.exec(appliedText());
    return m ? Number(m[1]) : rootBase;
  };
  const floorPx = () => {
    const m = /max\(1em,([\d.]+)px\)/.exec(appliedText());
    return m ? Number(m[1]) : 0;
  };
  const size = (el) => {
    if (el === html) return rootPx();
    if (el === body) return rootPx() * 1; // body inherits the root size
    return Math.max(el.rel ? el.rel * rootPx() : el.px, floorPx());
  };
  const doc = {
    documentElement: html,
    body: withBody ? body : null,
    head: { appendChild: (el) => styleEls.push(el) },
    getElementById: (id) => styleEls.find((e) => e.id === id) || null,
    createElement: () => {
      const el = { id: '', textContent: '' };
      el.remove = () => styleEls.splice(styleEls.indexOf(el), 1);
      return el;
    },
  };
  if (adopted) doc.adoptedStyleSheets = [];

  globalThis.window = {};
  globalThis.document = doc;
  globalThis.CSSStyleSheet = class {
    replaceSync(t) {
      if (throwing) throw new Error('blocked');
      this.text = t;
    }
  };
  globalThis.getComputedStyle = (el) => ({ fontSize: `${size(el)}px` });
  return { doc, styleEls, appliedText, size, html, body, paras, setThrowing: (b) => { throwing = b; } };
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.CSSStyleSheet;
  delete globalThis.getComputedStyle;
});

const scaleCss = (n) => buildCss(normalize({ textScale: n }));

test('plain css goes into one adopted sheet, repeated calls do not stack', () => {
  const env = makeEnv();
  assert.equal(applyCssInPage('body{color:red}'), true);
  applyCssInPage('body{color:blue}');
  assert.equal(env.doc.adoptedStyleSheets.length, 1);
  assert.equal(env.doc.adoptedStyleSheets[0].text, 'body{color:blue}');
});

test("empty css removes everything, including a stale <style>", () => {
  const env = makeEnv();
  applyCssInPage('a{color:red}');
  const stale = env.doc.createElement();
  stale.id = 'accessease-style';
  env.styleEls.push(stale);
  assert.equal(applyCssInPage(''), true);
  assert.equal(env.doc.adoptedStyleSheets.length, 0);
  assert.equal(env.styleEls.length, 0);
});

test('falls back to a <style> element when adoptedStyleSheets is unavailable', () => {
  const env = makeEnv({ adopted: false });
  applyCssInPage('a{color:red}');
  applyCssInPage('a{color:green}');
  assert.equal(env.styleEls.length, 1);
  assert.equal(env.styleEls[0].textContent, 'a{color:green}');
  applyCssInPage('');
  assert.equal(env.styleEls.length, 0);
});

test('falls back to <style> when the constructable sheet throws', () => {
  const env = makeEnv({ replaceThrows: true });
  applyCssInPage('a{color:red}');
  assert.equal(env.styleEls.length, 1);
  assert.equal(env.doc.adoptedStyleSheets.length, 0);
});

test('html{font-size:62.5%} site: 150% gives an absolute root of 1.5x the ORIGINAL size, no floor', () => {
  const env = makeEnv({ rootBase: 10, paras: [{ rel: 1.4 }, { rel: 1.2 }] });
  applyCssInPage(scaleCss(150));
  const text = env.appliedText();
  assert.match(text, /html\{font-size:15px !important\}/);
  assert.doesNotMatch(text, /AE_FLOOR|__AE_/, 'floor stripped, tokens resolved');
  assert.doesNotMatch(text, /max\(1em/);
  assert.equal(env.size(env.paras[0]), 21); // 14px -> 21px = 1.5x
  assert.equal(env.size(env.paras[1]), 18); // small print 12px -> 18px = 1.5x
});

test('px-sized site: root scales and a floor lifts body text by the scale', () => {
  const env = makeEnv({ rootBase: 16, paras: [{ px: 14 }, { px: 14 }, { px: 14 }] });
  applyCssInPage(scaleCss(150));
  const text = env.appliedText();
  assert.match(text, /html\{font-size:24px !important\}/);
  assert.match(text, /max\(1em,21px\)/);
  assert.equal(env.size(env.paras[0]), 21);
});

test('re-applying re-measures the original size (does not compound)', () => {
  const env = makeEnv({ rootBase: 16, paras: [{ rel: 1 }] });
  applyCssInPage(scaleCss(150));
  applyCssInPage(scaleCss(150));
  applyCssInPage(scaleCss(120));
  assert.match(env.appliedText(), /html\{font-size:19.2px !important\}/);
  applyCssInPage(scaleCss(150)); // rounds to one decimal
  assert.match(env.appliedText(), /html\{font-size:24px !important\}/);
});

test('before <body> exists (document_start) it still applies the root size and does not throw', () => {
  const env = makeEnv({ withBody: false });
  applyCssInPage(scaleCss(150));
  assert.match(env.appliedText(), /html\{font-size:24px !important\}/);
  assert.doesNotMatch(env.appliedText(), /max\(1em/);
});

test('when replaceSync starts throwing, the already-adopted sheet is removed (no stale rules) and <style> takes over', () => {
  const env = makeEnv();
  applyCssInPage('a{color:red}');
  assert.equal(env.doc.adoptedStyleSheets.length, 1);
  env.setThrowing(true);
  applyCssInPage('a{color:green}');
  assert.equal(env.doc.adoptedStyleSheets.length, 0, 'orphaned sheet removed');
  assert.equal(env.styleEls.length, 1);
  assert.equal(env.styleEls[0].textContent, 'a{color:green}');
  assert.doesNotMatch(env.appliedText(), /red/);
});
