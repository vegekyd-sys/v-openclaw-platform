// usage-offload repro on V-scale data (see lab/release-files/usage-offload/README.md).
// ARM=old runs the runtime as V has it; ARM=new runs it with lab/usage-offload.plan.json applied.
// Same data and requests in both arms: setup grows the copied makaron database, then a Gateway
// stand-in process calls the real usage.cost handler with V's node flags and heap limit.
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

// Like V's Gateway bootstrap (db91-integrity-bootstrap.mjs): one integrity epoch per lifecycle.
// Setup's first open runs the full check and records the receipt; the Gateway stand-in and its
// usage worker reuse it, as V's Gateway, workers and usage worker do within 26 h of preflight.
const integrityBase = path.join(fs.realpathSync(process.env.OPENCLAW_STATE_DIR), '.db91-integrity');
const epoch = randomUUID();
fs.mkdirSync(path.join(integrityBase, epoch), { recursive: true, mode: 0o700 });
fs.chmodSync(integrityBase, 0o700);
const integrityEnv = { OPENCLAW_DB91_INTEGRITY_EPOCH: epoch, OPENCLAW_DB91_INTEGRITY_DIR: path.join(integrityBase, epoch) };
const setup = run([path.join(here, 'usage-offload-setup.mjs')], integrityEnv);
console.log(JSON.stringify({ phase: 'setup', ...setup }));
if (setup.code !== 0) process.exit(1);
const harness = run([
  '--experimental-async-context-frame',
  `--max-old-space-size=${process.env.UO_GATEWAY_HEAP_MB ?? 7168}`,
  path.join(here, 'usage-offload-harness.mjs'),
], integrityEnv);
console.log(JSON.stringify({ phase: 'harness', arm: process.env.ARM, ...harness }));
process.exit(harness.code === 0 ? 0 : 2);
