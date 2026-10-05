// Build lab/release-files/workboard-incremental-sweep/index.js from V's live Workboard bytes
// (lab/release-files/lifecycle-workboard-index.js, unchanged on V since the 2026-09 releases).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorkboardIndex } from './patch-workboard-incremental-sweep.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const input = path.join(repo, 'lab/release-files/lifecycle-workboard-index.js');
const before = '66e7b126907ccee1';
const original = fs.readFileSync(input, 'utf8');
if (!sha(original).startsWith(before)) throw new Error(`Unexpected input checksum ${sha(original)}`);
const patched = patchWorkboardIndex(original);
const source = 'lab/release-files/workboard-incremental-sweep/index.js';
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify({ source, before: sha(original), after: sha(patched) }, null, 2));
