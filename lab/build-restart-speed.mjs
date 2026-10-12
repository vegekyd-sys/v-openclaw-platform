// Build lab/release-files/restart-speed/ from the bytes V runs (2026-10-13: V and shared VLab
// carry the same production-worker/worker.mjs, sha 8b466a60…).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorker } from './patch-restart-speed-worker.mjs';
import { patchGatewayIndex } from './patch-restart-speed-gateway-index.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const out = [];
const worker = fs.readFileSync(path.join(dir, 'release-files', 'worker-prewarm-contention-retry', 'worker.mjs'), 'utf8');
const workerBefore = sha(worker);
if (workerBefore !== '8b466a60585f97c5b9230c9afe605a22cf9d206484c3bd680f01262f4757b2ee') throw new Error(`Unexpected input checksum for worker.mjs: ${workerBefore}`);
const patchedWorker = patchWorker(worker);
const workerSource = 'lab/release-files/restart-speed/production-worker/worker.mjs';
fs.writeFileSync(path.join(repo, workerSource), patchedWorker);
out.push({ source: workerSource, target: 'production-worker/worker.mjs', before: workerBefore, after: sha(patchedWorker) });
for (const name of ['dist-esm-resolve-fast-path.mjs', 'compile-cache.mjs']) {
  const source = `lab/release-files/restart-speed/production-worker/${name}`;
  out.push({ source, target: `production-worker/${name}`, after: sha(fs.readFileSync(path.join(repo, source))) });
}
const index = fs.readFileSync(path.join(repo, 'release', 'captured', 'codex-firsttext-20261008', 'dist', 'index.js'), 'utf8');
const indexBefore = sha(index);
if (indexBefore !== '3f4858801c11c189567965ff197312937d82fe261dae78b7f76602884e679524') throw new Error(`Unexpected input checksum for index.js: ${indexBefore}`);
const patchedIndex = patchGatewayIndex(index);
const indexSource = 'lab/release-files/restart-speed/dist/index.js';
fs.writeFileSync(path.join(repo, indexSource), patchedIndex);
out.push({ source: indexSource, target: 'openclaw/dist/index.js', before: indexBefore, after: sha(patchedIndex) });
const bootstrapBefore = sha(fs.readFileSync(path.join(dir, 'release-files', 'db91-preflight-timeout-env', 'db91-integrity-bootstrap.mjs')));
if (bootstrapBefore !== '7c276dfa53f6d77318157bacfb7310ce91851f6e562ce92043862ff9a44534eb') throw new Error('Unexpected bootstrap baseline');
for (const [name, before] of [['db91-integrity-bootstrap.mjs', bootstrapBefore], ['db91-restart-carry.mjs', undefined]]) {
  const source = `lab/release-files/restart-speed/dist/${name}`;
  out.push({ source, target: `openclaw/dist/${name}`, ...(before ? { before } : {}), after: sha(fs.readFileSync(path.join(repo, source))) });
}
console.log(JSON.stringify(out, null, 2));
