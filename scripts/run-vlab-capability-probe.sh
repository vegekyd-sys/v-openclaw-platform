#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]] || exit 1
g=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
systemd-run --quiet --wait --pipe --collect --unit="vlab-capability-probe-$$" \
 --property=User=vlab --property=Group=vlab --property=WorkingDirectory="$g" \
 --property=MemoryHigh=3G --property=MemoryMax=4G \
 --property=EnvironmentFile="-$g/state/.env.production-mirror" \
 --property=EnvironmentFile="-$g/state/gateway.systemd.env.production-mirror" \
 --property=EnvironmentFile="-$g/state/vbrowser.production-mirror.env" \
 --property=EnvironmentFile=-/srv/vlab/state/feishu.env \
 --setenv=HOME="$g" --setenv=OPENCLAW_HOME="$g" --setenv=OPENCLAW_STATE_DIR="$g/state" \
 --setenv=OPENCLAW_CONFIG_PATH="$g/experiments/agent-worker-isolation-v1/worker-openclaw.json" \
 --setenv=VLAB_OPENCLAW_AGENT_RUNTIME="$g/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/agent-runtime.js" \
 --setenv=PATH="/opt/vlab/node-v22.23.1-linux-x64/bin:/usr/local/bin:/usr/bin:/bin" \
 /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab/staging/probe-worker-channel-capabilities.mjs \
 "$g/runtime/npm-global/lib/node_modules/openclaw" "${1:-baseline}"
