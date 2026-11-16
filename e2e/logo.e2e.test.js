// The draggable Vin's Atelier logo in the side panel's sign-off morphs between three forms (short </>, middle </in>,
// long </Atelier>), driven by one CSS variable, --logo-x. Locators are scoped to the sign-off. No real network: vwesley.dev is stubbed.
// Separate from extension.e2e.test.js so it does not rewrite docs/e2e-report.md or the screenshots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { launchWithExtension, EXT_DIR } from './helpers.mjs';

const X = { short: 540, middle: 734, long: 1491.4 };
const SIGN = '.studio-signoff';
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    if (Date.now() > end) throw new Error(`timed out waiting (last: ${last})`);
    await new Promise((r) => setTimeout(r, 100));
  }
};
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

let A;
before(async () => {
  A = await launchWithExtension(fs.realpathSync(EXT_DIR));
  await A.context.route('https://vwesley.dev/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
});
after(async () => {
  await A?.close();
});

const link = (p) => p.locator(`${SIGN} .brand`);
const radio = (p, form) => p.locator(`input[name="logo-form"][value="${form}"]`);
const attr = (p) => p.evaluate(() => document.documentElement.getAttribute('data-logo'));
const stored = (p) => p.evaluate(() => localStorage.getItem('logo-form'));
/** The right chevron's start in viewBox units, from the rendered geometry (minus the hover/first-visit hint tug). */
const chevronX = (p) =>
  p.evaluate(() => {
    const s = document.querySelector('.studio-signoff .brand-logo').getBoundingClientRect();
    const el = document.querySelector('.studio-signoff .bl-right');
    const r = el.getBoundingClientRect();
    const tug = parseFloat(getComputedStyle(el).translate) || 0;
    return (r.left - s.left) / (s.height / 432) - tug;
  });
const width = async (p) => (await p.locator(`${SIGN} svg.brand-logo`).boundingBox()).width;
const css = (p, sel, prop) => p.evaluate(([s, pr]) => getComputedStyle(document.querySelector(s))[pr], [sel, prop]);

/** Fresh panel page on clean storage, scrolled to the sign-off. */
async function open(w = 360, motion = 'no-preference') {
  const p = await A.context.newPage();
  A.trackPage(p, 'logo panel');
  await p.setViewportSize({ width: w, height: 780 });
  await p.emulateMedia({ reducedMotion: motion });
  const url = `chrome-extension://${A.id}/sidepanel/sidepanel.html`;
  await p.goto(url);
  await p.evaluate(() => localStorage.clear());
  await p.goto(url);
  await link(p).scrollIntoViewIfNeeded();
  return p;
}
async function pick(p, form) {
  await radio(p, form).check({ force: true });
  const shown = form === 'long' && p.viewportSize().width < 480 ? X.middle : X[form];
  await until(async () => near(await chevronX(p), shown));
}
async function drag(p, dx, from = 10) {
  const b = await link(p).boundingBox();
  const y = b.y + b.height / 2;
  const x = b.x + from;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx / 2, y, { steps: 6 });
  await p.mouse.move(x + dx, y, { steps: 6 });
  await p.mouse.up();
}

test('default form is middle; the Logo radios sit with the other settings, the sign-off at the bottom', async () => {
  const p = await open();
  const a = await attr(p);
  assert.ok(a === null || a === 'middle');
  assert.ok(near(await chevronX(p), X.middle));
  assert.equal(await radio(p, 'middle').isChecked(), true);
  assert.equal(await p.locator('main #logo-pick input[name="logo-form"]').count(), 3);
  assert.equal(await p.locator(`${SIGN} input`).count(), 0);
  assert.equal(await p.locator('main .brand-logo, header .brand-logo').count(), 0);
});

test('radios switch the form and it persists across a reload', async () => {
  const p = await open(1000);
  const widths = {};
  for (const f of ['short', 'long', 'middle']) {
    await pick(p, f);
    assert.equal(await attr(p), f);
    widths[f] = await width(p);
  }
  assert.ok(widths.short < widths.middle && widths.middle < widths.long);
  await pick(p, 'long');
  await p.reload();
  assert.equal(await attr(p), 'long');
  assert.ok(near(await chevronX(p), X.long));
  assert.equal(await radio(p, 'long').isChecked(), true);
  assert.equal(await stored(p), 'long');
});

test('the radios work with arrow keys', async () => {
  const p = await open();
  await radio(p, 'middle').focus();
  await p.keyboard.press('ArrowRight');
  assert.equal(await radio(p, 'long').isChecked(), true);
  assert.equal(await attr(p), 'long');
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('ArrowLeft');
  assert.equal(await radio(p, 'short').isChecked(), true);
  assert.equal(await attr(p), 'short');
});

test('dragging the logo right snaps to long (shows as middle on a narrow panel), left to short, and never navigates', async () => {
  const p = await open(1000);
  const url = p.url();
  const tabs = A.context.pages().length;
  await drag(p, 120);
  await until(async () => (await attr(p)) === 'long');
  await until(async () => near(await chevronX(p), X.long));
  assert.equal(p.url(), url);
  await p.waitForTimeout(200);
  await drag(p, -100, 120);
  await until(async () => (await attr(p)) === 'short');
  await until(async () => near(await chevronX(p), X.short));
  assert.equal(p.url(), url);
  assert.equal(A.context.pages().length, tabs);
  assert.equal(await stored(p), 'short');
});

test('while dragging the logo holds each form for a stretch (a notch), then follows the pointer, with no transition', async () => {
  const p = await open(1000);
  const b = await link(p).boundingBox();
  const y = b.y + b.height / 2;
  await p.mouse.move(b.x + 10, y);
  await p.mouse.down();
  await p.mouse.move(b.x + 28, y, { steps: 4 });
  assert.ok(near(await chevronX(p), X.middle));
  assert.equal(await css(p, `${SIGN} .bl-in`, 'opacity'), '1');
  await p.mouse.move(b.x + 50, y, { steps: 4 });
  const mid = await chevronX(p);
  assert.ok(mid > X.middle + 100 && mid < X.long);
  assert.equal(await css(p, `${SIGN} svg.brand-logo`, 'transitionDuration'), '0s');
  await p.mouse.up();
});

test('a short drag either way lets go on the middle form', async () => {
  const p = await open(1000);
  await drag(p, 25);
  assert.equal(await attr(p), 'middle');
  await p.waitForTimeout(200);
  await drag(p, -18, 40);
  assert.equal(await attr(p), 'middle');
});

test('a plain click on the logo opens vwesley.dev in a new tab (noopener)', async () => {
  const p = await open();
  const a = link(p);
  assert.equal(await a.getAttribute('href'), 'https://vwesley.dev');
  assert.equal(await a.getAttribute('target'), '_blank');
  assert.equal(await a.getAttribute('rel'), 'noopener');
  const popup = A.context.waitForEvent('page');
  await a.click({ position: { x: 10, y: 10 } });
  assert.ok((await popup).url().includes('vwesley.dev'));
});

test('sign-off text and both Logo by links are visible; header is unchanged; axe is clean on the sign-off and the Logo card', async () => {
  const p = await open();
  const s = p.locator(SIGN);
  assert.match(await s.innerText(), /Copyright 2026 Vin's Atelier\./);
  assert.match(await s.innerText(), /Designed and built by Vin\./);
  assert.equal(await s.getByRole('link', { name: '@portus_workstation' }).isVisible(), true);
  assert.equal(await s.getByRole('link', { name: '@wason25_pz' }).isVisible(), true);
  assert.equal(await p.locator('header.top h1').innerText(), 'AccessEase');
  assert.equal(await p.locator('header.top .brand-logo, header.top [data-logo-link]').count(), 0);
  const r = await new AxeBuilder({ page: p }).include(SIGN).include('#logo-pick').analyze();
  assert.deepEqual(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`), []);
  // Dark system theme too (the panel follows it, there is no theme attribute).
  await p.emulateMedia({ colorScheme: 'dark' });
  const rd = await new AxeBuilder({ page: p }).include(SIGN).include('#logo-pick').analyze();
  assert.deepEqual(rd.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`), []);
});

test('logo fill follows the system theme: #333 on light, white on dark', async () => {
  const p = await open();
  await p.emulateMedia({ colorScheme: 'light' });
  assert.equal(await css(p, `${SIGN} .bl-atelier`, 'fill'), 'rgb(51, 51, 51)');
  await p.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await css(p, `${SIGN} .bl-atelier`, 'fill'), 'rgb(255, 255, 255)');
});

test('the Long option shows the middle form below 30rem, and dragging right stops there', async () => {
  const p = await open(360);
  const middle = await width(p);
  await radio(p, 'long').check({ force: true });
  assert.equal(await attr(p), 'long');
  await until(async () => near(await chevronX(p), X.middle));
  assert.ok(near(await width(p), middle));
  assert.equal(await radio(p, 'long').isChecked(), true);
  await pick(p, 'short');
  await drag(p, 120);
  await until(async () => near(await chevronX(p), X.middle));
});

test('tooltip, resize cursor, and a tug on the first three visits only', async () => {
  const p = await open(1000);
  assert.equal(await link(p).getAttribute('title'), 'Drag sideways to resize');
  assert.equal(await css(p, `${SIGN} .brand`, 'cursor'), 'ew-resize');
  assert.equal(await p.locator(`${SIGN} svg.brand-logo`).getAttribute('data-hint'), '');
  assert.equal(await css(p, `${SIGN} .bl-right`, 'animationName'), 'logo-hint');
  await p.reload();
  await p.reload();
  assert.equal(await p.locator(`${SIGN} svg.brand-logo`).getAttribute('data-hint'), '');
  await p.reload();
  assert.equal(await p.locator(`${SIGN} svg.brand-logo`).getAttribute('data-hint'), null);
});

test('no tug once a form is picked, and the hover tug points the way the logo can still grow', async () => {
  const p = await open(1000);
  await pick(p, 'long');
  await p.reload();
  await link(p).scrollIntoViewIfNeeded();
  assert.equal(await p.locator(`${SIGN} svg.brand-logo`).getAttribute('data-hint'), null);
  await link(p).hover();
  await until(async () => parseFloat(await css(p, `${SIGN} .bl-right`, 'translate')) < 0);
});

test('reduced motion: no tug at all, the tooltip stays', async () => {
  const p = await open(1000, 'reduce');
  await link(p).hover();
  assert.equal(await css(p, `${SIGN} .bl-right`, 'animationName'), 'none');
  assert.equal(await css(p, `${SIGN} .bl-right`, 'translate'), 'none');
  assert.equal(await link(p).getAttribute('title'), 'Drag sideways to resize');
});
