// Generates extension/icons/icon{16,48,128}.png with no dependencies.
// Design: rounded square (#1a56c4) with a white "Aa" drawn from strokes.
// Usage: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
mkdirSync(out, { recursive: true });

const BG = [0x1a, 0x56, 0xc4];
const FG = [255, 255, 255];

// Geometry in a 0..1 unit square. Strokes: [x1,y1,x2,y2,halfWidth]
const strokes = [
  // Large "A"
  [0.15, 0.76, 0.37, 0.24, 0.07],
  [0.37, 0.24, 0.59, 0.76, 0.07],
  [0.24, 0.58, 0.50, 0.58, 0.06],
  // Small "a" stem
  [0.83, 0.52, 0.83, 0.76, 0.055],
];
const rings = [[0.72, 0.64, 0.10, 0.055]]; // small "a" bowl: cx, cy, r, halfWidth

function distSeg(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function inRoundRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}
function isFg(x, y) {
  for (const s of strokes) if (distSeg(x, y, s) <= s[4]) return true;
  for (const [cx, cy, r, w] of rings) if (Math.abs(Math.hypot(x - cx, y - cy) - r) <= w) return true;
  return false;
}

function render(size) {
  const SS = 4, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let j = 0; j < size; j++) {
    raw[j * (size * 4 + 1)] = 0;
    for (let i = 0; i < size; i++) {
      let a = 0, f = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (i + (sx + 0.5) / SS) / size, y = (j + (sy + 0.5) / SS) / size;
        if (inRoundRect(x, y, 0.22)) { a++; if (isFg(x, y)) f++; }
      }
      const n = SS * SS, o = j * (size * 4 + 1) + 1 + i * 4;
      const fr = a ? f / a : 0;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - fr) + FG[c] * fr);
      raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  return raw;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(render(size), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [16, 48, 128]) writeFileSync(join(out, `icon${s}.png`), png(s));
console.log('Wrote icons to', out);
