#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]] || { echo 'Wrong host'; exit 1; }
candidate=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
backup=/srv/vlab/staging/pre91-backup/mirror.tar.zst
worker=${VLAB91_WORKER_RELEASE:?Versioned Worker release is required}
node=/opt/vlab/node-v22.23.1-linux-x64/bin/node
entry=$candidate/runtime/npm-global/lib/node_modules/openclaw/dist/index.js
[[ -f $backup && -f $backup.verified ]] || { echo 'Verified snapshot required'; exit 1; }
[[ $(systemctl show openclaw-vlab-production-mirror-v8.service -p MainPID --value) == 0 ]]
[[ $(systemctl show nightshift-vlab-production-mirror.service -p MainPID --value) == 0 ]]
[[ $($node -p "require('$candidate/runtime/npm-global/lib/node_modules/openclaw/package.json').version") == 2026.8.1 ]]
mkdir -p /srv/vlab/staging/pre91-backup/evidence
chmod 700 /srv/vlab/staging/pre91-backup/evidence
umask 077
"$node" /srv/vlab/staging/audit-session-migration.mjs "$candidate/state" > /srv/vlab/staging/pre91-backup/evidence/sessions-before.json
systemd-run --quiet --wait --pipe --collect --unit=vlab91-official-update \
  --property=User=vlab --property=Group=vlab \
  --property=WorkingDirectory="$candidate" \
  --property=MemoryHigh=3G --property=MemoryMax=4G \
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
  --setenv=npm_config_prefix="$candidate/runtime/npm-global" \
  --setenv=VLAB91_WORKER_RELEASE="$worker" \
  --setenv=PATH="$candidate/runtime/npm-global/bin:/opt/vlab/node-v22.23.1-linux-x64/bin:/usr/local/bin:/usr/bin:/bin" \
  /bin/bash /srv/vlab/staging/vlab91-update-inner.sh \
  > /srv/vlab/staging/pre91-backup/evidence/official-update.log 2>&1
echo OFFICIAL_UPDATE_EXIT_ZERO
"$node" "$entry" --version
"$node" /srv/vlab/staging/audit-session-migration.mjs "$candidate/state" > /srv/vlab/staging/pre91-backup/evidence/sessions-after-update.json
