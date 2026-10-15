// Build lab/release-files/upstream-5xx-fallback/ from V's live bytes.
//
//   node lab/build-upstream-5xx-fallback.mjs --base <dir> [--variant v|e3]
//
// <dir> holds the target files as V runs them: core/dist/<name> and worker/<name>, e.g. fetched with
//   scp v:/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/{core/dist,worker}/<name>
// Dist patches replace whole files, so every target is rebuilt from the bytes it will replace and
// the plan records those bytes' sha256 as `before`.
//
// variant "v"  (default): V as of 2026-10-15 10:00 CST (restart-speed-2-reconcile-20261014).
// variant "e3": V after history-image-e3 (#372, merged to dev, not yet on V): the two files that
//               release also replaces start from its release files instead; the rest is unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  patchAgentCommand, patchClassify, patchEmbeddedAgent, patchFailureCopy, patchHarnessFailure, patchIncompleteTurnText,
  patchWorkerIndex, patchWorkerPool, patchWorkerSerializeError,
} from './patch-upstream-5xx-fallback.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const FILES = [
  { name: 'classify-Dm9sTbZz.js', base: 'core/dist', target: 'openclaw/dist', before: '98ea918d544540fed432820b15138a8285db83a6da658cf025262b3dc1c7ac04', patch: patchClassify },
  { name: 'embedded-agent-DaSvA-Yk.js', base: 'core/dist', target: 'openclaw/dist', before: '22dad1eff94b82345bcfb4c0b5da5ba4c72f436b4e81ad94d7ceb611961c3cee', e3: 'lab/release-files/history-image-e3/embedded-agent-DaSvA-Yk.js', patch: patchEmbeddedAgent },
  { name: 'embedded-agent-helpers-CzpaLpCq.js', base: 'core/dist', target: 'openclaw/dist', before: '342e6269ad41e2db113ed35ef4499e7a7ea051a8285ea68baf495d38c2ccbfc2', e3: 'lab/release-files/history-image-e3/embedded-agent-helpers-CzpaLpCq.js', patch: patchFailureCopy },
  { name: 'builtin-openclaw-zQV8Wwjr.js', base: 'core/dist', target: 'openclaw/dist', before: '3e07c3fa8bc9ccb3fe87577f245afa11b42a99b87b46b957e43e5eb9de049f3d', patch: patchIncompleteTurnText },
  { name: 'agent-command-DPfawBbr.js', base: 'core/dist', target: 'openclaw/dist', before: '1805b6861936015156fa7d841b295912c26ed16f3e5dc8f38eec41f54bd186f4', patch: patchAgentCommand },
  { name: 'worker.mjs', base: 'worker', target: 'production-worker', before: '18c949c399b1594d97d39e6352bc8aa93bf7c6ad8082acf5657e058b5cf175f7', patch: patchWorkerSerializeError },
  { name: 'worker-pool.mjs', base: 'worker', target: 'production-worker', before: '197ec4a877a92e1cbbbe97ceadbdb175e32e4438c69791813f34602c6e5250f6', patch: patchWorkerPool },
  { name: 'index.mjs', base: 'worker', target: 'production-worker', before: '4f6894daccc12dbf923cfc8d4c5e93b04961cdd16d5071bec2b4cfb51cea753c', patch: patchWorkerIndex },
  { name: 'harness-failure.mjs', base: 'worker', target: 'production-worker', before: '3be999ce6625d65ba696bed77b84a21218956d75efc176a1d193a4f6f5aa6efe', patch: patchHarnessFailure },
];

export const outputDir = (variant) => `lab/release-files/upstream-5xx-fallback${variant === 'e3' ? '-on-e3' : ''}`;
export const planPath = (variant) => `lab/upstream-5xx-fallback${variant === 'e3' ? '-on-e3' : ''}.plan.json`;

export function build({ base, variant = 'v' }) {
  const out = outputDir(variant);
  fs.mkdirSync(path.join(repo, out), { recursive: true });
  const files = [];
  for (const file of FILES) {
    const input = variant === 'e3' && file.e3 ? path.join(repo, file.e3) : path.join(base, file.base, file.name);
    const original = fs.readFileSync(input, 'utf8');
    if (!(variant === 'e3' && file.e3) && sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)} (V bytes changed; refetch and update FILES)`);
    const patched = file.patch(original);
    // The e3 variant differs only where history-image-e3 replaced the file; share the rest.
    const source = variant === 'e3' && !file.e3 ? `${outputDir('v')}/${file.name}` : `${out}/${file.name}`;
    if (variant === 'e3' && !file.e3) { if (sha(fs.readFileSync(path.join(repo, source))) !== sha(patched)) throw new Error(`${file.name}: build variant v first`); }
    else fs.writeFileSync(path.join(repo, source), patched);
    files.push({ source, target: `${file.target}/${file.name}`, before: sha(original), after: sha(patched) });
  }
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files: files.map(({ after, ...entry }) => entry) };
  fs.writeFileSync(path.join(repo, planPath(variant)), `${JSON.stringify(plan, null, 2)}\n`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const base = arg('--base');
  if (!base) throw new Error('usage: build-upstream-5xx-fallback.mjs --base <dir> [--variant v|e3]');
  console.log(JSON.stringify(build({ base, variant: arg('--variant') ?? 'v' }), null, 2));
}
