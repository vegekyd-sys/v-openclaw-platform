// Build lab/release-files/workboard-sweep-links/index.js from V's live Workboard bytes after #212
// (lab/release-files/workboard-incremental-sweep/index.js, on V since 2026-10-06 00:53).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorkboardIndex } from './patch-workboard-sweep-links.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const input = path.join(repo, 'lab/release-files/workboard-incremental-sweep/index.js');
const before = 'ba56e0ab5053f621';
const original = fs.readFileSync(input, 'utf8');
if (!sha(original).startsWith(before)) throw new Error(`Unexpected input checksum ${sha(original)}`);
const patched = patchWorkboardIndex(original);
const source = 'lab/release-files/workboard-sweep-links/index.js';
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify({ source, before: sha(original), after: sha(patched) }, null, 2));
