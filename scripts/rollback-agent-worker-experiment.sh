#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
STATE_DIR="${LAB_ROOT}/experiments/agent-worker-isolation-v1"
ACTIVE_MANIFEST="${STATE_DIR}/active.json"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
OPENCLAW_PACKAGE="/opt/vlab/current/node_modules/openclaw"
SESSION_HOTSET_PATCHER="${STATE_DIR}/patch-openclaw-session-hotset.mjs"
MEDIA_COMPLETION_PATCHER="${STATE_DIR}/patch-openclaw-media-completion-relay.mjs"
TOOL_PROXY_PATCHER=""
FEISHU_STEER_PATCHER=""
SESSION_HOTSET_DROPIN="/etc/systemd/system/openclaw-vlab-gateway.service.d/session-hotset-v0.2.0.conf"
FEISHU_STEER_DROPIN="/etc/systemd/system/openclaw-vlab-gateway.service.d/worker-steer-v0.2.3.conf"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

run_openclaw() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    TMPDIR="${LAB_ROOT}/tmp" \
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
previous_active_manifest="$(
  jq -r '.previousActiveManifest // empty' "$ACTIVE_MANIFEST"
)"
previous_hotset_existed="$(
  jq -r '.previousSessionHotset.existed // false' "$ACTIVE_MANIFEST"
)"
previous_hotset_module="$(
  jq -r '.previousSessionHotset.module // empty' "$ACTIVE_MANIFEST"
)"
previous_hotset_dropin="$(
  jq -r '.previousSessionHotset.dropInBackup // empty' "$ACTIVE_MANIFEST"
)"
TOOL_PROXY_PATCHER="$(jq -r '.gatewayOwnedToolIsolation.patcher // empty' "$ACTIVE_MANIFEST")"
TOOL_PROXY_PREEXISTING="$(jq -r '.gatewayOwnedToolIsolation.preExisting // false' "$ACTIVE_MANIFEST")"
MEDIA_COMPLETION_PREEXISTING="$(jq -r '.mediaCompletionRelay.preExisting // false' "$ACTIVE_MANIFEST")"
FEISHU_STEER_PATCHER="$(jq -r '.activeRunSteer.patcher // empty' "$ACTIVE_MANIFEST")"
FEISHU_STEER_PREEXISTING="$(jq -r '.activeRunSteer.preExisting // false' "$ACTIVE_MANIFEST")"
mapfile -t FEISHU_STEER_PATCHED_ROOTS < <(
  jq -r '.activeRunSteer.patchedPackageRoots[]? // empty' "$ACTIVE_MANIFEST"
)
FEISHU_STEER_DROPIN="$(jq -r '.activeRunSteer.dropIn // empty' "$ACTIVE_MANIFEST")"
FEISHU_STEER_PREVIOUS_DROPIN_EXISTED="$(jq -r '.activeRunSteer.previousDropInExisted // false' "$ACTIVE_MANIFEST")"
FEISHU_STEER_PREVIOUS_DROPIN="$(jq -r '.activeRunSteer.previousDropInBackup // empty' "$ACTIVE_MANIFEST")"
if [[ -z "$FEISHU_STEER_DROPIN" ]]; then
  FEISHU_STEER_DROPIN="/etc/systemd/system/openclaw-vlab-gateway.service.d/worker-steer-v0.2.3.conf"
fi
[[ -f "$config_backup" ]] || {
  echo "missing rollback config: $config_backup" >&2
  exit 1
}

install -d -o vlab -g vlab -m 0700 "${LAB_ROOT}/backups/agent-worker-isolation-v1"
install -o vlab -g vlab -m 0600 \
  "$CONFIG_PATH" \
  "${LAB_ROOT}/backups/agent-worker-isolation-v1/pre-rollback-${TIMESTAMP}.json"
install -o vlab -g vlab -m 0600 "$config_backup" "$CONFIG_PATH"

[[ -f "$SESSION_HOTSET_PATCHER" ]] || {
  echo "missing Session Hotset rollback patcher: $SESSION_HOTSET_PATCHER" >&2
  exit 1
}
"$NODE" "$SESSION_HOTSET_PATCHER" --restore "$OPENCLAW_PACKAGE"
[[ -f "$MEDIA_COMPLETION_PATCHER" ]] || {
  echo "missing media completion rollback patcher: $MEDIA_COMPLETION_PATCHER" >&2
  exit 1
}
if [[ "$TOOL_PROXY_PREEXISTING" != true \
  && -n "$TOOL_PROXY_PATCHER" \
  && -f "$TOOL_PROXY_PATCHER" ]]; then
  "$NODE" "$TOOL_PROXY_PATCHER" --restore "$OPENCLAW_PACKAGE"
fi
if [[ "$MEDIA_COMPLETION_PREEXISTING" != true ]]; then
  "$NODE" "$MEDIA_COMPLETION_PATCHER" --restore "$OPENCLAW_PACKAGE"
fi
if [[ "${#FEISHU_STEER_PATCHED_ROOTS[@]}" -eq 0 \
  && "$FEISHU_STEER_PREEXISTING" != true ]]; then
  FEISHU_STEER_PATCHED_ROOTS=("$OPENCLAW_PACKAGE")
fi
if [[ -n "$FEISHU_STEER_PATCHER" && -f "$FEISHU_STEER_PATCHER" ]]; then
  for package_root in "${FEISHU_STEER_PATCHED_ROOTS[@]}"; do
    "$NODE" "$FEISHU_STEER_PATCHER" --restore "$package_root"
  done
fi
if [[ "$FEISHU_STEER_PREVIOUS_DROPIN_EXISTED" == true ]]; then
  [[ -f "$FEISHU_STEER_PREVIOUS_DROPIN" ]] || {
    echo "missing previous Feishu Steer drop-in" >&2
    exit 1
  }
  install -o root -g root -m 0644 \
    "$FEISHU_STEER_PREVIOUS_DROPIN" "$FEISHU_STEER_DROPIN"
else
  rm -f "$FEISHU_STEER_DROPIN"
fi
if [[ "$previous_hotset_existed" == true ]]; then
  [[ -n "$previous_hotset_module" && -f "$previous_hotset_dropin" ]] || {
    echo "missing previous Session Hotset rollback state" >&2
    exit 1
  }
  "$NODE" "$SESSION_HOTSET_PATCHER" \
    "$OPENCLAW_PACKAGE" "$previous_hotset_module"
  install -o root -g root -m 0644 \
    "$previous_hotset_dropin" "$SESSION_HOTSET_DROPIN"
else
  rm -f "$SESSION_HOTSET_DROPIN"
fi
systemctl daemon-reload

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

if [[ -n "$previous_active_manifest" && -f "$previous_active_manifest" ]]; then
  install -o vlab -g vlab -m 0600 \
    "$previous_active_manifest" "$ACTIVE_MANIFEST"
else
  jq \
    --arg rolled_back_at "$TIMESTAMP" \
    '.status = "rolled_back" | .rolledBackAt = $rolled_back_at' \
    "$ACTIVE_MANIFEST" > "${ACTIVE_MANIFEST}.new"
  chown vlab:vlab "${ACTIVE_MANIFEST}.new"
  chmod 0600 "${ACTIVE_MANIFEST}.new"
  mv "${ACTIVE_MANIFEST}.new" "$ACTIVE_MANIFEST"
fi

echo "vLab Agent Worker Isolation rolled back"
