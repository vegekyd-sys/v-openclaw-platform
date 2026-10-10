// Build lab/release-files/worker-secret-egress/worker.mjs from V's production-worker/worker.mjs
// (lab/release-files/worker-prewarm-contention-retry, the bytes V runs as of 2026-10-10).
// secret-egress-worker.mjs next to it is a new file (production-worker/secret-egress-worker.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorker } from './patch-worker-secret-egress.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const original = fs.readFileSync(path.join(dir, 'release-files', 'worker-prewarm-contention-retry', 'worker.mjs'), 'utf8');
const before = sha(original);
if (before !== '8b466a60585f97c5b9230c9afe605a22cf9d206484c3bd680f01262f4757b2ee') throw new Error(`Unexpected input checksum for worker.mjs: ${before}`);
const patched = patchWorker(original);
const source = 'lab/release-files/worker-secret-egress/worker.mjs';
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
const module = 'lab/release-files/worker-secret-egress/secret-egress-worker.mjs';
console.log(JSON.stringify([
  { source, target: 'production-worker/worker.mjs', before, after: sha(patched) },
  { source: module, target: 'production-worker/secret-egress-worker.mjs', before: null, after: sha(fs.readFileSync(path.join(repo, module))) },
], null, 2));
