import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCss, fontUrls } from '../extension/lib/css.js';
import { defaultSettings, normalize } from '../extension/lib/settings.js';

const fonts = { fontUrlRegular: 'chrome-extension://x/fonts/R.woff2', fontUrlBold: 'chrome-extension://x/fonts/B.woff2' };
const css = (patch) => buildCss(normalize({ ...defaultSettings(), ...patch }), fonts);

test('all defaults produce empty CSS', () => {
  assert.equal(buildCss(defaultSettings(), fonts), '');
  assert.equal(buildCss(undefined), '');
  assert.equal(buildCss({}), '');
});

test('text scale emits root/base tokens (resolved in-page), never a percentage', () => {
  const c = css({ textScale: 150 });
  assert.match(c, /html\{font-size:__AE_ROOT\(150\)__ !important\}/);
  assert.match(c, /AE_FLOOR_START\*\/body :is\([^)]*\)\{font-size:max\(1em,__AE_BASE\(150\)__\) !important\}/);
  assert.match(c, /AE_FLOOR_END\*\//);
  assert.doesNotMatch(c, /font-size:\d+%/);
  assert.doesNotMatch(c, /max\(1rem/);
  assert.doesNotMatch(css({ textScale: 100 }), /font-size/);
});

test('contrast modes set colours and never use filter', () => {
  const dark = css({ contrast: 'dark' });
  assert.match(dark, /background-color:#000000 !important/);
  assert.match(dark, /color:#ffffff !important/);
  const light = css({ contrast: 'light' });
  assert.match(light, /background-color:#ffffff !important/);
  assert.match(light, /color:#000000 !important/);
  for (const c of [dark, light]) {
    assert.doesNotMatch(c, /filter/);
    assert.match(c, /a:any-link/);
    assert.match(c, /a:visited/);
    assert.match(c, /:not\(img\)/);
    assert.match(c, /:not\(video\)/);
  }
});

test('contrast: button-like elements get a 2px border in the foreground colour', () => {
  for (const [mode, fg] of [['dark', '#ffffff'], ['light', '#000000']]) {
    const c = css({ contrast: mode });
    assert.ok(c.includes(`{border:2px solid ${fg} !important}`));
    assert.match(c, /a\[class\*="btn" i\]/);
    assert.match(c, /\[role="button"\]/);
  }
});

test('contrast: pseudo-elements get the foreground colour, never a background', () => {
  const c = css({ contrast: 'dark' });
  assert.match(c, /body \*::before,body \*::after\{color:#ffffff !important\}/);
  assert.doesNotMatch(c, /::(before|after)[^{]*\{[^}]*background/);
});

test('dyslexia font recolours nothing but only spares icon <i>, not genuine italics', () => {
  const c = css({ dyslexiaFont: true });
  assert.match(c, /:not\(i\[class\]\)/);
  assert.doesNotMatch(c, /:not\(i\):/);
});

test('dyslexia font adds font-faces, family, spacing and line-height', () => {
  const c = css({ dyslexiaFont: true });
  assert.match(c, /@font-face/);
  assert.ok(c.includes(fonts.fontUrlRegular));
  assert.ok(c.includes(fonts.fontUrlBold));
  assert.match(c, /font-family:"AccessEase OpenDyslexic"/);
  assert.match(c, /word-spacing:\.05em/);
  assert.match(c, /line-height:1\.6/);
});

test('dyslexia font without URLs still emits family rules, no @font-face', () => {
  const c = buildCss(normalize({ dyslexiaFont: true }));
  assert.doesNotMatch(c, /@font-face/);
  assert.match(c, /font-family/);
});

test('reduce motion removes animation, transition and smooth scroll', () => {
  const c = css({ reduceMotion: true });
  assert.match(c, /animation-duration:\.001ms !important/);
  assert.match(c, /transition-duration:0s !important/);
  assert.match(c, /scroll-behavior:auto !important/);
});

test('options only add their own rules', () => {
  assert.doesNotMatch(css({ reduceMotion: true }), /font-family|background-color|html\{font-size/);
  assert.doesNotMatch(css({ contrast: 'dark' }), /animation|@font-face/);
});

test('output is deterministic (idempotent)', () => {
  const s = { textScale: 130, contrast: 'dark', dyslexiaFont: true, reduceMotion: true };
  assert.equal(css(s), css(s));
});

test('fontUrls uses the provided resolver', () => {
  const u = fontUrls((p) => `ext://${p}`);
  assert.equal(u.fontUrlRegular, 'ext://fonts/OpenDyslexic-Regular.woff2');
  assert.equal(u.fontUrlBold, 'ext://fonts/OpenDyslexic-Bold.woff2');
});

test('dyslexia mode changes line-height and word-spacing only, never letter-spacing', () => {
  const c = css({ dyslexiaFont: true });
  assert.doesNotMatch(c, /letter-spacing/);
  assert.match(c, /line-height:1\.6 !important/);
});

test('floor block has heading floors (h1 1.6, h2 1.35, h3 1.2, h4-h6 1.05) and input height:auto', () => {
  const c = css({ textScale: 150 });
  const floor = c.slice(c.indexOf('AE_FLOOR_START'), c.indexOf('AE_FLOOR_END'));
  for (const [sel, m] of [['h1', 1.6], ['h2', 1.35], ['h3', 1.2], ['h4,h5,h6', 1.05]]) {
    assert.ok(floor.includes(`body :is(${sel}){font-size:max(1em,calc(__AE_BASE(150)__ * ${m})) !important}`), sel);
  }
  assert.ok(floor.includes('body :is(input,textarea,select){height:auto !important}'));
  // all of it is inside the strippable block, so rem/em sites never get it
  assert.equal((c.match(/AE_FLOOR_START/g) || []).length, 1);
  assert.doesNotMatch(c.slice(c.indexOf('AE_FLOOR_END')), /height:auto|h1/);
});

test('contrast: background images are removed from button-like and badge/chip/pill/tag elements', () => {
  const c = css({ contrast: 'dark' });
  assert.match(c, /\[class\*="badge" i\],\[class\*="chip" i\],\[class\*="pill" i\],\[class~="tag" i\]\)\{background-image:none !important\}/);
  assert.match(c, /a\[class\*="btn" i\][^{]*\{background-image:none/);
  // photos and page backgrounds are not blanket-cleared
  assert.doesNotMatch(c, /body \*[^{]*\{[^}]*background-image/);
});

test('contrast: invalid fields are exempt from the solid border and get a dashed outline instead', () => {
  for (const [mode, fg] of [['dark', '#ffffff'], ['light', '#000000']]) {
    const c = css({ contrast: mode });
    assert.match(c, /:not\(:invalid\):not\(\[aria-invalid="true"\]\)\{border:2px solid/);
    assert.ok(c.includes(`:invalid,body [aria-invalid="true"]{outline:2px dashed ${fg} !important`));
  }
});
