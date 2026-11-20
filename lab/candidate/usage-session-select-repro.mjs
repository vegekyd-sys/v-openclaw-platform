// usage-session-select repro on V-scale session store data (see
// lab/release-files/usage-session-select/README.md). ARM=old runs the runtime as V has it
// (usage-offload-v1); ARM=new applies lab/usage-session-select.plan.json. Same data and requests in
// both arms: setup grows the copied makaron store, then a Gateway stand-in calls the real
// sessions.usage handler with V's node flags and heap limit.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;
const run = (args, extraEnv = {}) => {
  const started = Date.now();
  const result = spawnSync(node, args, {
    cwd: path.dirname(path.dirname(here)),
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = result.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  return {
    code: result.status, signal: result.signal, ms: Date.now() - started,
    report: line ? JSON.parse(line) : null,
    stderrTail: result.stderr.split('\n').filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).slice(-25).join('\n'),
  };
};

// One DB91 integrity epoch per lifecycle, like V's Gateway bootstrap: the stand-in's first open
// records the receipt (before measuring) and its usage worker reuses it.
const integrityBase = path.join(fs.realpathSync(process.env.OPENCLAW_STATE_DIR), '.db91-integrity');
const epoch = randomUUID();
fs.mkdirSync(path.join(integrityBase, epoch), { recursive: true, mode: 0o700 });
fs.chmodSync(integrityBase, 0o700);
const integrityEnv = { OPENCLAW_DB91_INTEGRITY_EPOCH: epoch, OPENCLAW_DB91_INTEGRITY_DIR: path.join(integrityBase, epoch) };
const setup = run([path.join(here, 'usage-session-select-setup.mjs')], integrityEnv);
console.log(JSON.stringify({ phase: 'setup', ...setup }));
if (setup.code !== 0) process.exit(1);
const harness = run([
  '--experimental-async-context-frame',
  `--max-old-space-size=${process.env.USS_GATEWAY_HEAP_MB ?? 12288}`,
  path.join(here, process.env.USS_HARNESS === 'compare' ? 'usage-session-select-compare.mjs' : 'usage-session-select-harness.mjs'),
], integrityEnv);
console.log(JSON.stringify({ phase: 'harness', arm: process.env.ARM, ...harness }));
process.exit(harness.code === 0 ? 0 : 2);
