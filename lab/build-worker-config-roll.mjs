// Worker config roll (2026-10-19): a hot config change always rolls the Worker generation.
//
//   node lab/build-worker-config-roll.mjs --base <dir>
//
// <dir> holds V's live production-worker files (worker/<name>), e.g.
//   scp v:/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/worker/index.mjs <dir>/worker/
// The plugin derives worker-openclaw.json in two places: at registration (no roll) and in the
// config watch (rolls only if its own derivation wrote the file). On a models.* hot reload 9.1
// registers the plugin again; when that registration writes the file first, the watch finds it
// current and running Workers keep the old config (candidate b11377d3 for PR #434: max_tokens
// stayed 384000). Each generation now records the Worker config it was spawned with, and the
// watch rolls whenever the file on disk differs from it (meta-only differences still exempt).
//
// index.mjs is a whole-file replacement, so it is rebuilt from V's bytes and the plan records them
// as `before`. worker-config-watch.mjs is checked in as source (it replaces V's 88354155).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const MARKER = 'worker-config-roll.1';
export const OUT = 'lab/release-files/worker-config-roll';
export const PLAN = 'lab/worker-config-roll.plan.json';
// V 2026-10-19 (upstream-5xx-fallback release; release/captured/v2026.9.1-db91.6-codex-ds-window-20261019.worker).
export const INDEX_BEFORE = 'cfa0e68723c3393e819527dd0145b23413588c0a478b650069ad981d26631ba7';
export const WATCH_BEFORE = '88354155fc02b7729fdc6fe15feb85215e250d6687f9e51b35f77dc284993529';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorkerIndex(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    'import { createWorkerConfigWatch } from "./worker-config-watch.mjs";',
    'import { createWorkerConfigWatch, readWorkerConfigSnapshot } from "./worker-config-watch.mjs";',
    'watch import');
  out = replaceExactlyOnce(out,
    'function acquireSharedPool(options) {',
    'function acquireSharedPool(options, workerConfigPath) {',
    'acquireSharedPool signature');
  out = replaceExactlyOnce(out,
    `      },
    };
    return runtime;
  });`,
    `      },
    };
    // ${MARKER}: the Worker config this generation's Workers start with.
    runtime.workerConfigSnapshot = workerConfigPath
      ? readWorkerConfigSnapshot(workerConfigPath)
      : undefined;
    return runtime;
  });`,
    'acquireSharedPool runtime');
  assert.equal(out.split('acquireSharedPool(poolOptions)').length, 4, 'Expected three acquireSharedPool(poolOptions) calls');
  out = out.replaceAll('acquireSharedPool(poolOptions)', 'acquireSharedPool(poolOptions, workerConfigPath)');
  out = replaceExactlyOnce(out,
    `    const workerConfigWatch = createWorkerConfigWatch({
      gatewayConfigPath,
      derive: deriveCurrentWorkerConfig,`,
    `    const workerConfigWatch = createWorkerConfigWatch({
      gatewayConfigPath,
      // ${MARKER}: roll when the Worker file differs from what the live
      // generation was spawned with, whichever registration derived it.
      workerConfigPath,
      runningWorkerConfig() {
        const live = globalThis[SHARED_POOL_KEY];
        if (!live || live.pool.closing || !live.serviceOwner || live.serviceOwner.stopped) return undefined;
        return live.workerConfigSnapshot;
      },
      derive: deriveCurrentWorkerConfig,`,
    'config watch options');
  out = replaceExactlyOnce(out,
    `          ...pool.status(),
          generation: sharedPool.generation,`,
    `          ...pool.status(),
          generation: sharedPool.generation,
          workerConfigSha256: sharedPool.workerConfigSnapshot?.sha256 ?? null,`,
    'status generation');
  return out;
}

export function build({ base }) {
  const original = fs.readFileSync(path.join(base, 'worker', 'index.mjs'), 'utf8');
  if (sha(original) !== INDEX_BEFORE) throw new Error(`Unexpected index.mjs checksum: ${sha(original)} (V bytes changed; refetch and update INDEX_BEFORE)`);
  const patched = patchWorkerIndex(original);
  fs.mkdirSync(path.join(repo, OUT), { recursive: true });
  fs.writeFileSync(path.join(repo, OUT, 'index.mjs'), patched);
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [
    { source: `${OUT}/index.mjs`, target: 'production-worker/index.mjs', before: INDEX_BEFORE },
    { source: `${OUT}/worker-config-watch.mjs`, target: 'production-worker/worker-config-watch.mjs', before: WATCH_BEFORE },
  ] };
  fs.writeFileSync(path.join(repo, PLAN), `${JSON.stringify(plan, null, 2)}\n`);
  return { index: sha(patched), watch: sha(fs.readFileSync(path.join(repo, OUT, 'worker-config-watch.mjs'))) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const base = arg('--base');
  if (!base) throw new Error('usage: build-worker-config-roll.mjs --base <dir>');
  console.log(JSON.stringify(build({ base }), null, 2));
}
