#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="openclaw-gateway.service"
SERVICE_USER="openclaw"
SERVICE_GROUP="openclaw"
OPENCLAW_HOME_DIR="/home/openclaw"
STATE_ROOT="${OPENCLAW_HOME_DIR}/.openclaw"
CONFIG_PATH="${STATE_ROOT}/openclaw.json"
WORKSPACE_DIR="${STATE_ROOT}/workspace"
STATE_DIR="${STATE_ROOT}/experiments/agent-worker-isolation-v1"
WORKER_CONFIG_PATH="${STATE_DIR}/worker-openclaw.json"
ACTIVE_MANIFEST="${STATE_DIR}/active.json"
NODE="/opt/node-v22.23.1/bin/node"
OPENCLAW="/opt/openclaw-2026.7.1/node_modules/openclaw/openclaw.mjs"
OPENCLAW_PACKAGE="/opt/openclaw-2026.7.1/node_modules/openclaw"
SESSION_HOTSET_PATCHER="${STATE_DIR}/patch-openclaw-session-hotset.mjs"
SESSION_HOTSET_DROPIN="/etc/systemd/system/${SERVICE}.d/session-hotset-v0.2.0.conf"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

run_openclaw() {
  sudo -u "$SERVICE_USER" env \
    HOME="$OPENCLAW_HOME_DIR" \
    OPENCLAW_HOME="$OPENCLAW_HOME_DIR" \
    OPENCLAW_STATE_DIR="$STATE_ROOT" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" \
    "$NODE" "$OPENCLAW" "$@"
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "rollback-agent-worker-production.sh must run as root" >&2
  exit 1
fi
[[ -f "$ACTIVE_MANIFEST" ]] || {
  echo "no active Agent Worker Isolation manifest" >&2
  exit 1
}
[[ -f "$SESSION_HOTSET_PATCHER" ]] || {
  echo "missing Session Hotset rollback patcher" >&2
  exit 1
}

backup_config="$(jq -r '.backupConfig' "$ACTIVE_MANIFEST")"
backup_worker_config="$(jq -r '.backupWorkerConfig' "$ACTIVE_MANIFEST")"
previous_active_manifest="$(
  jq -r '.previousActiveManifest' "$ACTIVE_MANIFEST"
)"
for required in \
  "$backup_config" \
  "$backup_worker_config" \
  "$previous_active_manifest"; do
  [[ -f "$required" ]] || {
    echo "missing rollback input: $required" >&2
    exit 1
  }
done

pre_rollback_dir="$(
  dirname "$backup_config"
)/pre-rollback-${TIMESTAMP}"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0700 \
  "$pre_rollback_dir"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$CONFIG_PATH" "${pre_rollback_dir}/openclaw.json"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$WORKER_CONFIG_PATH" "${pre_rollback_dir}/worker-openclaw.json"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$ACTIVE_MANIFEST" "${pre_rollback_dir}/active.json"

install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$backup_config" "$CONFIG_PATH"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$backup_worker_config" "$WORKER_CONFIG_PATH"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$previous_active_manifest" "$ACTIVE_MANIFEST"

"$NODE" "$SESSION_HOTSET_PATCHER" --restore "$OPENCLAW_PACKAGE"
rm -f "$SESSION_HOTSET_DROPIN"
systemctl daemon-reload

run_openclaw config validate >/dev/null
systemctl restart "$SERVICE"
for _ in $(seq 1 60); do
  if systemctl is-active --quiet "$SERVICE" \
    && run_openclaw gateway call health --params '{}' --json >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
systemctl is-active --quiet "$SERVICE"
run_openclaw gateway call health --params '{}' --json >/dev/null

jq -n \
  --arg restored_commit "$(jq -r '.commit' "$ACTIVE_MANIFEST")" \
  --arg pre_rollback_dir "$pre_rollback_dir" \
  '{
    ok: true,
    rolledBack: true,
    restoredCommit: $restored_commit,
    candidateBackup: $pre_rollback_dir
  }'
