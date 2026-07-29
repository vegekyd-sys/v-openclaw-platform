#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
NODE="${VLAB_NODE:-/opt/vlab/node/bin/node}"
SCRIPT="${VLAB_WORKSHOP_SYMLINK_SCRIPT:-/tmp/vlab-agent-worker-workshop-symlink.mjs}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-workshop-symlink.sh must run as root" >&2
  exit 1
fi

exec sudo -u vlab env \
  HOME="$LAB_ROOT" \
  OPENCLAW_HOME="$LAB_ROOT" \
  OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
  OPENCLAW_CONFIG_PATH="${LAB_ROOT}/state/openclaw.json" \
  OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
  LAB_ROOT="$LAB_ROOT" \
  "$NODE" "$SCRIPT"
