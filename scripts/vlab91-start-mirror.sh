#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]] || { echo 'Wrong host'; exit 1; }
candidate=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
node=/opt/vlab/node-v22.23.1-linux-x64/bin/node
entry=$candidate/runtime/npm-global/lib/node_modules/openclaw/dist/index.js
[[ $($node -p "require('$candidate/runtime/npm-global/lib/node_modules/openclaw/package.json').version") == 2026.9.1 ]]
[[ -f /srv/vlab/staging/pre91-backup/mirror.tar.zst.verified ]]
[[ $(systemctl show openclaw-vlab-production-mirror-v8.service -p MainPID --value) == 0 ]]
if ss -ltnH 'sport = :24993' | grep -q .; then echo 'Mirror port is occupied'; exit 1; fi
systemd-run --quiet --unit=openclaw-vlab-production-mirror-v8 \
  --property=User=vlab --property=Group=vlab \
  --property=WorkingDirectory="$candidate/workspace" \
  --property=Restart=on-failure --property=RestartSec=10 \
  --property=TimeoutStopSec=60 --property=KillMode=mixed \
  --property=MemoryHigh=12G --property=MemoryMax=14G --property=CPUQuota=400% \
  --property=EnvironmentFile="-$candidate/state/.env.production-mirror" \
  --property=EnvironmentFile="-$candidate/state/gateway.systemd.env.production-mirror" \
  --property=EnvironmentFile="-$candidate/state/vbrowser.production-mirror.env" \
  --property=EnvironmentFile=-/srv/vlab/state/feishu.env \
  --property=EnvironmentFile=-/srv/vlab/state/makaron-personal.env \
  --property=EnvironmentFile=-/srv/vlab/state/scene.env \
  --setenv=HOME="$candidate" --setenv=OPENCLAW_HOME="$candidate" \
  --setenv=OPENCLAW_STATE_DIR="$candidate/state" \
  --setenv=OPENCLAW_CONFIG_PATH="$candidate/state/openclaw.json" \
  --setenv=OPENCLAW_WORKSPACE_DIR="$candidate/workspace" \
  --setenv=OPENCLAW_GATEWAY_PORT=24993 \
  --setenv=PATH="$candidate/runtime/npm-global/bin:/opt/vlab/node-v22.23.1-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  "$node" --max-old-space-size=4096 "$entry" gateway --port 24993
echo 'START_REQUESTED_NOT_ACCEPTED'
