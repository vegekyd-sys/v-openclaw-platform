#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
STATE_DIR="${LAB_ROOT}/experiments/agent-worker-isolation-v1"
ACTIVE_MANIFEST="${STATE_DIR}/active.json"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

run_openclaw() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" "$@"
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "rollback-agent-worker-experiment.sh must run as root" >&2
  exit 1
fi
[[ -f "$ACTIVE_MANIFEST" ]] || {
  echo "no active Agent Worker Isolation manifest" >&2
  exit 1
}

config_backup="$(jq -r '.configBackup' "$ACTIVE_MANIFEST")"
[[ -f "$config_backup" ]] || {
  echo "missing rollback config: $config_backup" >&2
  exit 1
}

install -d -o vlab -g vlab -m 0700 "${LAB_ROOT}/backups/agent-worker-isolation-v1"
install -o vlab -g vlab -m 0600 \
  "$CONFIG_PATH" \
  "${LAB_ROOT}/backups/agent-worker-isolation-v1/pre-rollback-${TIMESTAMP}.json"
install -o vlab -g vlab -m 0600 "$config_backup" "$CONFIG_PATH"

run_openclaw config validate >/dev/null
systemctl restart openclaw-vlab-gateway.service

for _ in $(seq 1 30); do
  if systemctl is-active --quiet openclaw-vlab-gateway.service \
    && run_openclaw gateway call health --params '{}' --json >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
run_openclaw gateway call health --params '{}' --json >/dev/null

jq \
  --arg rolled_back_at "$TIMESTAMP" \
  '.status = "rolled_back" | .rolledBackAt = $rolled_back_at' \
  "$ACTIVE_MANIFEST" > "${ACTIVE_MANIFEST}.new"
chown vlab:vlab "${ACTIVE_MANIFEST}.new"
chmod 0600 "${ACTIVE_MANIFEST}.new"
mv "${ACTIVE_MANIFEST}.new" "$ACTIVE_MANIFEST"

echo "vLab Agent Worker Isolation rolled back"
