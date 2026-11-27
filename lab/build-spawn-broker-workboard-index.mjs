// Build lab/release-files/spawn-broker-workboard-index/ from V's bytes: the two dist chunks patched by
// lab/patch-spawn-broker.mjs and lab/patch-workboard-hotpath-index.mjs, plus the broker helper they load.
// Each original is checked against the checksum V runs (db91-release-v2026.9.1-db91.6/core/dist, read
// 2026-11-19): supervisor-BuLJGQyc.js is the npm 2026.9.1 chunk, sqlite-store-CH-caj1l.js is
// lab/release-files/workboard-sweep-bounded/ (the default origin when no directory is given).
//   node lab/build-spawn-broker-workboard-index.mjs <dir holding V's supervisor-BuLJGQyc.js [and sqlite-store-CH-caj1l.js]>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROKER_FILE, patchSupervisor } from './patch-spawn-broker.mjs';
import { patchSqliteStore } from './patch-workboard-hotpath-index.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/spawn-broker-workboard-index';
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

export const FILES = [
  ['supervisor-BuLJGQyc.js', '3dcf2b54a8baaa337cbf96989e0ac4106bc010c96482cbf0c4c4f6265f7fdd11', patchSupervisor, null],
  ['sqlite-store-CH-caj1l.js', 'd06ee044d85a76f19c5fa034b019f934735027afab56934d9d2c9aa5c2633c34', patchSqliteStore, 'lab/release-files/workboard-sweep-bounded'],
  [BROKER_FILE, null, () => fs.readFileSync(path.join(repo, 'lab/spawn-broker', BROKER_FILE), 'utf8'), null],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const vDist = process.argv[2];
  if (!vDist) throw new Error('usage: build-spawn-broker-workboard-index.mjs <dir with V dist originals>');
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [] };
  for (const [name, before, patch, origin] of FILES) {
    let original = null;
    if (before) {
      const fromV = path.join(vDist, name);
      original = fs.readFileSync(fs.existsSync(fromV) || !origin ? fromV : path.join(repo, origin, name), 'utf8');
      if (sha256(original) !== before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
    }
    const patched = patch(original);
    const source = `${dir}/${name}`;
    fs.mkdirSync(path.join(repo, dir), { recursive: true });
    fs.writeFileSync(path.join(repo, source), patched);
    plan.files.push({ source, target: `openclaw/dist/${name}`, before, after: sha256(patched) });
  }
  fs.writeFileSync(path.join(repo, 'lab/spawn-broker-workboard-index.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify(plan, null, 2));
}
