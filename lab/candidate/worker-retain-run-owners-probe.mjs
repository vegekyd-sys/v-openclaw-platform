// Probe for worker-retain-run-owners against a real OpenClaw dist (no Gateway, no model).
// usage: node lab/candidate/worker-retain-run-owners-probe.mjs <openclaw dist dir> [worker|worker-off|gateway]
// Acquires the Worker's lease and the embedded attempt's lease (bound to its plugin
// generation) for four sequential turns in a throwaway state dir, the way runAgent and the
// embedded runner do, and reports whether turns 2-3 reuse both snapshots and whether a
// config change rebuilds them. Needs Node with SQLite >= 3.50.7 (Node 22.22.3+ / 24.15+).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [dist, mode = 'worker'] = process.argv.slice(2);
if (!dist) throw new Error('usage: worker-retain-run-owners-probe.mjs <openclaw dist dir> [worker|worker-off|gateway]');
if (mode !== 'gateway') globalThis[Symbol.for('versa.vlab.native-attempt-91-v1')] = {};
if (mode === 'worker-off') process.env.OPENCLAW_WORKER_RETAIN_RUN_OWNERS = '0';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'retain-run-owners-'));
process.env.OPENCLAW_STATE_DIR = home;
process.env.HOME = home;
try {
  const { t: acquire } = await import(pathToFileURL(path.join(dist, 'prepared-model-runtime-C1N_aVhw.js')).href);
  const config = { agents: { list: [{ id: 'makaron' }] } };
  const input = (cfg, extra = {}) => ({ config: cfg, agentId: 'makaron', agentDir: path.join(home, 'agents/makaron/agent'),
    workspaceDir: path.join(home, 'workspace'), allowGatewaySubagentBinding: true, ...extra });
  const times = [];
  const snapshots = [];
  for (let turn = 0; turn < 4; turn += 1) {
    const cfg = turn === 3 ? { ...config, meta: { changed: true } } : config;
    const started = performance.now();
    const worker = await acquire(input(cfg), { catalogMode: 'static' });
    const embedded = await acquire(input(cfg, { runtimePluginSelections: [{ provider: 'deepseek', modelId: 'deepseek-chat', agentId: 'makaron' }] }),
      { catalogMode: 'static', pluginGeneration: worker.pluginGeneration });
    times.push(Math.round(performance.now() - started));
    snapshots.push([worker.snapshot, embedded.snapshot]);
    embedded.release();
    worker.release();
  }
  const same = (a, b) => snapshots[a][0] === snapshots[b][0] && snapshots[a][1] === snapshots[b][1];
  console.log(JSON.stringify({ mode, acquireMs: times, warmTurnsReused: same(0, 1) && same(1, 2), configChangeRebuilt: !snapshots[2].some((s, i) => s === snapshots[3][i]) }));
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
