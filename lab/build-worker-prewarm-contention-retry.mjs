// Build lab/release-files/worker-prewarm-contention-retry/ from V's production-worker/worker.mjs
// (lab/release-files/voice-reliability-20261007, the bytes V runs as of 2026-10-08).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorker } from './patch-worker-prewarm-contention-retry.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const original = fs.readFileSync(path.join(dir, 'release-files', 'voice-reliability-20261007', 'production-worker', 'worker.mjs'), 'utf8');
const before = sha(original);
if (before !== '024306ae44dc6aa1c925af226d43738450fba534e54fcc1022bae15d4d970e38') throw new Error(`Unexpected input checksum for worker.mjs: ${before}`);
const patched = patchWorker(original);
const source = 'lab/release-files/worker-prewarm-contention-retry/worker.mjs';
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: 'production-worker/worker.mjs', before, after: sha(patched) }], null, 2));
