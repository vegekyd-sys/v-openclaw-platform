#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]]
g=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
systemd-run --quiet --wait --pipe --collect --unit="vlab-parity-smoke-$$" \
 --property=User=vlab --property=Group=vlab --property=WorkingDirectory="$g" \
 --property=MemoryHigh=3G --property=MemoryMax=4G \
 --property=EnvironmentFile="-$g/state/.env.production-mirror" \
 --property=EnvironmentFile="-$g/state/gateway.systemd.env.production-mirror" \
 --property=EnvironmentFile=-/srv/vlab/state/feishu.env \
 --setenv=HOME="$g" --setenv=OPENCLAW_HOME="$g" --setenv=OPENCLAW_STATE_DIR="$g/state" \
 --setenv=OPENCLAW_CONFIG_PATH="$g/state/openclaw.json" --setenv=OPENCLAW_GATEWAY_PORT=24993 \
 --setenv=PATH="$g/runtime/npm-global/bin:/opt/vlab/node-v22.23.1-linux-x64/bin:/usr/local/bin:/usr/bin:/bin" \
 /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab/staging/vlab-native-parity-smoke.mjs
