// Shared helpers for the real-browser end-to-end tests.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const EXT_DIR = path.join(ROOT, 'extension');
export const FIXTURES = path.join(here, 'fixtures');
export const SHOTS = path.join(ROOT, 'docs', 'screenshots');
export const REPORT = path.join(ROOT, 'docs', 'e2e-report.md');
export const HEADLESS = process.env.E2E_HEADLESS === '1';

const TYPES = { '.html': 'text/html', '.svg': 'image/svg+xml', '.css': 'text/css' };

/** Tiny static server for the fixture pages on http://localhost:<port>. */
export function serveFixtures() {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'sample.html';
    const file = path.join(FIXTURES, path.basename(name));
    if (name === 'favicon.ico') { res.writeHead(204).end(); return; }
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    const headers = { 'content-type': TYPES[path.extname(file)] || 'text/plain' };
    // csp.html is served under a strict CSP to prove the all-sites content script still applies.
    if (name === 'csp.html') headers['content-security-policy'] = "default-src 'self'";
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://localhost:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

/**
 * Copy the extension to a temp dir with the all-sites host permission granted
 * at install time (moved from optional_host_permissions to host_permissions).
 * Automation cannot click the browser's permission prompt or the toolbar icon
 * (activeTab), so this is the closest honest stand-in for "user granted access".
 * Only the manifest differs; every other file is the shipped code.
 */
export function makeGrantedCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accessease-granted-'));
  fs.cpSync(EXT_DIR, dir, { recursive: true });
  const mf = path.join(dir, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  m.host_permissions = m.optional_host_permissions;
  delete m.optional_host_permissions;
  fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  return dir;
}

/** Launch Chromium (bundled, not branded Chrome) with the unpacked extension. */
export async function launchWithExtension(extPath, { colorScheme = 'light', deviceScaleFactor = 1 } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accessease-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: HEADLESS,
    channel: HEADLESS ? 'chromium' : undefined,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--no-first-run'],
    viewport: { width: 900, height: 700 },
    colorScheme,
    deviceScaleFactor,
  });
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const errors = [];
  const note = (where) => (m) => m.type() === 'error' && errors.push(`${where}: ${m.text()}`);
  worker.on('console', note('service worker'));
  context.on('weberror', (e) => errors.push(`uncaught: ${e.error()}`));
  return {
    context,
    worker,
    id,
    errors,
    trackPage: (page, label) => {
      page.on('console', note(label));
      page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    },
    async close() {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Open the panel in a normal tab, THEN open the page under test in a second tab
 * of the same window. The panel's `tabs.query({active, currentWindow})` then
 * resolves to the page under test, exactly as in the real side panel. The panel
 * stays a background tab; Playwright can still drive it.
 */
export async function openPanelBeside(ctx, url, { panelSize = { width: 360, height: 780 } } = {}) {
  const panel = await ctx.context.newPage();
  ctx.trackPage(panel, 'panel');
  await panel.setViewportSize(panelSize);
  await panel.goto(`chrome-extension://${ctx.id}/sidepanel/sidepanel.html`);
  const page = await ctx.context.newPage();
  ctx.trackPage(page, 'page');
  if (url) await page.goto(url);
  return { panel, page };
}

export const storageGet = (ctx) =>
  ctx.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);

/** Runs in the page: contrast ratio of an element's colour against its own background. */
export function contrastOf(page, selector) {
  return page.evaluate((sel) => {
    const parse = (c) => c.match(/[\d.]+/g).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const fg = lum(parse(cs.color));
    const bg = lum(parse(cs.backgroundColor.startsWith('rgba(0, 0, 0, 0)') ? getComputedStyle(document.body).backgroundColor : cs.backgroundColor));
    const [a, b] = fg > bg ? [fg, bg] : [bg, fg];
    return (a + 0.05) / (b + 0.05);
  }, selector);
}
