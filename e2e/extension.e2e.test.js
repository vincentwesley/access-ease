// Real-browser end-to-end tests for the unpacked AccessEase extension.
// Run: npm run test:e2e   (headed by default; E2E_HEADLESS=1 for new headless)
//
// WHAT IS AND ISN'T COVERED (be honest about it)
// - The extension is loaded unpacked into Playwright's bundled Chromium
//   (branded Chrome 137+ ignores --load-extension).
// - The side panel cannot be opened from the toolbar in automation, so its page
//   (sidepanel.html) is opened in an ordinary tab. It is opened BEFORE the page
//   under test, in the same window, so its tabs.query({active,currentWindow})
//   resolves to the fixture page, as it would in the real side panel. The panel
//   is therefore a background tab while we drive it.
// - activeTab can only be granted by a real toolbar click, and the
//   "Apply on all sites" permission prompt is native browser UI. Neither can be
//   clicked. So:
//     * Suite "shipped manifest" uses the UNMODIFIED extension. It verifies
//       install-time permissions, panel UI, keyboard, axe, persistence, the
//       protected-page and not-yet-granted messages.
//     * Suite "access granted" uses a temp COPY whose manifest moves
//       optional_host_permissions to host_permissions, i.e. the state after the
//       user has approved the prompt. Everything else is the shipped code. This
//       covers the apply path, all-sites content script. NOT covered: the prompt itself, the activeTab grant, and
//       permissions.remove (required permissions cannot be removed, so the
//       "turn all-sites off" cleanup is not exercised; that logic is unit-tested
//       against a chrome stub in tests/allsites.test.js).
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {
  serveFixtures, makeGrantedCopy, launchWithExtension, openPanelBeside, storageGet,
  contrastOf, EXT_DIR, SHOTS, REPORT, HEADLESS,
} from './helpers.mjs';

const results = [];
const log = [];
const notes = (msg) => log.push(msg);
let chromiumVersion = '';

/** Named check: recorded as pass/fail in docs/e2e-report.md and asserted. */
function check(name, fn) {
  test(name, async () => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, err: String(e.message || e).split('\n').slice(0, 6).join(' | ') });
      throw e;
    }
  });
}
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    if (Date.now() > end) throw new Error(`timed out waiting (last: ${last})`);
    await new Promise((r) => setTimeout(r, 100));
  }
};
const cs = (page, sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
const click = (panel, id) => panel.evaluate((i) => document.getElementById(i).click(), id);

let fx; // fixture server
let A; // shipped-manifest browser
let B; // access-granted browser
let grantedDir;

before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fx = await serveFixtures();
  grantedDir = makeGrantedCopy();
  A = await launchWithExtension(fs.realpathSync(EXT_DIR));
  B = await launchWithExtension(grantedDir, { deviceScaleFactor: 2 });
  chromiumVersion = chromium.executablePath().match(/chromium-(\d+)/)?.[0] ?? 'chromium';
});
after(async () => {
  await A?.close();
  await B?.close();
  await fx?.close();
  if (grantedDir) fs.rmSync(grantedDir, { recursive: true, force: true });
  const pass = results.filter((r) => r.ok).length;
  const md = [
    '# AccessEase end-to-end report',
    '',
    `Run: ${new Date().toISOString()} | Playwright ${chromiumVersion} | ${HEADLESS ? 'new headless' : 'headed'} | ${process.platform}`,
    '',
    `**${pass}/${results.length} checks passed.**`,
    '',
    '| # | Result | Check |',
    '|---|---|---|',
    ...results.map((r, i) => `| ${i + 1} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.name}${r.ok ? '' : ` -- ${r.err}`} |`),
    '',
    '## Raw evidence log',
    '',
    '```',
    ...log,
    '```',
    '',
    '## Not verifiable in automation',
    '',
    '- The toolbar click (activeTab grant) and the native "allow access to all sites" prompt. The "access granted" suite uses a temp copy of the extension with the host permission granted at install (see the header of e2e/extension.e2e.test.js).',
    '- `chrome.permissions.remove` for all-sites (a required permission cannot be removed in the granted copy), so the "turn off" cleanup is not exercised end to end (its logic is unit-tested against a chrome stub in tests/allsites.test.js).',
    '- The real side panel chrome (docked width, focus hand-off from the toolbar). The panel page is tested in a normal tab.',
    '- Branded Google Chrome itself (137+ ignores --load-extension); only Playwright Chromium was used.',
    '',
  ].join('\n');
  fs.writeFileSync(REPORT, md);
});

// ------------------------------------------------------------------ shipped manifest
describe('shipped manifest (unmodified extension)', () => {
  check('extension loads and service worker starts', async () => {
    assert.match(A.id, /^[a-p]{32}$/);
    notes(`extension id ${A.id}`);
  });

  check('manifest: no host access at install; only storage, activeTab, scripting, sidePanel', async () => {
    const m = await A.worker.evaluate(() => chrome.runtime.getManifest());
    const granted = await A.worker.evaluate(() => chrome.permissions.getAll());
    notes(`permissions.getAll(): ${JSON.stringify(granted)}`);
    assert.deepEqual([...m.permissions].sort(), ['activeTab', 'scripting', 'sidePanel', 'storage']);
    assert.equal(m.host_permissions, undefined);
    assert.deepEqual(m.optional_host_permissions, ['<all_urls>']);
    assert.deepEqual(granted.origins ?? [], [], 'no origins granted at install');
    assert.equal(await A.worker.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] })), false);
    assert.deepEqual(m.content_scripts ?? [], [], 'no static content scripts');
  });

  check('chrome://extensions shows no manifest warnings or runtime errors for AccessEase', async () => {
    const p = await A.context.newPage();
    await p.goto('chrome://extensions');
    const info = await until(() => p.evaluate((id) => {
      const mgr = document.querySelector('extensions-manager');
      const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
      const items = [...(list?.shadowRoot?.querySelectorAll('extensions-item') ?? [])];
      const item = items.find((i) => i.data?.id === id);
      return item ? { manifestErrors: item.data.manifestErrors, runtimeErrors: item.data.runtimeErrors, state: item.data.state } : null;
    }, A.id));
    notes(`chrome://extensions item data: ${JSON.stringify(info)}`);
    assert.equal(info.manifestErrors.length, 0);
    assert.equal(info.runtimeErrors.length, 0);
    assert.equal(info.state, 'ENABLED');
    await p.close();
  });

  check('panel renders headings, controls and footer, with no console errors', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
    await panel.waitForSelector('#size');
    assert.equal(await panel.textContent('h1'), 'AccessEase');
    assert.equal(await panel.textContent('.tagline'), 'Make this page easier to read.');
    assert.equal(await panel.textContent('#reset'), 'Reset my settings');
    assert.deepEqual(
      await panel.evaluate(() => [...document.querySelectorAll('.segmented span')].map((e) => e.textContent)),
      ['Off', 'Black on white', 'White on black'],
    );
    for (const id of ['size', 'dyslexia', 'motion', 'allsites', 'reset']) {
      assert.ok(await panel.$(`#${id}`), `#${id} present`);
    }
    assert.match(await panel.textContent('footer'), /Nothing leaves your device/);
    // regression (bug 1): the selected segment must fill the full control height
    const heights = await panel.evaluate(() => [...document.querySelectorAll('.segmented span')].map((e) => Math.round(e.getBoundingClientRect().height)));
    notes(`contrast segment heights: ${heights}`);
    assert.equal(new Set(heights).size, 1, `segments equal height: ${heights}`);
    await page.close(); await panel.close();
    notes(`console errors so far (A): ${JSON.stringify(A.errors)}`);
    assert.deepEqual(A.errors, []);
  });

  check('first run, page not yet allowed: status line says not active, offers all-sites, and the NO_ACCESS copy (not the "protected" copy) is shown; page untouched', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
    await panel.waitForSelector('#size');
    // no click needed: the state is computed when the panel opens
    await until(async () => (await panel.textContent('#page-status')) === 'Not active on this page');
    const msg = await panel.textContent('#notice');
    notes(`first-run notice: ${msg}`);
    assert.equal(msg, "AccessEase can't change this page yet. Use the button above, or click the AccessEase icon in your toolbar twice (close, then reopen) to allow just this page.");
    assert.doesNotMatch(msg, /Chrome doesn't let any extension/);
    assert.equal(await panel.isVisible('#enable-all'), true);
    assert.equal(await panel.textContent('#enable-all'), 'Apply on all sites');
    assert.match(await panel.getAttribute('#enable-all', 'class'), /\bprimary\b/);
    // the page controls are dimmed (but usable) while they cannot take effect; the all-sites card is not
    const op = await panel.evaluate(() => ({
      main: document.getElementById('main').dataset.inactive,
      size: getComputedStyle(document.querySelector('#size').closest('.card')).opacity,
      allsites: getComputedStyle(document.querySelector('#allsites').closest('.card')).opacity,
    }));
    notes(`inactive dimming: ${JSON.stringify(op)}`);
    assert.deepEqual(op, { main: 'yes', size: '0.8', allsites: '1' });
    await click(panel, 'size-up');
    assert.equal(await cs(page, '#intro', 'fontSize'), '14px');
    await until(async () => (await panel.textContent('#page-status')) === 'Not active on this page');
    await click(panel, 'reset');
    await page.close(); await panel.close();
  });

  check('protected page (chrome://extensions, url hidden): PROTECTED copy via the browser error, no all-sites button, never shown as live', async () => {
    const panel = await A.context.newPage();
    A.trackPage(panel, 'panel');
    await panel.setViewportSize({ width: 360, height: 780 });
    await panel.goto(`chrome-extension://${A.id}/sidepanel/sidepanel.html`);
    const prot = await A.context.newPage();
    await prot.goto('chrome://extensions');
    await click(panel, 'size-up');
    await until(async () => /Chrome doesn't let any extension change this page/.test(await panel.textContent('#notice')));
    const msg = await panel.textContent('#notice');
    notes(`chrome://extensions notice (url == null, decided from the executeScript error): ${msg}`);
    assert.match(msg, /Open a normal website and AccessEase will work there\./);
    assert.equal(await panel.textContent('#page-status'), 'Not active on this page');
    assert.equal(await panel.isVisible('#enable-all'), false);
    await click(panel, 'reset');
    await prot.close(); await panel.close();
  });

  check('manifest CSP is set; the panel violates none, and inline script is really blocked', async () => {
    const m = await A.worker.evaluate(() => chrome.runtime.getManifest());
    const csp = m.content_security_policy.extension_pages;
    notes(`extension_pages CSP: ${csp}`);
    for (const d of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "connect-src 'none'", "img-src 'self'", "style-src 'self'", "font-src 'self'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
      assert.ok(csp.includes(d), d);
    }
    const panel = await A.context.newPage();
    A.trackPage(panel, 'panel');
    await panel.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective));
    });
    await panel.goto(`chrome-extension://${A.id}/sidepanel/sidepanel.html`);
    await panel.waitForSelector('#size');
    await click(panel, 'size-up'); await click(panel, 'reset');
    await panel.waitForTimeout(300);
    assert.deepEqual(await panel.evaluate(() => window.__csp), [], 'no CSP violations from normal use');
    const blocked = await panel.evaluate(async () => {
      const s = document.createElement('script');
      s.textContent = 'window.__injected = 1';
      document.head.append(s);
      await new Promise((r) => setTimeout(r, 100));
      return { ran: window.__injected === 1, violations: window.__csp.length };
    });
    notes(`inline script test: ${JSON.stringify(blocked)}`);
    assert.equal(blocked.ran, false);
    assert.ok(blocked.violations >= 1);
    await panel.close();
  });

  check('web_accessible_resources use dynamic URLs: a page cannot fetch a resource by the fixed extension id', async () => {
    const m = await A.worker.evaluate(() => chrome.runtime.getManifest());
    assert.ok(m.web_accessible_resources.every((w) => w.use_dynamic_url === true));
    const page = await A.context.newPage(); // untracked: the denied probes log console errors on purpose
    await page.goto(`${fx.origin}/sample.html`);
    const probes = await page.evaluate(async (id) => {
      const out = {};
      for (const f of ['fonts/OpenDyslexic-Regular.woff2', 'lib/inject.js', 'manifest.json']) {
        out[f] = await fetch(`chrome-extension://${id}/${f}`).then((r) => `status ${r.status}`).catch(() => 'blocked');
      }
      return out;
    }, A.id);
    notes(`fingerprint probes from a web page by static id: ${JSON.stringify(probes)}`);
    for (const [f, r] of Object.entries(probes)) assert.equal(r, 'blocked', f);
    await page.close();
  });

  check('panel: settings persist across a panel reload (and land in chrome.storage.local)', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
    await panel.waitForSelector('#size');
    await click(panel, 'size-up'); await click(panel, 'size-up'); await click(panel, 'size-up');
    await panel.check('input[name=contrast][value=dark]');
    await panel.check('#dyslexia');
    await panel.check('#motion');
    await until(async () => (await storageGet(A))?.textScale === 130 && (await storageGet(A))?.reduceMotion === true);
    const stored = await storageGet(A);
    notes(`stored: ${JSON.stringify(stored)}`);
    assert.deepEqual([stored.textScale, stored.contrast, stored.dyslexiaFont, stored.reduceMotion], [130, 'dark', true, true]);
    await panel.reload();
    await panel.waitForSelector('#size');
    assert.equal(await panel.inputValue('#size'), '130');
    assert.equal(await panel.textContent('#size-out'), '130%');
    assert.equal(await panel.isChecked('input[name=contrast][value=dark]'), true);
    assert.equal(await panel.isChecked('#dyslexia'), true);
    assert.equal(await panel.isChecked('#motion'), true);
    await click(panel, 'reset');
    await until(async () => (await storageGet(A))?.textScale === 100);
    assert.equal(await panel.isChecked('input[name=contrast][value=off]'), true);
    assert.equal(await panel.isChecked('#dyslexia'), false);
    await page.close(); await panel.close();
  });

  check('panel headings: one h1, then an h2 for each card', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
    await panel.waitForSelector('#size');
    const hs = await panel.evaluate(() => [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName}:${h.textContent.trim()}`));
    assert.deepEqual(hs, ['H1:AccessEase', 'H2:Text size', 'H2:Contrast', 'H2:Font and motion', 'H2:All sites']);
    await page.close(); await panel.close();
  });

  check('panel keyboard: tab order is logical; Space on switches, arrows on radios and slider work', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
    await panel.waitForSelector('#size');
    await panel.evaluate(() => { document.activeElement?.blur(); });
    const order = [];
    for (let i = 0; i < 16; i++) {
      await panel.keyboard.press('Tab');
      order.push(await panel.evaluate(() => {
        const e = document.activeElement;
        return e.id || `${e.name}=${e.value}`;
      }));
    }
    notes(`tab order: ${order.join(' > ')}`);
    // -/+ stay enabled (no lost focus); enable-all shows because the page is not allowed yet.
    assert.deepEqual(order.slice(0, 8), ['reset', 'enable-all', 'size-down', 'size', 'size-up', 'contrast=off', 'dyslexia', 'motion']);
    assert.ok(order.includes('allsites'), 'all-sites switch reachable');

    await panel.focus('#dyslexia');
    await panel.keyboard.press('Space');
    assert.equal(await panel.isChecked('#dyslexia'), true);
    await panel.keyboard.press('Space');
    assert.equal(await panel.isChecked('#dyslexia'), false);
    await panel.focus('#motion');
    await panel.keyboard.press('Space');
    assert.equal(await panel.isChecked('#motion'), true);
    await panel.keyboard.press('Space');
    assert.equal(await panel.isChecked('#motion'), false);

    const checkedContrast = () => panel.evaluate(() => document.querySelector('input[name=contrast]:checked').value);
    await panel.focus('input[name=contrast]:checked');
    await panel.keyboard.press('ArrowRight');
    assert.equal(await checkedContrast(), 'light');
    await panel.keyboard.press('ArrowRight');
    assert.equal(await checkedContrast(), 'dark');
    await panel.keyboard.press('ArrowLeft');
    assert.equal(await checkedContrast(), 'light');
    await panel.focus('#size');
    await panel.keyboard.press('ArrowRight');
    assert.equal(await panel.inputValue('#size'), '110');
    assert.equal(await panel.getAttribute('#size', 'aria-valuetext'), '110 percent');
    await click(panel, 'reset');
    await page.close(); await panel.close();
  });

  check('switches are named by their title only, described by their hint', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
    await panel.waitForSelector('#size');
    for (const [id, name, hint] of [
      ['dyslexia', 'Dyslexia-friendly font', /OpenDyslexic/],
      ['motion', 'Reduce animations', /moving and fading/],
      ['allsites', 'Apply on all sites', /Keeps your settings working as you move from page to page/],
    ]) {
      const info = await panel.evaluate((i) => {
        const el = document.getElementById(i);
        const ref = (attr) => el.getAttribute(attr).split(' ').map((x) => document.getElementById(x).textContent).join(' ');
        return { name: ref('aria-labelledby'), desc: ref('aria-describedby') };
      }, id);
      assert.equal(info.name, name);
      assert.match(info.desc, hint);
      assert.ok(await panel.getByRole('switch', { name, exact: true }).count() === 1, `role=switch named "${name}"`);
    }
    assert.equal(await panel.textContent('#allsites-h'), 'Keeps your settings working as you move from page to page. Chrome will ask to let AccessEase read and change sites.');
    await page.close(); await panel.close();
  });

  check('-/+ stay enabled and keep focus at the limits, announcing "Already at the ..."', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
    await panel.waitForSelector('#size');
    await panel.focus('#size-down');
    await panel.keyboard.press('Enter');
    assert.equal(await panel.isDisabled('#size-down'), false);
    assert.equal(await panel.evaluate(() => document.activeElement.id), 'size-down', 'focus kept');
    await until(async () => (await panel.textContent('#status')) === 'Already at the smallest size');
    assert.equal(await panel.inputValue('#size'), '100');
    await panel.evaluate(() => { const r = document.getElementById('size'); r.value = '200'; r.dispatchEvent(new Event('input')); });
    await panel.focus('#size-up');
    await panel.keyboard.press('Enter');
    assert.equal(await panel.isDisabled('#size-up'), false);
    assert.equal(await panel.evaluate(() => document.activeElement.id), 'size-up');
    await until(async () => (await panel.textContent('#status')) === 'Already at the largest size');
    await click(panel, 'reset');
    await page.close(); await panel.close();
  });

  check('panel does not overflow horizontally at 260px; contrast segments stack in one column', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`, { panelSize: { width: 260, height: 900 } });
    await panel.waitForSelector('#size');
    const m = await panel.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      cols: getComputedStyle(document.querySelector('.segmented')).gridTemplateColumns.split(' ').length,
      wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((e) => e.id || e.className || e.tagName),
    }));
    notes(`260px: ${JSON.stringify(m)}`);
    assert.ok(m.scroll <= m.client, `scrollWidth ${m.scroll} <= clientWidth ${m.client}`);
    assert.deepEqual(m.wide, []);
    assert.equal(m.cols, 1);
    await panel.setViewportSize({ width: 360, height: 780 });
    assert.equal(await panel.evaluate(() => getComputedStyle(document.querySelector('.segmented')).gridTemplateColumns.split(' ').length), 3);
    await page.close(); await panel.close();
  });

  for (const scheme of ['light', 'dark']) {
    check(`axe-core scan of the panel (${scheme} mode): zero violations`, async () => {
      const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
      await panel.emulateMedia({ colorScheme: scheme });
      await panel.waitForSelector('#size');
        const res = await new AxeBuilder({ page: panel }).analyze();
      notes(`axe ${scheme}: ${res.violations.length} violations, ${res.passes.length} rules passed, incomplete: ${JSON.stringify(res.incomplete.map((i) => i.id))}`);
      for (const v of res.violations) notes(`  VIOLATION ${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target).join(', ')}`);
      assert.equal(res.violations.length, 0);
      await page.close(); await panel.close();
    });
  }

  for (const scheme of ['light', 'dark']) {
    check(`contrast segments (${scheme}): focus ring, selected fill and divider are all >= 3:1`, async () => {
      const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
      await panel.emulateMedia({ colorScheme: scheme });
      await panel.waitForSelector('#size');
      await panel.focus('input[name=contrast][value=off]');
      await panel.keyboard.press('ArrowRight'); // keyboard focus => :focus-visible
      const r = await panel.evaluate(() => {
        const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
        const hex = (h) => { h = h.trim().replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
        const lum = ([r, g, b]) => { const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const root = getComputedStyle(document.documentElement);
        const card = hex(root.getPropertyValue('--card'));
        const span = document.querySelector('input[name=contrast]:focus-visible + span');
        if (!span) return { error: 'no focus-visible segment' };
        const cs = getComputedStyle(span);
        const outline = rgb(cs.outlineColor);
        const shadow = rgb(cs.boxShadow);
        const fill = rgb(cs.backgroundColor);
        const divider = rgb(getComputedStyle(document.querySelectorAll('.segmented label')[1]).borderLeftColor);
        return {
          outlineVsFill: ratio(outline, fill), shadowVsFill: ratio(shadow, fill),
          outlineVsCard: ratio(outline, card), shadowVsCard: ratio(shadow, card),
          fillVsCard: ratio(fill, card), dividerVsCard: ratio(divider, card),
          ring: { outline: cs.outlineColor, shadow: cs.boxShadow, width: cs.outlineWidth },
        };
      });
      notes(`segment contrast (${scheme}): ${JSON.stringify(r)}`);
      assert.ok(!r.error, r.error);
      assert.ok(parseFloat(r.ring.width) >= 2, `ring width ${r.ring.width} (3px, scaled by OS DPI)`);
      // On the selected (accent) segment at least one ring band must clear 3:1 against the fill...
      assert.ok(Math.max(r.outlineVsFill, r.shadowVsFill) >= 3, `ring on fill ${Math.max(r.outlineVsFill, r.shadowVsFill)}`);
      // ...and on an unselected (card) segment at least one band must clear 3:1 against the card.
      assert.ok(Math.max(r.outlineVsCard, r.shadowVsCard) >= 3, `ring on card ${Math.max(r.outlineVsCard, r.shadowVsCard)}`);
      assert.ok(r.fillVsCard >= 3, `selected fill vs card ${r.fillVsCard}`);
      assert.ok(r.dividerVsCard >= 3, `divider vs card ${r.dividerVsCard}`);
      await click(panel, 'reset');
      await page.close(); await panel.close();
    });
  }

  check('a failed save shows a sticky notice that later applies do not wipe; a good save clears it', async () => {
    const { panel, page } = await openPanelBeside(A, `${fx.origin}/sample.html`);
    await panel.waitForSelector('#size');
    await panel.evaluate(() => { window.__realSet = chrome.storage.local.set.bind(chrome.storage.local); chrome.storage.local.set = () => Promise.reject(new Error('quota')); });
    await click(panel, 'size-up');
    await until(async () => (await panel.isVisible('#sticky-notice')));
    assert.match(await panel.textContent('#sticky-notice'), /could not save your settings/);
    await click(panel, 'size-up'); // triggers another apply, which rewrites #notice
    await panel.waitForTimeout(400);
    assert.equal(await panel.isVisible('#sticky-notice'), true, 'sticky notice survives the next apply');
    await panel.evaluate(() => { chrome.storage.local.set = window.__realSet; });
    await click(panel, 'size-down');
    await until(async () => !(await panel.isVisible('#sticky-notice')));
    await click(panel, 'reset');
    await page.close(); await panel.close();
  });

  check('a settings load failure falls back to defaults with a notice; the panel still works', async () => {
    const panel = await A.context.newPage();
    A.trackPage(panel, 'panel');
    await panel.setViewportSize({ width: 360, height: 780 });
    await panel.addInitScript(() => { chrome.storage.local.get = () => Promise.reject(new Error('storage unavailable')); });
    await panel.goto(`chrome-extension://${A.id}/sidepanel/sidepanel.html`);
    await panel.waitForSelector('#size');
    await until(async () => (await panel.isVisible('#sticky-notice')));
    assert.match(await panel.textContent('#sticky-notice'), /couldn't load your saved settings/);
    assert.equal(await panel.inputValue('#size'), '100');
    await click(panel, 'size-up'); // controls are alive
    await until(async () => (await panel.inputValue('#size')) === '110');
    await panel.close();
  });

});

// ------------------------------------------------------------------ granted access
describe('access granted (temp copy with host permission)', () => {
  let panel, page;
  before(async () => {
    ({ panel, page } = await openPanelBeside(B, `${fx.origin}/sample.html`));
    await panel.waitForSelector('#size');
    await click(panel, 'reset');
  });
  after(async () => { await page?.close(); await panel?.close(); });

  const settle = (fn) => until(fn, 6000);

  check('text size: 150% scales root and body text, and Reset restores px sizes', async () => {
    assert.equal(await cs(page, '#intro', 'fontSize'), '14px');
    for (let i = 0; i < 5; i++) await click(panel, 'size-up');
    await settle(async () => (await cs(page, 'html', 'fontSize')) === '24px'); // 5 quick clicks: wait for the last apply
    const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    const p = await cs(page, '#intro', 'fontSize');
    notes(`150%: root ${root}, #intro ${p} (was 14px)`);
    assert.equal(root, '24px');
    assert.ok(parseFloat(p) >= 21, `paragraph grew to ${p}`);
    assert.ok(parseFloat(p) <= 21.5, `paragraph is ~1.5x, not more: ${p}`);
    assert.equal(await panel.textContent('#page-status'), 'Active on this page');
    assert.equal(await panel.isVisible('#enable-all'), false);
    assert.equal(await panel.evaluate(() => getComputedStyle(document.querySelector('#size').closest('.card')).opacity), '1', 'controls are not dimmed while live');
    await click(panel, 'reset');
    await settle(async () => (await cs(page, '#intro', 'fontSize')) === '14px');
    assert.equal(await page.evaluate(() => document.adoptedStyleSheets.length + document.querySelectorAll('#accessease-style').length), 0, 'no residual style');
  });

  check('high contrast dark: light-on-dark, contrast >= 7:1 on text and links, photo untouched', async () => {
    const imgState = () => page.evaluate(() => { const s = getComputedStyle(document.querySelector('#pic')); return [s.backgroundColor, s.filter, s.opacity]; });
    const before2 = await imgState();
    await panel.check('input[name=contrast][value=dark]');
    await settle(async () => (await cs(page, 'body', 'backgroundColor')) === 'rgb(0, 0, 0)');
    const out = {};
    for (const sel of ['#intro', '#light-p', '#dark-p', '#light-link', '#dark-link', '#title']) out[sel] = await contrastOf(page, sel);
    notes(`dark contrast ratios: ${JSON.stringify(out)}`);
    for (const [sel, r] of Object.entries(out)) assert.ok(r >= 7, `${sel} ${r}`);
    assert.equal(await cs(page, '#light-p', 'color'), 'rgb(255, 255, 255)');
    assert.equal(await cs(page, '#light', 'backgroundColor'), 'rgb(0, 0, 0)');
    assert.deepEqual(await imgState(), before2, 'img has no colour override or filter');
  });

  check('high contrast light: dark-on-light, contrast >= 7:1, and Off removes it', async () => {
    await panel.check('input[name=contrast][value=light]');
    await settle(async () => (await cs(page, '#dark', 'backgroundColor')) === 'rgb(255, 255, 255)');
    const out = {};
    for (const sel of ['#intro', '#light-p', '#dark-p', '#light-link', '#dark-link']) out[sel] = await contrastOf(page, sel);
    notes(`light contrast ratios: ${JSON.stringify(out)}`);
    for (const [sel, r] of Object.entries(out)) assert.ok(r >= 7, `${sel} ${r}`);
    assert.equal(await cs(page, '#dark-p', 'color'), 'rgb(0, 0, 0)');
    await panel.check('input[name=contrast][value=off]');
    await settle(async () => (await cs(page, '#dark', 'backgroundColor')) === 'rgb(28, 28, 40)');
    assert.equal(await cs(page, '#light', 'backgroundColor'), 'rgb(255, 255, 255)');
  });

  check('dyslexia font: computed font-family AND the font face actually loads', async () => {
    const orig = await cs(page, '#intro', 'fontFamily');
    await panel.check('#dyslexia');
    await settle(async () => /AccessEase OpenDyslexic/.test(await cs(page, '#intro', 'fontFamily')));
    assert.equal(await cs(page, '#intro', 'letterSpacing'), 'normal', 'no added letter-spacing');
    assert.equal(await cs(page, '#intro', 'wordSpacing'), '0.7px', 'word-spacing .05em of 14px');
    const faces = await settle(() => page.evaluate(async () => {
      await document.fonts.ready;
      const f = [...document.fonts].map((x) => `${x.family}:${x.weight}:${x.status}`);
      return f.some((x) => x.includes('OpenDyslexic') && x.endsWith(':loaded')) ? f : null;
    }));
    const fontsCheck = await page.evaluate(() => document.fonts.check('14px "AccessEase OpenDyslexic"'));
    const lh = await cs(page, '#intro', 'lineHeight');
    notes(`dyslexia: family="${await cs(page, '#intro', 'fontFamily')}" document.fonts=${JSON.stringify(faces)} fonts.check=${fontsCheck} lineHeight=${lh}`);
    assert.ok(fontsCheck);
    assert.match(await cs(page, '#title', 'fontFamily'), /AccessEase OpenDyslexic/);
    assert.notEqual(lh, '19.6px', 'line spacing bumped');
    await panel.uncheck('#dyslexia');
    await settle(async () => (await cs(page, '#intro', 'fontFamily')) === orig);
  });

  check('reduce motion: animation/transition/smooth-scroll zeroed, removable, transition still completes', async () => {
    assert.equal(await cs(page, '#pulse', 'animationDuration'), '2s');
    assert.equal(await cs(page, 'html', 'scrollBehavior'), 'smooth');
    await panel.check('#motion');
    await settle(async () => (await cs(page, '#pulse', 'animationDuration')) !== '2s');
    notes(`reduce motion: animationDuration=${await cs(page, '#pulse', 'animationDuration')} transitionDuration(#fade)=${await cs(page, '#fade', 'transitionDuration')} scrollBehavior=${await cs(page, 'html', 'scrollBehavior')}`);
    assert.ok(parseFloat(await cs(page, '#pulse', 'animationDuration')) <= 0.001);
    assert.equal(await cs(page, '#fade', 'transitionDuration'), '0s');
    assert.equal(await cs(page, 'html', 'scrollBehavior'), 'auto');
    await page.evaluate(() => document.querySelector('#fade').classList.add('on'));
    await settle(async () => (await cs(page, '#fade', 'opacity')) === '1');
    await page.evaluate(() => document.querySelector('#fade').classList.remove('on'));
    await panel.uncheck('#motion');
    await settle(async () => (await cs(page, '#pulse', 'animationDuration')) === '2s');
    assert.equal(await cs(page, '#fade', 'transitionDuration'), '3s');
  });

  check('all settings combined, then Reset my settings leaves the page as originally styled', async () => {
    await click(panel, 'size-up');
    await panel.check('input[name=contrast][value=dark]');
    await panel.check('#dyslexia'); await panel.check('#motion');
    await settle(async () => (await cs(page, '#pulse', 'animationDuration')) !== '2s');
    await click(panel, 'reset');
    await settle(async () => (await cs(page, '#intro', 'fontSize')) === '14px');
    assert.equal(await cs(page, 'body', 'backgroundColor'), 'rgb(250, 250, 250)');
    assert.equal(await cs(page, '#pulse', 'animationDuration'), '2s');
    assert.equal(await page.evaluate(() => document.adoptedStyleSheets.length), 0);
  });

  check('all-sites: switch registers the content script; a fresh page load is styled with the panel closed', async () => {
    await click(panel, 'reset');
    await panel.check('input[name=contrast][value=dark]');
    await click(panel, 'size-up');
    await panel.check('#dyslexia');
    await panel.check('#allsites');
    await until(async () => (await storageGet(B))?.allSites === true);
    const reg = await B.worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
    notes(`registered content scripts: ${JSON.stringify(reg)}`);
    assert.deepEqual(reg, ['accessease-apply']);
    await page.close();
    await panel.close(); // only the content script can style what follows
    const fresh = await B.context.newPage();
    B.trackPage(fresh, 'fresh');
    await fresh.goto(`${fx.origin}/sample.html`);
    await until(async () => (await cs(fresh, 'body', 'backgroundColor')) === 'rgb(0, 0, 0)');
    // 110% of the 14px paragraph; the floor is (re)applied at DOMContentLoaded, once the page's own CSS is known
    await until(async () => (await cs(fresh, '#intro', 'fontSize')) === '15.4px');
    assert.equal(await cs(fresh, 'html', 'fontSize'), '17.6px');
    await until(async () => /AccessEase OpenDyslexic/.test(await cs(fresh, '#intro', 'fontFamily')));
    await until(() => fresh.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some((f) => f.family.includes('OpenDyslexic') && f.status === 'loaded'); }));
    await fresh.reload();
    await until(async () => (await cs(fresh, 'body', 'backgroundColor')) === 'rgb(0, 0, 0)');
    notes('fresh load + reload with panel closed: content script applied dark contrast, 110% size and loaded OpenDyslexic');
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, contrast: 'light', textScale: 100 } });
    });
    await until(async () => (await cs(fresh, 'body', 'backgroundColor')) === 'rgb(255, 255, 255)');
    notes('live storage change reached the open tab through the content script');
    await fresh.close();
    // restore state for the screenshot suite
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, contrast: 'off', textScale: 100, dyslexiaFont: false, allSites: false } });
    });
    ({ panel, page } = await openPanelBeside(B, `${fx.origin}/sample.html`));
  });

  check('no console errors from the extension in the granted browser', async () => {
    notes(`console errors (B): ${JSON.stringify(B.errors)}`);
    assert.deepEqual(B.errors, []);
  });
});

// ------------------------------------------------------------------ behaviour fixes (granted)
describe('behaviour fixes (access-granted copy)', () => {
  let panel, page;
  const open = async (file) => {
    ({ panel, page } = await openPanelBeside(B, `${fx.origin}/${file}`));
    await panel.waitForSelector('#size');
    await click(panel, 'reset');
  };
  const close = async () => { await click(panel, 'reset'); await page?.close(); await panel?.close(); };
  const settle = (fn) => until(fn, 6000);
  const sizes = (sel) => page.evaluate((ss) => Object.fromEntries(ss.map((s) => [s, parseFloat(getComputedStyle(document.querySelector(s)).fontSize)])), sel);

  check('text size on a html{font-size:62.5%} site: 150% is ~1.5x for root, body, h1 and small print (not 2.4x), nothing clipped', async () => {
    await open('rem62.html');
    const sel = ['html', 'body', '#h', '#body-p', '#small', '#box-p'];
    const base = await sizes(sel);
    assert.deepEqual([base.html, base.body, base['#h'], base['#small']], [10, 14, 26, 12]);
    for (let i = 0; i < 5; i++) await click(panel, 'size-up');
    await settle(async () => (await cs(page, 'html', 'fontSize')) === '15px');
    const after = await sizes(sel);
    notes(`62.5% fixture at 150%: ${JSON.stringify(after)} (before ${JSON.stringify(base)})`);
    for (const s of sel) {
      const ratio = after[s] / base[s];
      assert.ok(Math.abs(ratio - 1.5) <= 0.06, `${s} ratio ${ratio}`);
    }
    const box = await page.evaluate(() => { const b = document.getElementById('box'); return { scroll: b.scrollHeight, client: b.clientHeight }; });
    notes(`fixed-height box: ${JSON.stringify(box)}`);
    assert.ok(box.scroll <= box.client, `no clipped text in the fixed-height box: ${JSON.stringify(box)}`);
    // 200% too, and the hierarchy h1 > body > small is preserved
    for (let i = 0; i < 5; i++) await click(panel, 'size-up');
    await settle(async () => (await cs(page, 'html', 'fontSize')) === '20px');
    const two = await sizes(sel);
    assert.ok(two['#h'] > two['#body-p'] && two['#body-p'] > two['#small'], `hierarchy kept: ${JSON.stringify(two)}`);
    await close();
  });

  check('text size on a px-sized site: the floor never shrinks the px-sized h1', async () => {
    await open('sample.html');
    for (let i = 0; i < 5; i++) await click(panel, 'size-up');
    await settle(async () => (await cs(page, 'html', 'fontSize')) === '24px');
    const t = await sizes(['#title', '#intro']);
    notes(`px-sized fixture at 150%: ${JSON.stringify(t)}`);
    assert.ok(t['#title'] >= 26, 'the px-sized h1 is not shrunk by the floor');
    assert.ok(t['#intro'] > 14);
    await close();
  });

  for (const mode of ['dark', 'light']) {
    check(`contrast ${mode}: button-like link gets a 2px border, ::before icon takes the text colour, badge stays readable, genuine italics restyled`, async () => {
      await open('contrast.html');
      const fg = mode === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
      await panel.check(`input[name=contrast][value=${mode}]`);
      await panel.check('#dyslexia');
      await settle(async () => (await cs(page, '#cta', 'borderTopStyle')) === 'solid');
      const r = await page.evaluate(() => {
        const g = (s, pseudo) => getComputedStyle(document.querySelector(s), pseudo);
        return {
          border: [g('#cta').borderTopStyle, g('#cta').borderTopWidth, g('#cta').borderTopColor, g('#cta').borderBottomColor],
          starBefore: g('#star', '::before').color,
          starBeforeBg: g('#star', '::before').backgroundColor,
          italicFont: g('#italic').fontFamily,
          iconFont: g('#icon').fontFamily,
        };
      });
      notes(`contrast ${mode}: ${JSON.stringify(r)}`);
      assert.equal(r.border[0], 'solid');
      assert.ok(parseFloat(r.border[1]) >= 1.5, `2px border (DPI-scaled): ${r.border[1]}`);
      assert.deepEqual([r.border[2], r.border[3]], [fg, fg]);
      assert.equal(r.starBefore, fg, '::before glyph coloured with the foreground');
      assert.equal(r.starBeforeBg, 'rgba(0, 0, 0, 0)', 'no background painted on the pseudo-element');
      assert.match(r.italicFont, /AccessEase OpenDyslexic/, 'genuine <i> gets the font');
      assert.doesNotMatch(r.iconFont, /AccessEase OpenDyslexic/, 'icon <i class="fa"> keeps its icon font');
      for (const sel of ['#badge', '#star', '#italic']) {
        const c = await contrastOf(page, sel);
        assert.ok(c >= 7, `${sel} contrast ${c}`);
      }
      const u5 = await page.evaluate(() => {
        const g = (s) => getComputedStyle(document.querySelector(s));
        return {
          badgeBg: g('#badge2').backgroundImage, chipBg: g('#chip').backgroundImage, ctaBg: g('#cta').backgroundImage,
          bad: [g('#bad').outlineStyle, g('#bad').outlineWidth, g('#bad').outlineColor, g('#bad').borderTopWidth],
          ariaBad: [g('#aria-bad').outlineStyle, g('#aria-bad').outlineColor],
          good: [g('#good').outlineStyle],
          cta: g('#cta').borderTopStyle,
        };
      });
      notes(`contrast ${mode} U5: ${JSON.stringify(u5)}`);
      assert.equal(u5.badgeBg, 'none', 'gradient badge flattened');
      assert.equal(u5.chipBg, 'none', 'inline-style gradient chip flattened');
      assert.equal(u5.ctaBg, 'none');
      assert.equal(u5.bad[0], 'dashed', ':invalid field gets a dashed outline');
      assert.ok(parseFloat(u5.bad[1]) >= 1.5, `outline ~2px: ${u5.bad[1]}`);
      assert.equal(u5.bad[2], fg);
      assert.notEqual(u5.bad[3], '2px', 'invalid field keeps its own border, not the button border');
      assert.equal(u5.ariaBad[0], 'dashed', '[aria-invalid] gets the dashed outline too');
      assert.equal(u5.good[0], 'none', 'valid field has no outline');
      assert.equal(u5.cta, 'solid', 'buttons still get the solid border');
      await panel.uncheck('#dyslexia');
      await close();
    });
  }

  check('Reset my settings resets text, contrast, font and motion, keeps all-sites, announces it and shows a visible confirmation', async () => {
    await open('sample.html');
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, allSites: true } });
    });
    await panel.reload();
    await panel.waitForSelector('#size');
    await click(panel, 'size-up');
    await panel.check('#motion');
    await click(panel, 'reset');
    await until(async () => (await panel.textContent('#status')) === 'Text, contrast, font and motion were reset.');
    await until(async () => (await storageGet(B))?.textScale === 100 && (await storageGet(B))?.reduceMotion === false);
    const st = await storageGet(B);
    notes(`after reset: ${JSON.stringify(st)}`);
    assert.equal(st.allSites, true, 'all-sites choice kept');
    assert.equal(await panel.textContent('#reset'), 'Reset my settings');
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, allSites: false } });
    });
    await page.close(); await panel.close();
  });

  check('an old settings object that still has a tts key loads fine and the key is dropped on the next save', async () => {
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, tts: { rate: 1.5, voiceURI: 'old' } } });
    });
    await open('sample.html');
    await click(panel, 'size-up');
    await until(async () => (await storageGet(B))?.textScale === 110);
    assert.equal('tts' in (await storageGet(B)), false);
    await close();
  });

  check('protected page with a visible url (.pdf, host access granted): PROTECTED copy, status not active, no all-sites button', async () => {
    await open('paper.pdf');
    await until(async () => /Chrome doesn't let any extension change this page/.test(await panel.textContent('#notice')));
    assert.equal(await panel.textContent('#page-status'), 'Not active on this page');
    assert.equal(await panel.isVisible('#enable-all'), false);
    await close();
  });

  check('px-sized site at 200%: headings never end up smaller than body text; inputs do not clip', async () => {
    await open('px.html');
    const before = await page.evaluate(() => Object.fromEntries(['h1', 'h2', 'h3', 'p', 'inp'].map((i) => [i, parseFloat(getComputedStyle(document.getElementById(i)).fontSize)])));
    for (let i = 0; i < 10; i++) await click(panel, 'size-up');
    await settle(async () => (await cs(page, 'html', 'fontSize')) === '32px');
    const r = await page.evaluate(() => {
      const f = (i) => parseFloat(getComputedStyle(document.getElementById(i)).fontSize);
      const inp = document.getElementById('inp');
      return { h1: f('h1'), h2: f('h2'), h3: f('h3'), p: f('p'), inpFont: f('inp'), inpHeight: inp.getBoundingClientRect().height, inpClip: inp.scrollHeight > inp.clientHeight };
    });
    notes(`px.html 200%: before ${JSON.stringify(before)} after ${JSON.stringify(r)}`);
    assert.ok(r.p >= before.p * 1.9, `body text grew ${r.p}`);
    assert.ok(r.h1 > r.h2 && r.h2 > r.h3 && r.h3 > r.p, `heading hierarchy above body text: ${JSON.stringify(r)}`);
    assert.ok(r.h1 >= r.p * 1.55 && r.h2 >= r.p * 1.3 && r.h3 >= r.p * 1.15, 'heading floors 1.6 / 1.35 / 1.2 x base');
    assert.equal(r.inpClip, false, 'input text is not clipped');
    assert.ok(r.inpHeight >= r.inpFont * 1.1, `input height grew with its text: ${r.inpHeight} vs ${r.inpFont}`);
    await close();
  });

  check('C2: a change made in another window\'s panel shows up here without a reload', async () => {
    await open('sample.html');
    const panel2 = await B.context.newPage();
    B.trackPage(panel2, 'panel2');
    await panel2.setViewportSize({ width: 360, height: 780 });
    await panel2.goto(`chrome-extension://${B.id}/sidepanel/sidepanel.html`);
    await panel2.waitForSelector('#size');
    await page.bringToFront(); // the fixture page must be the active tab, as in a real window
    await click(panel2, 'size-up'); await click(panel2, 'size-up');
    await panel2.check('input[name=contrast][value=dark]');
    await until(async () => (await panel.inputValue('#size')) === '120' && (await panel.isChecked('input[name=contrast][value=dark]')), 6000);
    await settle(async () => (await cs(page, 'body', 'backgroundColor')) === 'rgb(0, 0, 0)');
    // and the other direction, with no feedback loop: values settle and stay
    await click(panel, 'size-up');
    await until(async () => (await panel2.inputValue('#size')) === '130', 6000);
    await panel.waitForTimeout(600);
    assert.equal(await panel.inputValue('#size'), '130');
    assert.equal((await storageGet(B)).textScale, 130);
    await panel2.close();
    await close();
  });

  check('C1: turning all-sites off clears other tabs and the active tab, and tells the truth when Chrome keeps the permission', async () => {
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, allSites: true, contrast: 'dark', textScale: 100 } });
    });
    ({ panel, page } = await openPanelBeside(B, `${fx.origin}/sample.html`)); // panel init registers the script
    await panel.waitForSelector('#size');
    const other = await B.context.newPage();
    B.trackPage(other, 'other');
    await other.goto(`${fx.origin}/px.html`);
    await settle(async () => (await cs(other, 'body', 'backgroundColor')) === 'rgb(0, 0, 0)');
    await page.bringToFront();
    await panel.uncheck('#allsites');
    await until(async () => /still lets AccessEase read and change all sites/.test(await panel.textContent('#sticky-notice')), 8000);
    await until(async () => (await panel.textContent('#status')).startsWith('Apply on all sites is off, but Chrome still has access'), 4000);
    assert.equal(await other.evaluate(() => document.adoptedStyleSheets.length + document.querySelectorAll('#accessease-style').length), 0, 'other tab cleared');
    notes('all-sites off: other tab cleared; sticky notice + announcement say Chrome still holds access (required permission in the granted copy cannot be removed)');
    await other.close();
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, allSites: false, contrast: 'off' } });
    });
    await panel.reload(); await panel.waitForSelector('#size');
    await close();
  });

  check('C3: turning all-sites on styles tabs that are already open, right away', async () => {
    await open('sample.html');
    const other = await B.context.newPage();
    B.trackPage(other, 'other');
    await other.goto(`${fx.origin}/px.html`);
    await page.bringToFront();
    await panel.check('input[name=contrast][value=dark]');
    await settle(async () => (await cs(page, 'body', 'backgroundColor')) === 'rgb(0, 0, 0)');
    assert.equal(await cs(other, 'body', 'backgroundColor'), 'rgb(250, 250, 250)', 'not styled before all-sites is on');
    await panel.check('#allsites');
    await until(async () => (await cs(other, 'body', 'backgroundColor')) === 'rgb(0, 0, 0)', 6000);
    notes('all-sites on: an already-open tab was styled by the sweep');
    await other.close();
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, allSites: false, contrast: 'off' } });
    });
    await panel.reload(); await panel.waitForSelector('#size');
    await close();
  });

  check('C9: a page served with a strict CSP (default-src \'self\') is still styled by the all-sites content script', async () => {
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, allSites: true, contrast: 'dark', textScale: 110, dyslexiaFont: true } });
    });
    ({ panel, page } = await openPanelBeside(B, null));
    await panel.waitForSelector('#size'); // init registers the content script
    await page.close(); await panel.close();
    const strict = await B.context.newPage(); // untracked: a blocked font would log a CSP console error on purpose
    const violations = [];
    strict.on('console', (m) => m.type() === 'error' && violations.push(m.text()));
    const resp = await strict.goto(`${fx.origin}/csp.html`);
    assert.match(resp.headers()['content-security-policy'], /default-src 'self'/);
    await until(async () => (await cs(strict, 'body', 'backgroundColor')) === 'rgb(0, 0, 0)');
    await until(async () => (await cs(strict, 'html', 'fontSize')) === '17.6px');
    await until(async () => /AccessEase OpenDyslexic/.test(await cs(strict, '#intro', 'fontFamily')));
    const fontLoaded = await strict.evaluate(async () => { await document.fonts.ready; return [...document.fonts].map((f) => `${f.family}:${f.status}`); }).catch((e) => String(e));
    notes(`strict-CSP page: styled by the content script (contrast, size, font-family applied); document.fonts=${JSON.stringify(fontLoaded)}; console: ${JSON.stringify(violations)}`);
    assert.ok(Array.isArray(fontLoaded));
    await strict.close();
    await B.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, allSites: false, contrast: 'off', textScale: 100, dyslexiaFont: false } });
    });
    ({ panel, page } = await openPanelBeside(B, `${fx.origin}/sample.html`));
    await panel.waitForSelector('#size');
    await close();
  });

  check('U1: forced-colors: switch state, selected segment, status dot and focus ring stay visible, and the selected segment has a check mark', async () => {
    await open('sample.html');
    await panel.emulateMedia({ forcedColors: 'active' });
    await panel.check('#dyslexia');
    await panel.check('input[name=contrast][value=light]');
    await panel.focus('input[name=contrast][value=light]');
    await panel.keyboard.press('ArrowRight'); // keyboard focus -> focus-visible on "dark"
    await panel.keyboard.press('ArrowLeft');
    const r = await panel.evaluate(() => {
      const g = (el, pseudo) => getComputedStyle(el, pseudo);
      const on = document.querySelector('#dyslexia ~ .track');
      const off = document.querySelector('#motion ~ .track');
      const seg = document.querySelector('input[name=contrast]:checked + span');
      const dot = document.getElementById('page-status');
      return {
        onTrack: [g(on).backgroundColor, g(on).borderTopWidth, g(on, '::after').backgroundColor, g(on, '::after').transform],
        offTrack: [g(off).backgroundColor, g(off).borderTopWidth, g(off, '::after').backgroundColor, g(off, '::after').transform],
        seg: [g(seg).backgroundColor, g(seg).color, g(seg, '::before').content],
        otherSeg: g(document.querySelector('input[name=contrast][value=off] + span')).backgroundColor,
        dot: [g(dot, '::before').backgroundColor, g(dot, '::before').borderTopWidth],
        ring: (() => { const f = document.querySelector('input[name=contrast]:focus-visible + span'); return f ? [g(f).outlineStyle, g(f).outlineWidth, g(f).outlineColor] : null; })(),
        forced: matchMedia('(forced-colors: active)').matches,
      };
    });
    notes(`forced-colors: ${JSON.stringify(r)}`);
    assert.equal(r.forced, true);
    assert.notEqual(r.onTrack[0], r.offTrack[0], 'on and off tracks differ in fill');
    assert.notEqual(r.onTrack[3], r.offTrack[3], 'knob position differs (not colour only)');
    assert.ok(parseFloat(r.onTrack[1]) >= 1.5 && parseFloat(r.offTrack[1]) >= 1.5, 'tracks have a visible border');
    assert.notEqual(r.seg[0], r.otherSeg, 'selected segment differs from unselected');
    assert.match(r.seg[2], /\u2713/, 'selected segment carries a check mark');
    assert.ok(r.ring && r.ring[0] === 'solid' && parseFloat(r.ring[1]) >= 2, `focus ring visible: ${JSON.stringify(r.ring)}`);
    assert.ok(parseFloat(r.dot[1]) >= 1.5, 'status dot has a border');
    await panel.emulateMedia({ forcedColors: 'none' });
    await panel.uncheck('#dyslexia');
    await close();
  });

  check('U8: Reset my settings shows a visible confirmation in #notice that clears itself', async () => {
    await open('sample.html');
    await click(panel, 'size-up');
    await click(panel, 'reset');
    await until(async () => (await panel.textContent('#notice')) === 'Text, contrast, font and motion were reset.', 3000);
    assert.equal(await panel.isVisible('#notice'), true);
    assert.equal(await panel.textContent('#reset'), 'Reset my settings');
    await until(async () => (await panel.textContent('#notice')) !== 'Text, contrast, font and motion were reset.', 7000);
    await page.close(); await panel.close();
  });

  check('no extension console errors during the behaviour-fix checks', async () => {
    notes(`console errors (B, final): ${JSON.stringify(B.errors)}`);
    assert.deepEqual(B.errors, []);
  });
});

// ------------------------------------------------------------------ screenshots
describe('store screenshots (1280x800)', () => {
  let browser, panel, page;
  const H = 630;
  before(async () => {
    browser = await chromium.launch({ headless: true });
    ({ panel, page } = await openPanelBeside(B, `${fx.origin}/sample.html`, { panelSize: { width: 340, height: H } }));
    await page.setViewportSize({ width: 470, height: H });
    await panel.waitForSelector('#size');
    // test-only cosmetics for the screenshots: hide scrollbars in the panel and the fixture
    await panel.evaluate(() => { document.documentElement.style.scrollbarWidth = 'none'; }); // CSSOM: inline <style> is blocked by the panel CSP
    await page.evaluate(() => { const s = document.createElement('style'); s.textContent = 'html{scrollbar-width:none}'; document.head.append(s); });
    await click(panel, 'reset');
    await panel.waitForTimeout(300);
  });
  after(async () => { await page?.close(); await panel?.close(); await browser?.close(); });

  const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  async function compose(file, { title, sub, panelImg, pages, dark = false, panelRight = false }) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const bg = dark ? 'linear-gradient(135deg,#10131c,#1d2436)' : 'linear-gradient(135deg,#eef3fb,#dfe8f6)';
    const fg = dark ? '#f2f5fb' : '#14213d';
    const cards = pages.map((x) => `<figure><img src="${b64(x.img)}"><figcaption>${x.label}</figcaption></figure>`).join('');
    await p.setContent(`<!doctype html><meta charset=utf-8><style>
      *{box-sizing:border-box}body{margin:0;width:1280px;height:800px;background:${bg};color:${fg};font:16px/1.4 "Segoe UI",system-ui,sans-serif;overflow:hidden;position:relative}
      h1{position:absolute;left:48px;top:30px;margin:0;font-size:34px;letter-spacing:-.5px}
      .sub{position:absolute;left:48px;top:78px;margin:0;font-size:19px;opacity:.8}
      .row{position:absolute;left:48px;right:48px;top:128px;bottom:36px;display:flex;gap:28px;align-items:flex-start;${panelRight ? 'flex-direction:row-reverse;' : ''}}
      .panel{flex:0 0 auto;height:100%;border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.35)}
      .panel img{height:100%;display:block}
      .pages{flex:1;display:flex;gap:20px;height:100%;justify-content:center}
      figure{margin:0;flex:0 1 470px;display:flex;flex-direction:column;gap:8px;min-width:0}
      figure img{width:100%;height:auto;max-height:calc(100% - 30px);object-fit:cover;object-position:top;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
      figcaption{font-weight:600;text-align:center;font-size:15px}
    </style><h1>${title}</h1><p class=sub>${sub}</p>
    <div class=row><div class=panel><img src="${b64(panelImg)}"></div><div class=pages>${cards}</div></div>`);
    await p.screenshot({ path: `${SHOTS}/${file}`, type: 'png' });
    await ctx.close();
    notes(`screenshot docs/screenshots/${file} (1280x800)`);
  }

  const shotPage = () => page.screenshot({ type: 'png' });
  const shotPanel = () => panel.screenshot({ type: 'png' });
  const setAll = async (o) => {
    for (let i = 0; i < (o.scale || 0); i++) await click(panel, 'size-up');
    if (o.contrast) await panel.check(`input[name=contrast][value=${o.contrast}]`);
    if (o.dyslexia) await panel.check('#dyslexia');
    await panel.waitForTimeout(700);
    await panel.evaluate(() => document.activeElement?.blur());
    await noNotice();
  };
  const resetAll = async () => { await click(panel, 'reset'); await panel.waitForTimeout(400); };
  // The reset confirmation flashes for 4s; never capture while it is showing.
  const noNotice = () => until(async () => !(await panel.isVisible('#notice')), 8000);

  check('screenshot 1: panel + page before/after text size and dyslexia font', async () => {
    await panel.emulateMedia({ colorScheme: 'light' });
    const beforeImg = await shotPage();
    await setAll({ scale: 4, dyslexia: true });
    await until(async () => /OpenDyslexic/.test(await cs(page, '#intro', 'fontFamily')));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await compose('1-text-size-and-dyslexia-font.png', {
      title: 'Bigger text and a dyslexia-friendly font',
      sub: 'Text size 140% plus OpenDyslexic, on any page, from one side panel.',
      panelImg: await shotPanel(), pages: [{ img: beforeImg, label: 'Before' }, { img: await shotPage(), label: 'After' }],
    });
    await resetAll();
  });

  check('screenshot 2: high contrast, white on black', async () => {
    await setAll({ contrast: 'dark', scale: 2 });
    await compose('2-high-contrast-dark.png', {
      title: 'High contrast: white on black',
      sub: 'Page colours are overridden for easier reading.',
      panelImg: await shotPanel(), pages: [{ img: await shotPage(), label: 'White on black, text 120%' }], dark: true,
    });
    await resetAll();
  });

  check('screenshot 3: high contrast, black on white', async () => {
    await setAll({ contrast: 'light', scale: 2 });
    await compose('3-high-contrast-light.png', {
      title: 'High contrast: black on white',
      sub: 'Black text on white, and links stay distinguishable.',
      panelImg: await shotPanel(), pages: [{ img: await shotPage(), label: 'Black on white, text 120%' }],
    });
    await resetAll();
  });

  check('screenshot 4: the panel in dark mode', async () => {
    await panel.emulateMedia({ colorScheme: 'dark' });
    await setAll({ contrast: 'light', scale: 3, dyslexia: true });
    await panel.check('#motion');
    // Wait for a stable state instead of sleeping: settings applied to the page, fonts loaded,
    // no transient notice, and no focus ring left on the last-toggled control.
    await until(async () => /OpenDyslexic/.test(await cs(page, '#intro', 'fontFamily')));
    await page.evaluate(() => document.fonts.ready);
    await panel.evaluate(() => document.activeElement?.blur());
    await noNotice();
    await compose('4-panel-dark-mode.png', {
      title: 'The panel follows your system theme',
      sub: 'Full keyboard and screen reader support, in light and dark.',
      panelImg: await shotPanel(), pages: [{ img: await shotPage(), label: 'Page with your settings applied' }], dark: true, panelRight: true,
    });
    await panel.emulateMedia({ colorScheme: 'light' });
    await resetAll();
  });
});
