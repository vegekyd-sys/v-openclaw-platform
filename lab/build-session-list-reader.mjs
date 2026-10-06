// Build lab/release-files/session-list-reader/ from V's live bytes: the session accessor
// entry chunk as captured from V after firsttext-r1 (V patches it; the older variant at
// lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js was never shipped).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchSessionAccessorEntry } from './patch-session-list-reader.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const captured = path.join(repo, 'release/captured/v2026.9.1-db91.6-firsttext-r1-20261006');
const name = 'session-accessor.sqlite-entry-BlklNPKQ.js';
const expected = '6b12190ca8e975ea6c8bce6703af805e01a1ef492e83f4829a6fe0f90669d96b';
const original = fs.readFileSync(`${captured}/dist/${name}`, 'utf8');
const before = sha(original);
if (before !== expected) throw new Error(`Unexpected input checksum for ${name}: ${before}`);
const patched = patchSessionAccessorEntry(original);
const source = `lab/release-files/session-list-reader/${name}`;
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
