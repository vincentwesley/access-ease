// Renders the Chrome Web Store small promo tile (440x280) to docs/store/promo-tile-440x280.png.
// Usage: node scripts/make-promo-tile.mjs
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'store');
mkdirSync(outDir, { recursive: true });
const font = readFileSync(join(root, 'extension', 'fonts', 'OpenDyslexic-Bold.woff2')).toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:OD;font-weight:700;src:url(data:font/woff2;base64,${font}) format('woff2')}
*{box-sizing:border-box;margin:0}
html,body{width:440px;height:280px;overflow:hidden}
body{background:#0b1b3f;color:#fff;font-family:'Segoe UI',Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 32px;gap:14px}
.top{display:flex;align-items:center;gap:14px}
.logo{width:56px;height:56px;border-radius:14px;background:#1a56c4;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font:700 30px OD,sans-serif}
h1{font:700 26px OD,sans-serif;letter-spacing:0}
p{font-size:19px;line-height:1.35;color:#fff}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{background:#ffe600;color:#000;font-weight:700;font-size:14px;padding:5px 10px;border-radius:6px}
</style></head><body>
<div class="top"><div class="logo">Aa</div><h1>AccessEase</h1></div>
<p>Make any web page easier to read.</p>
<div class="chips"><span class="chip">Larger text</span><span class="chip">High contrast</span><span class="chip">Dyslexia font</span><span class="chip">Calmer motion</span></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForFunction(() => globalThis.document.fonts.status === "loaded");
await page.screenshot({ path: join(outDir, 'promo-tile-440x280.png') });
await browser.close();
console.log('wrote docs/store/promo-tile-440x280.png');
