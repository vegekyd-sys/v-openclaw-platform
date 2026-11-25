import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// Candidate check for binary-attachment-text-v1 against the VLab runtime: V's real mime chunk and file-type,
// with the patched attachment-classify-1K-kUuWK.js swapped in by the plan.
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const dist = path.join(runtime ?? '', 'openclaw/dist');
const load = async (name) => import(pathToFileURL(path.join(dist, name)).href);

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

test('the runtime carries the patch', async () => {
  assert(runtime, 'VLAB_CANDIDATE_RUNTIME');
  const fs = await import('node:fs');
  assert(fs.readFileSync(path.join(dist, 'attachment-classify-1K-kUuWK.js'), 'utf8').includes('binary-attachment-text-v1'));
});

test('real file-type: fonts and NUL payloads stay binary, text is unchanged', async () => {
  const { n: classify } = await load('attachment-classify-1K-kUuWK.js');
  const inbound = '/home/openclaw/.openclaw/media/inbound';
  assert.deepEqual(await classify({ buffer: openTypeFont(), name: `${inbound}/AlibabaPuHuiTi-2-45-Light---0f85d5e0.otf` }), { mime: 'font/otf', class: 'binary' });
  assert.equal((await classify({ buffer: openTypeFont('\x01\x02\x03\x04'), name: `${inbound}/table.bin` })).class, 'binary');
  assert.equal((await classify({ buffer: Buffer.concat([Buffer.from('a'.repeat(5000)), Buffer.alloc(64)]), name: `${inbound}/x.bin` })).class, 'binary');
  assert.deepEqual(await classify({ buffer: Buffer.from('meeting notes for tomorrow\nagenda', 'utf16le'), name: `${inbound}/notes.bin` }), { mime: 'text/plain', class: 'text', charset: 'utf-16le' });
  assert.deepEqual(await classify({ buffer: Buffer.from('name,value\nopenclaw,1'), name: `${inbound}/data.bin` }), { mime: 'text/csv', class: 'text' });
  assert.deepEqual(await classify({ buffer: Buffer.from('# 标题\n正文\n'.repeat(400)), name: `${inbound}/notes.md` }), { mime: 'text/markdown', class: 'text' });
});
