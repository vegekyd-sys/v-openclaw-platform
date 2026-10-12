// Build lab/release-files/worker-eager-compile/ from V's production-worker/worker-pool.mjs
// (lab/release-files/voice-reliability-20261007, the bytes V runs as of 2026-10-08).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorkerPool } from './patch-worker-eager-compile.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const original = fs.readFileSync(path.join(dir, 'release-files', 'voice-reliability-20261007', 'production-worker', 'worker-pool.mjs'), 'utf8');
const before = sha(original);
if (before !== '197ec4a877a92e1cbbbe97ceadbdb175e32e4438c69791813f34602c6e5250f6') throw new Error(`Unexpected input checksum for worker-pool.mjs: ${before}`);
const patched = patchWorkerPool(original);
const source = 'lab/release-files/worker-eager-compile/worker-pool.mjs';
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: 'production-worker/worker-pool.mjs', before, after: sha(patched) }], null, 2));
