import assert from 'node:assert/strict';

export const releaseId = 'v2026.9.1-db91.6';
export const oldReleaseId = 'v2026.9.1-db91.5';
export const oldRelease = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.5';
export const newRelease = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6';
export const permanentDropinName = 'zzzzzzzz-db91-state-db-fastpath-v6.conf';
export const restartReason = 'db91-state-db-exec-approvals-fastpath-production-cutover';
export const preservedMemoryFtsSha256 = '7267571c87d05e1662a8277b86a22760d77679e7ff48474022983eec2238584b';
export const feishuPeerLink = '/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu/node_modules/openclaw';
export const oldFeishuPeerTarget = `${oldRelease}/core`;
export const newFeishuPeerTarget = `${newRelease}/core`;

export const productionFiles = [{
  source: 'lab/release-files/exec-approvals-store-D159_AKa.js',
  target: 'core/dist/exec-approvals-store-D159_AKa.js',
  beforeSha256: '173d3fecf20e9e8fe1e7da153292224391dea6f5afad0cdebea116c420653789',
  afterSha256: '231279ca6aeea755bd63eb0c06219a254d11236c39e4a1a51ffe126fc452f5c1',
}];

export function planProductionConfig(bytes, {expectedMinWorkers = 5} = {}) {
  const config = JSON.parse(bytes);
  let coreRewrites = 0;
  let workerRewrites = 0;
  const rewrite = (value) => {
    if (value === `${oldRelease}/core`) {
      coreRewrites += 1;
      return `${newRelease}/core`;
    }
    if (value === `${oldRelease}/worker`) {
      workerRewrites += 1;
      return `${newRelease}/worker`;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, rewrite(nested)]));
    }
    return value;
  };
  const next = rewrite(config);
  assert.equal(coreRewrites, 1, 'Expected exactly one db91.5 core pointer');
  assert.equal(workerRewrites, 1, 'Expected exactly one db91.5 Worker pointer');
  const worker = next.plugins?.entries?.['vlab-agent-worker-isolation']?.config;
  assert.deepEqual({
    minWorkers: worker?.minWorkers,
    maxWorkers: worker?.maxWorkers,
    sessionsPerWorker: worker?.sessionsPerWorker,
  }, {
    minWorkers: expectedMinWorkers,
    maxWorkers: 15,
    sessionsPerWorker: 3,
  }, 'Production Worker capacity must remain unchanged');
  return `${JSON.stringify(next, null, 2)}\n`;
}

export function productionReleaseUnit() {
  const state = '/home/openclaw/.openclaw';
  const node = '/opt/node-v22.23.1/bin/node';
  const core = `${newRelease}/core`;
  return `[Service]
ExecStart=
ExecStart=${node} --inspect=127.0.0.1:9229 --max-old-space-size=12288 ${core}/dist/index.js gateway --port 22793
ExecStartPre=
ExecStartPre=-+/bin/bash ${state}/releases/openclaw91-feishu-parity-v1/apply-openclaw91-feishu-parity.sh ${core} ${state} ${state}/releases/openclaw91-feishu-parity-v1
ExecStartPre=${node} ${state}/experiments/agent-worker-isolation-v1/prune-openclaw-session-hotset.mjs ${state}/agents /opt/openclaw-experiments/agent-worker-isolation-v1/releases/80e6d3bfe447a581451bfce2d74e25517b11d9ef/session-hotset.mjs 180000
ExecStartPre=-+${node} ${state}/releases/steer91-0.2.11/apply-feishu-steer91-prestart.mjs ${state}
Environment=OPENCLAW_DB91_READ_AHEAD_ENABLE=1
Environment=OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE=1
Environment=OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE=1
Environment=V_RELEASE_VERSION=${releaseId}
KillMode=mixed
`;
}

export const controlledStopPolicy = '[Service]\nKillMode=mixed\nKillSignal=SIGUSR1\n';
