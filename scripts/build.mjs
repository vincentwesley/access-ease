// Zips extension/ into dist/access-ease-v<version>.zip with no dependencies.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(root, 'extension');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
if (pkg.version !== manifest.version) {
  console.error(`Version mismatch: package.json ${pkg.version} vs manifest.json ${manifest.version}`);
  process.exit(1);
}

// Every file the manifest points at must exist.
const referenced = [
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {}),
  manifest.background && manifest.background.service_worker,
  manifest.side_panel && manifest.side_panel.default_path,
  // Registered at runtime by lib/allsites.js (registerContentScripts), so the
  // manifest does not mention it; it must still ship.
  'content/apply.js',
  // The panel's own page, and whatever it loads.
  'sidepanel/sidepanel.css',
  'sidepanel/sidepanel.js',
  ...(manifest.web_accessible_resources || []).flatMap((w) => w.resources),
].filter(Boolean);
// Anything the panel HTML pulls in must exist too.
const panelHtml = manifest.side_panel && manifest.side_panel.default_path;
if (panelHtml && existsSync(join(extDir, panelHtml))) {
  const html = readFileSync(join(extDir, panelHtml), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"#?:]+)"/g)) {
    referenced.push(join(dirname(panelHtml), m[1]).split(sep).join('/'));
  }
}
const missing = referenced.filter((f) => !existsSync(join(extDir, f)));
if (missing.length) {
  console.error('Missing files referenced by manifest.json:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Editor/OS leftovers and source maps must never ship.
const SKIP = /^\.|\.map$|~$/;

function walk(dir) {
  return readdirSync(dir)
    .filter((name) => !SKIP.test(name))
    .sort()
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

const files = walk(extDir);
const local = [];
const central = [];
let offset = 0;
const DOS_TIME = 0;
const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // fixed date: reproducible output

for (const file of files) {
  const name = Buffer.from(relative(extDir, file).split(sep).join('/'));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const useDeflate = packed.length < data.length;
  const body = useDeflate ? packed : data;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x0800, 6); // UTF-8 names
  lh.writeUInt16LE(method, 8);
  lh.writeUInt16LE(DOS_TIME, 10);
  lh.writeUInt16LE(DOS_DATE, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(body.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(name.length, 26);
  local.push(lh, name, body);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(method, 10);
  ch.writeUInt16LE(DOS_TIME, 12);
  ch.writeUInt16LE(DOS_DATE, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(body.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, name);

  offset += lh.length + name.length + body.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
// Old zips (other versions) must not linger next to the new one.
for (const f of readdirSync(outDir)) if (/^access-ease-v.*\.zip$/.test(f)) rmSync(join(outDir, f));
const out = join(outDir, `access-ease-v${manifest.version}.zip`);
writeFileSync(out, Buffer.concat([...local, centralBuf, end]));
console.log(`Wrote ${relative(root, out)} (${files.length} files)`);
