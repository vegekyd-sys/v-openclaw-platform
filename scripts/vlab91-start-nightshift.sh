#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]] || { echo 'Wrong host'; exit 1; }
candidate=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
release=/srv/vlab/releases/nightshift-workboard/bbc2ead-openclaw81-statefix1
node=/opt/vlab/node-v22.23.1-linux-x64/bin/node
core=$candidate/runtime/npm-global/lib/node_modules/openclaw
[[ $($node -p "require('$core/package.json').version") == 2026.9.1 ]]
[[ -f /srv/vlab/staging/pre91-backup/mirror.tar.zst.verified ]]
[[ $(systemctl show openclaw-vlab-production-mirror-v8.service -p ActiveState --value) == active ]]
[[ $(systemctl show nightshift-vlab-production-mirror.service -p MainPID --value) == 0 ]]
[[ -f $candidate/nightshift/data/nightshift.sqlite ]]
[[ -f $release/examples/workflows/generic-agent-delivery.workflow.md ]]
if ss -ltnH 'sport = :24980' | grep -q .; then echo 'Mirror Night Shift port occupied'; exit 1; fi
# External mode: restoring the service must not dispatch old cloned jobs.
# Acceptance explicitly pulses only the dedicated test instance afterward.
systemd-run --quiet --unit=nightshift-vlab-production-mirror \
  --property=User=vlab --property=Group=vlab \
  --property=WorkingDirectory="$release" \
  --property=Restart=on-failure --property=RestartSec=10 \
  --property=MemoryHigh=768M --property=MemoryMax=1G \
  --property=EnvironmentFile="-$candidate/state/.env.production-mirror" \
  --property=EnvironmentFile="-$candidate/state/gateway.systemd.env.production-mirror" \
  --property=EnvironmentFile=-/srv/vlab/state/feishu.env \
  --property=EnvironmentFile=-/srv/vlab/state/makaron-personal.env \
  --property=EnvironmentFile=-/srv/vlab/state/scene.env \
  --setenv=HOME="$candidate" --setenv=OPENCLAW_HOME="$candidate" \
  --setenv=OPENCLAW_STATE_DIR="$candidate/state" \
  --setenv=OPENCLAW_CONFIG_PATH="$candidate/state/openclaw.json" \
  --setenv=OPENCLAW_WORKSPACE_DIR="$candidate/workspace" \
  --setenv=OPENCLAW_GATEWAY_PORT=24993 \
  --setenv=NIGHTSHIFT_GATEWAY_URL=ws://127.0.0.1:24993 \
  --setenv=NIGHTSHIFT_OPENCLAW_COMMAND="$node" \
  --setenv=NIGHTSHIFT_OPENCLAW_ENTRY="$core/dist/index.js" \
  --setenv=NIGHTSHIFT_SOURCE_STATE_DIR="$candidate/state" \
  --setenv=NIGHTSHIFT_PORT=24980 --setenv=NIGHTSHIFT_HOST=127.0.0.1 \
  --setenv=NIGHTSHIFT_DATA_DIR="$candidate/nightshift/data" \
  --setenv=NIGHTSHIFT_WORKFLOW_PATH="$release/examples/workflows/generic-agent-delivery.workflow.md" \
  --setenv=NIGHTSHIFT_BOARD=nightshift-mirror-81 \
  --setenv=NIGHTSHIFT_SCHEDULER_MODE=external --setenv=NIGHTSHIFT_FEISHU_NOTIFICATIONS=0 \
  --setenv=PATH="$candidate/runtime/npm-global/bin:/opt/vlab/node-v22.23.1-linux-x64/bin:/usr/local/bin:/usr/bin:/bin" \
  "$node" --no-warnings "$release/apps/nightshift-dashboard/server/index.mjs"
echo 'NIGHTSHIFT_RESTORED_NOT_ACCEPTED'
