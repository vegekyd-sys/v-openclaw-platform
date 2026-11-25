import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MARKER } from './patch-binary-attachment-text.mjs';
import { FILES, OUTPUT_DIR, PLAN } from './build-binary-attachment-text.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const NAME = 'attachment-classify-1K-kUuWK.js';

// Stand-in for V's mime-BxTGWg2e.js (same export letters). detectMime there is file-type 22.0.2 magic first,
// then the extension and header hints; this keeps that order for the signatures these cases use.
// The PR records the same cases run against V's real mime chunk and file-type, and the real fonts.
const MIME_STUB = `
const EXT = { ".csv": "text/csv", ".md": "text/markdown", ".txt": "text/plain", ".tsv": "text/tab-separated-values", ".png": "image/png" };
const ext = (p) => { const m = /\\.[^./\\\\]+$/u.exec(p ?? ""); return m ? m[0].toLowerCase() : undefined; };
function normalizeMimeType(mime) { const c = mime?.split(";")[0]?.trim().toLowerCase(); return c || undefined; }
function isZipContainerMime(mime) { return mime.endsWith("+zip"); }
function mimeTypeFromFilePath(p) { return EXT[ext(p) ?? ""]; }
function magic(b) {
  if (!b || b.length < 4) return;
  const head = b.subarray(0, 4).toString("latin1");
  if (head === "OTTO") return "font/otf";
  if (b.readUInt32BE(0) === 0x00010000) return "font/ttf";
  if (head === "\\0asm") return "application/wasm";
  if (head === "PK\\u0003\\u0004") return "application/zip";
  if (b.readUInt32BE(0) === 0x89504e47) return "image/png";
}
async function detectMime(opts) {
  const header = [opts.headerMime, ...(opts.additionalMimeHints ?? [])].map(normalizeMimeType).find(Boolean);
  return magic(opts.buffer) ?? mimeTypeFromFilePath(opts.filePath) ?? header;
}
export { isZipContainerMime as c, normalizeMimeType as d, detectMime as n, mimeTypeFromFilePath as u };
`;

const tempDirs = [];
test.after(() => { for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true }); });

async function loadClassify(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'binary-attachment-text-'));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'mime-BxTGWg2e.js'), MIME_STUB);
  fs.writeFileSync(path.join(dir, NAME), source);
  const mod = await import(pathToFileURL(path.join(dir, NAME)).href);
  return mod.n;
}

// An OpenType (CFF) font as V received it: "OTTO" table directory, then CFF data with zeros on both byte parities.
function openTypeFont(signature = 'OTTO') {
  const tags = ['CFF ', 'DSIG', 'GPOS', 'GSUB', 'OS/2', 'VORG', 'cmap', 'gasp', 'head'];
  const header = Buffer.alloc(12);
  header.write(signature, 0, 'latin1');
  header.writeUInt16BE(tags.length, 4);
  header.writeUInt16BE(0x0100, 6);
  header.writeUInt16BE(0x0004, 8);
  const records = tags.map((tag, index) => {
    const record = Buffer.alloc(16);
    record.write(tag, 0, 'latin1');
    record.writeUInt32BE(0x66d1ea42 + index * 0x01010101, 4);
    record.writeUInt32BE(0x10c + index * 0x5000, 8);
    record.writeUInt32BE(0x8 + index * 0x2a, 12);
    return record;
  });
  const cff = Buffer.alloc(8192);
  for (let offset = 0; offset < cff.length; offset += 4) cff.writeUInt32BE(((offset * 2654435761) >>> 0) % 0x30000, offset);
  return Buffer.concat([header, ...records, cff]);
}

const FONT = '/home/openclaw/.openclaw/media/inbound/AlibabaPuHuiTi-2-45-Light---0f85d5e0-d5ce-4397-9a10-28c94e8184e6.otf';
const base = read(`${FILES[0].base}/${NAME}`);
const patched = read(`${OUTPUT_DIR}/${NAME}`);

test('plan replaces V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, FILES.map((f) => ({ source: `${OUTPUT_DIR}/${f.name}`, target: `${f.target}/${f.name}`, before: f.before })));
  for (const f of FILES) {
    const original = read(`${f.base}/${f.name}`);
    assert.equal(sha(original), f.before, f.name);
    assert.equal(f.patch(original), read(`${OUTPUT_DIR}/${f.name}`), `${f.name} rebuilds`);
    assert.throws(() => f.patch(read(`${OUTPUT_DIR}/${f.name}`)), /already applied/u);
  }
  assert(patched.includes(MARKER));
  const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, NAME)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('V bytes inline an OpenType font as UTF-16 TSV; the patch keeps it binary', async () => {
  const before = await loadClassify(base);
  const after = await loadClassify(patched);
  assert.deepEqual(await before({ buffer: openTypeFont(), name: FONT }), { mime: 'text/tab-separated-values', class: 'text', charset: 'utf-16be' });
  assert.deepEqual(await after({ buffer: openTypeFont(), name: FONT }), { mime: 'font/otf', class: 'binary' });
  // A font with a TrueType signature and one the sniffer does not know stay binary too.
  const ttf = Buffer.concat([Buffer.from([0, 1, 0, 0]), openTypeFont().subarray(4)]);
  assert.deepEqual(await after({ buffer: ttf, name: 'x.ttf' }), { mime: 'font/ttf', class: 'binary' });
  assert.deepEqual(await before({ buffer: openTypeFont('\x01\x02\x03\x04'), name: 'table.bin' }), { mime: 'text/tab-separated-values', class: 'text', charset: 'utf-16be' });
  assert.deepEqual(await after({ buffer: openTypeFont('\x01\x02\x03\x04'), name: 'table.bin' }), { mime: undefined, class: 'binary' });
});

test('a NUL after the 4 KB sniff window keeps the whole buffer binary', async () => {
  const before = await loadClassify(base);
  const after = await loadClassify(patched);
  const utf8 = Buffer.concat([Buffer.from('a'.repeat(5000)), Buffer.alloc(64), Buffer.from('tail')]);
  assert.deepEqual(await before({ buffer: utf8, name: 'payload.bin' }), { mime: 'text/plain', class: 'text' });
  assert.deepEqual(await after({ buffer: utf8, name: 'payload.bin' }), { mime: undefined, class: 'binary' });
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('x'.repeat(3000), 'utf16le'), Buffer.alloc(8)]);
  assert.deepEqual(await after({ buffer: utf16, name: 'payload.bin' }), { mime: undefined, class: 'binary' });
});

test('text attachments classify exactly as before', async () => {
  const before = await loadClassify(base);
  const after = await loadClassify(patched);
  const cases = [
    { buffer: Buffer.from('meeting notes for tomorrow\nagenda: budget', 'utf16le'), name: 'notes.bin' },
    { buffer: Buffer.from('meeting notes for tomorrow', 'utf16le'), name: 'notes.txt' },
    { buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('名称\t数量\n苹果\t3', 'utf16le')]), name: 'sheet.bin' },
    { buffer: Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('hello world', 'utf16le').swap16()]), name: 'be.bin' },
    { buffer: Buffer.from('name,value\nopenclaw,1'), name: 'data.bin' },
    { buffer: Buffer.from('a\tb\nc\td'), name: 'data.tsv' },
    { buffer: Buffer.from('# 标题\n正文\t内容\n'.repeat(400)), name: 'notes.md' },
    { buffer: Buffer.from('caf\xe9 cr\xe8me br\xfbl\xe9e and more words here', 'latin1'), name: 'menu.bin' },
    { buffer: Buffer.from('printable but explicitly binary'), declaredMime: 'application/octet-stream', name: 'payload.bin' },
  ];
  for (const c of cases) {
    const expected = await before(c);
    assert.deepEqual(await after(c), expected, c.name);
    if (c.declaredMime !== 'application/octet-stream') assert.equal(expected.class, 'text', c.name);
  }
});
