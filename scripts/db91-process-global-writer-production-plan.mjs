import assert from 'node:assert/strict';

export const releaseId = 'v2026.9.1-db91.2';
export const oldRelease = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1';
export const newRelease = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.2';

export const productionFiles = [
  {
    source: 'lab/release-files/agent-db-process-coordinator.mjs',
    target: 'core/dist/agent-db-process-coordinator.mjs',
    beforeSha256: null,
    afterSha256: '51c170d34fad2b5d0a6b0de8b10d0f32b57384b5db32e78dfd7b80eb7547650e',
  },
  {
    source: 'lab/release-files/session-accessor.sqlite-scope-BwPKGcgm.js',
    target: 'core/dist/session-accessor.sqlite-scope-BwPKGcgm.js',
    beforeSha256: '193a84fe7518a8b83db2315acb0518653011087b17f14f3f9f01cc7aa8a6c834',
    afterSha256: '6817511dc8a40eec8a3de4f13e71fe27d10f6d584bd2d3f7af342e9bbce8e787',
  },
  {
    source: 'lab/release-files/session-transcript-reconcile-j5qhAafV.js',
    target: 'core/dist/session-transcript-reconcile-j5qhAafV.js',
    beforeSha256: '0c0461d43f9147aa6b8d7991466f5f3f1b07924306ccb7cf14cafcd0315b84f3',
    afterSha256: 'b0200676ea135b981d2caff2b6ec08cd608a75e48858fcd333519b046e613e89',
  },
  {
    source: 'lab/release-files/openclaw-agent-db-CUTe8BX6.js',
    target: 'core/dist/openclaw-agent-db-CUTe8BX6.js',
    beforeSha256: 'acbf762a26fcb52e6b6561b3258d4ad54ee7497ee29958bc6f01c445a609320b',
    afterSha256: 'f27dfd63df7347ba9d6cf9026227cb8a36e09fc33da19f17c07ba898b2163024',
  },
  {
    source: 'lab/release-files/server-start-BNcm1gUN.js',
    target: 'core/dist/server-start-BNcm1gUN.js',
    beforeSha256: '845b97e1f276c426497fea21eedb8f7650d16e11dc70765e32e1ef4080e21864',
    afterSha256: '9b71ace5b596fffdaf4263d14fbc5ddac6c8d413dbd48253da7d69fc8bdb6205',
  },
];

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
  assert.equal(coreRewrites, 1, 'Expected exactly one db91.1 core pointer');
  assert.equal(workerRewrites, 1, 'Expected exactly one db91.1 Worker pointer');
  const worker = next.plugins?.entries?.['vlab-agent-worker-isolation']?.config;
  assert.deepEqual(
    {
      minWorkers: worker?.minWorkers,
      maxWorkers: worker?.maxWorkers,
      sessionsPerWorker: worker?.sessionsPerWorker,
    },
    {minWorkers: expectedMinWorkers, maxWorkers: 15, sessionsPerWorker: 3},
    'Production Worker capacity must remain unchanged',
  );
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
