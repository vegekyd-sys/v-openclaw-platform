#!/usr/bin/env bash
set -Eeuo pipefail
candidate=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
node=/opt/vlab/node-v22.23.1-linux-x64/bin/node
entry=$candidate/runtime/npm-global/lib/node_modules/openclaw/dist/index.js
worker=${VLAB91_WORKER_RELEASE:?Versioned Worker release is required}
[[ $worker == /opt/vlab/experiments/worker-openclaw91-* && -f $worker/index.mjs ]]
for config in "$candidate/state/openclaw.json" "$candidate/experiments/agent-worker-isolation-v1/worker-openclaw.json"; do
  paths=$("$node" --input-type=module - "$config" "$worker" <<'JS'
import fs from 'node:fs';
const [config, worker] = process.argv.slice(2);
const paths = JSON.parse(fs.readFileSync(config, 'utf8')).plugins.load.paths;
const old = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/runtime/plugins/agent-worker-isolation-v0.2.8';
if (paths.filter(p => p === old).length !== 1) throw new Error('Unexpected Worker path; refusing broad replacement');
console.log(JSON.stringify(paths.map(p => p === old ? worker : p)));
JS
)
  OPENCLAW_CONFIG_PATH="$config" "$node" "$entry" config set plugins.load.paths "$paths" --strict-json --replace
done
exec "$node" "$entry" update --tag 2026.9.1 --no-restart --yes --json --timeout 600
