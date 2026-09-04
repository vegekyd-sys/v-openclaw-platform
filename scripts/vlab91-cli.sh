#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]] || { echo 'Wrong host'; exit 1; }
candidate=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
config=${VLAB91_CONFIG_PATH:-$candidate/state/openclaw.json}
case "$config" in
  "$candidate/state/openclaw.json"|"$candidate/experiments/agent-worker-isolation-v1/worker-openclaw.json") ;;
  *) echo 'Config escaped the two isolated mirror domains'; exit 1 ;;
esac
systemd-run --quiet --wait --pipe --collect --unit="vlab91-cli-$$" \
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
  --setenv=OPENCLAW_CONFIG_PATH="$config" \
  --setenv=OPENCLAW_WORKSPACE_DIR="$candidate/workspace" \
  --setenv=OPENCLAW_GATEWAY_PORT=24993 \
  --setenv=npm_config_prefix="$candidate/runtime/npm-global" \
  --setenv=PATH="$candidate/runtime/npm-global/bin:/opt/vlab/node-v22.23.1-linux-x64/bin:/usr/local/bin:/usr/bin:/bin" \
  /opt/vlab/node-v22.23.1-linux-x64/bin/node "$candidate/runtime/npm-global/lib/node_modules/openclaw/dist/index.js" "$@"
