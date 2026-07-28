#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
NODE="${VLAB_NODE:-/opt/vlab/node/bin/node}"
SCRIPT="${VLAB_NATIVE_DISPATCH_SCRIPT:-/tmp/vlab-agent-worker-native-dispatch.mjs}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-native-dispatch.sh must run as root" >&2
  exit 1
fi

exec sudo -u vlab env \
  HOME="$LAB_ROOT" \
  OPENCLAW_HOME="$LAB_ROOT" \
  OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
  OPENCLAW_CONFIG_PATH="${LAB_ROOT}/state/openclaw.json" \
  OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
  LAB_ROOT="$LAB_ROOT" \
  VLAB_NATIVE_SESSION_COUNT="${VLAB_NATIVE_SESSION_COUNT:-9}" \
  VLAB_NATIVE_TOOL_HOLD_SECONDS="${VLAB_NATIVE_TOOL_HOLD_SECONDS:-15}" \
  VLAB_NATIVE_RUN_TIMEOUT_MS="${VLAB_NATIVE_RUN_TIMEOUT_MS:-420000}" \
  VLAB_NATIVE_GATEWAY_TIMEOUT_MS="${VLAB_NATIVE_GATEWAY_TIMEOUT_MS:-480000}" \
  VLAB_NATIVE_SATURATION_WAIT_SECONDS="${VLAB_NATIVE_SATURATION_WAIT_SECONDS:-180}" \
  "$NODE" "$SCRIPT"
