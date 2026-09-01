#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
NODE="${VLAB_NODE:-/opt/vlab/node/bin/node}"
HARNESS_TEST="${VLAB_HARNESS_TEST_SOURCE:-${LAB_ROOT}/tmp/vlab-agent-worker-harness-parity.mjs}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-harness-parity.sh must run as root" >&2
  exit 1
fi

exec sudo -u vlab env \
  HOME="$LAB_ROOT" \
  OPENCLAW_HOME="$LAB_ROOT" \
  OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
  OPENCLAW_CONFIG_PATH="${LAB_ROOT}/state/openclaw.json" \
  OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
  TMPDIR="${LAB_ROOT}/tmp" \
  VLAB_GATEWAY_SERVICE="${VLAB_GATEWAY_SERVICE:-openclaw-vlab-gateway.service}" \
  "$NODE" "$HARNESS_TEST"
