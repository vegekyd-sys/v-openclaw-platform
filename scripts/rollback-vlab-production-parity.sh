#!/usr/bin/env bash
set -Eeuo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
ACTIVE_MANIFEST="${LAB_ROOT}/experiments/production-parity-v1/active.json"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
WORKER_CONFIG_PATH="${LAB_ROOT}/experiments/agent-worker-isolation-v1/worker-openclaw.json"
UNIT_TARGET="/etc/systemd/system/openclaw-vlab-gateway.service"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "rollback-vlab-production-parity.sh must run as root" >&2
  exit 1
fi
[[ -f "$ACTIVE_MANIFEST" ]] || {
  echo "no active vLab parity manifest" >&2
  exit 1
}
backup_dir="$(jq -er '.backupDir' "$ACTIVE_MANIFEST")"
[[ -f "${backup_dir}/openclaw.json" ]] || {
  echo "missing rollback config: ${backup_dir}/openclaw.json" >&2
  exit 1
}

install -o vlab -g vlab -m 0600 "${backup_dir}/openclaw.json" "$CONFIG_PATH"
if [[ -f "${backup_dir}/worker-openclaw.json" ]]; then
  install -o vlab -g vlab -m 0600 \
    "${backup_dir}/worker-openclaw.json" "$WORKER_CONFIG_PATH"
fi
if [[ -f "${backup_dir}/openclaw-vlab-gateway.service" ]]; then
  install -m 0644 \
    "${backup_dir}/openclaw-vlab-gateway.service" "$UNIT_TARGET"
fi
if [[ -L "${backup_dir}/node-target" ]]; then
  ln -sfn "$(readlink "${backup_dir}/node-target")" /opt/vlab/node
fi
systemctl daemon-reload
systemctl restart openclaw-vlab-gateway.service
systemctl is-active --quiet openclaw-vlab-gateway.service
jq '.status = "rolled_back" | .rolledBackAt = (now | todateiso8601)' \
  "$ACTIVE_MANIFEST" > "${ACTIVE_MANIFEST}.new"
chown vlab:vlab "${ACTIVE_MANIFEST}.new"
chmod 0600 "${ACTIVE_MANIFEST}.new"
mv "${ACTIVE_MANIFEST}.new" "$ACTIVE_MANIFEST"
echo "vLab production parity rolled back from ${backup_dir}"
