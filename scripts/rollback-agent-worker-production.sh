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
MEDIA_COMPLETION_PATCHER="${STATE_DIR}/patch-openclaw-media-completion-relay.mjs"
TOOL_PROXY_PATCHER=""
FEISHU_STEER_PATCHER=""
SESSION_HOTSET_DROPIN="/etc/systemd/system/${SERVICE}.d/session-hotset-v0.2.0.conf"
FEISHU_STEER_DROPIN="/etc/systemd/system/${SERVICE}.d/worker-steer-v0.2.3.conf"
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
[[ -f "$MEDIA_COMPLETION_PATCHER" ]] || {
  echo "missing media completion rollback patcher" >&2
  exit 1
}

backup_config="$(jq -r '.backupConfig' "$ACTIVE_MANIFEST")"
backup_worker_config="$(jq -r '.backupWorkerConfig' "$ACTIVE_MANIFEST")"
previous_active_manifest="$(
  jq -r '.previousActiveManifest' "$ACTIVE_MANIFEST"
)"
previous_hotset_existed="$(
  jq -r '.previousSessionHotset.existed // false' "$ACTIVE_MANIFEST"
)"
previous_hotset_module="$(
  jq -r '.previousSessionHotset.module // ""' "$ACTIVE_MANIFEST"
)"
backup_hotset_dropin="$(
  jq -r '.previousSessionHotset.dropInBackup // ""' "$ACTIVE_MANIFEST"
)"
TOOL_PROXY_PATCHER="$(
  jq -r '.gatewayOwnedToolIsolation.patcher // empty' "$ACTIVE_MANIFEST"
)"
tool_proxy_preexisting="$(
  jq -r '.gatewayOwnedToolIsolation.preExisting // false' "$ACTIVE_MANIFEST"
)"
media_completion_preexisting="$(
  jq -r '.mediaCompletionRelay.preExisting // false' "$ACTIVE_MANIFEST"
)"
FEISHU_STEER_PATCHER="$(
  jq -r '.activeRunSteer.patcher // empty' "$ACTIVE_MANIFEST"
)"
feishu_steer_preexisting="$(
  jq -r '.activeRunSteer.preExisting // false' "$ACTIVE_MANIFEST"
)"
mapfile -t feishu_steer_patched_roots < <(
  jq -r '.activeRunSteer.patchedPackageRoots[]? // empty' "$ACTIVE_MANIFEST"
)
FEISHU_STEER_DROPIN="$(
  jq -r '.activeRunSteer.dropIn // empty' "$ACTIVE_MANIFEST"
)"
steer_dropin_was_present="$(
  jq -r '.activeRunSteer.previousDropInExisted // false' "$ACTIVE_MANIFEST"
)"
previous_steer_dropin="$(
  jq -r '.activeRunSteer.previousDropInBackup // empty' "$ACTIVE_MANIFEST"
)"
if [[ -z "$FEISHU_STEER_DROPIN" ]]; then
  FEISHU_STEER_DROPIN="/etc/systemd/system/${SERVICE}.d/worker-steer-v0.2.3.conf"
fi
for required in \
  "$backup_config" \
  "$backup_worker_config" \
  "$previous_active_manifest"; do
  [[ -f "$required" ]] || {
    echo "missing rollback input: $required" >&2
    exit 1
  }
done
if [[ "$tool_proxy_preexisting" != true \
  && ! -f "$TOOL_PROXY_PATCHER" ]]; then
  echo "missing Workshop tool proxy rollback patcher: $TOOL_PROXY_PATCHER" >&2
  exit 1
fi

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

if [[ "$tool_proxy_preexisting" != true ]]; then
  "$NODE" "$TOOL_PROXY_PATCHER" --restore "$OPENCLAW_PACKAGE"
fi
if [[ "$media_completion_preexisting" != true ]]; then
  "$NODE" "$MEDIA_COMPLETION_PATCHER" --restore "$OPENCLAW_PACKAGE"
fi
if [[ "${#feishu_steer_patched_roots[@]}" -eq 0 \
  && "$feishu_steer_preexisting" != true ]]; then
  feishu_steer_patched_roots=("$OPENCLAW_PACKAGE")
fi
if [[ -n "$FEISHU_STEER_PATCHER" && -f "$FEISHU_STEER_PATCHER" ]]; then
  for package_root in "${feishu_steer_patched_roots[@]}"; do
    "$NODE" "$FEISHU_STEER_PATCHER" --restore "$package_root"
  done
fi
if [[ "$steer_dropin_was_present" == true ]]; then
  [[ -f "$previous_steer_dropin" ]] || {
    echo "missing previous Feishu Steer drop-in" >&2
    exit 1
  }
  install -o root -g root -m 0644 \
    "$previous_steer_dropin" "$FEISHU_STEER_DROPIN"
else
  rm -f "$FEISHU_STEER_DROPIN"
fi
if [[ "$previous_hotset_existed" == true ]]; then
  [[ -n "$previous_hotset_module" && -f "$backup_hotset_dropin" ]] || {
    echo "missing previous Session Hotset upgrade state" >&2
    exit 1
  }
  "$NODE" "$SESSION_HOTSET_PATCHER" \
    "$OPENCLAW_PACKAGE" "$previous_hotset_module"
  install -o root -g root -m 0644 \
    "$backup_hotset_dropin" "$SESSION_HOTSET_DROPIN"
else
  "$NODE" "$SESSION_HOTSET_PATCHER" --restore "$OPENCLAW_PACKAGE"
  rm -f "$SESSION_HOTSET_DROPIN"
fi
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
