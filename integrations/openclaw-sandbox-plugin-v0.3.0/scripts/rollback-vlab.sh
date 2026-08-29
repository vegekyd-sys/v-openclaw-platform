#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

backup_dir=${1:-}
gateway_service=openclaw-vlab-gateway.service
broker_service=vlab-sandbox-broker.service
lock_path=/run/lock/vlab-openclaw-sandbox-plugin-v0.3.0.lock

if [[ $(id -u) -ne 0 ]]; then
  echo "rollback-vlab.sh must run as root" >&2
  exit 1
fi
if [[ ${VLAB_SANDBOX_LOCK_HELD:-0} != 1 ]]; then
  exec 9>"$lock_path"
  flock -n 9 || { echo "another Project Sandbox install or rollback is active" >&2; exit 1; }
fi
if [[ -z $backup_dir || $backup_dir != /srv/vlab/backups/openclaw-sandbox-plugin-v0.3.0/* || ! -d $backup_dir ]]; then
  echo "pass an exact backup under /srv/vlab/backups/openclaw-sandbox-plugin-v0.3.0" >&2
  exit 1
fi
[[ -f $backup_dir/service-state.env ]] || { echo "backup service state is missing" >&2; exit 1; }

if [[ -S /srv/vlab/state/sandbox-broker/broker.sock ]]; then
  health=$(/srv/vlab/bin/sandboxctl health 2>/dev/null || true)
  [[ -n $health ]] || health='{}'
  if ! active=$(jq -er '((.workspaces.active // 0) + (.workspaces.opening // 0) + (.workspaces.queued // 0)) | floor' <<<"$health" 2>/dev/null); then
    active=0
  fi
  [[ $active =~ ^[0-9]+$ ]] || active=0
  if (( active > 0 )); then
    echo "rollback refused: $active active/queued Project Sandbox workspaces remain" >&2
    exit 1
  fi
fi

service_value() {
  local key=$1
  sed -n "s/^${key}=//p" "$backup_dir/service-state.env" | head -n 1
}

gateway_enabled=$(service_value gateway_enabled)
gateway_active=$(service_value gateway_active)
broker_enabled=$(service_value broker_enabled)
broker_active=$(service_value broker_active)

systemctl disable --now "$gateway_service" >/dev/null 2>&1 || true
systemctl disable --now "$broker_service" >/dev/null 2>&1 || true

restore_entry() {
  local target=$1
  local saved=$backup_dir/${target#/}
  if [[ -e $target || -L $target ]]; then
    rm -rf -- "$target"
  fi
  if [[ -e $saved || -L $saved ]]; then
    install -d "$(dirname "$target")"
    cp -a "$saved" "$target"
  fi
}

restore_entry /etc/systemd/system/vlab-sandbox-broker.service
restore_entry /srv/vlab/state/sandbox/policies/offline-dev-v1.yaml
restore_entry /srv/vlab/state/sandbox/policies/packages-dev-v1.yaml
restore_entry /srv/vlab/state/openclaw.json
restore_entry /srv/vlab/experiments/agent-worker-isolation-v1/worker-openclaw.json
restore_entry /srv/vlab/bin/sandboxctl
restore_entry /srv/vlab/state/extensions/project-sandbox
restore_entry /srv/vlab/state/extensions/codex
restore_entry /srv/vlab/releases/openclaw-sandbox-plugin-v0.3.0
if [[ -f $backup_dir/directory-modes.tsv ]]; then
  while IFS=$'\t' read -r mode uid gid directory; do
    [[ -d $directory ]] || continue
    chown "$uid:$gid" "$directory"
    chmod "$mode" "$directory"
  done < "$backup_dir/directory-modes.tsv"
fi
systemctl daemon-reload

case "$broker_enabled" in enabled|enabled-runtime|linked|linked-runtime) systemctl enable "$broker_service" >/dev/null ;; esac
case "$gateway_enabled" in enabled|enabled-runtime|linked|linked-runtime) systemctl enable "$gateway_service" >/dev/null ;; esac
if [[ $broker_active == active ]]; then systemctl start "$broker_service"; fi
if [[ $gateway_active == active ]]; then systemctl start "$gateway_service"; fi

if [[ $broker_active == active ]]; then systemctl is-active --quiet "$broker_service"; fi
if [[ $gateway_active == active ]]; then systemctl is-active --quiet "$gateway_service"; fi
echo "rollback restored $backup_dir; Session, Memory, Broker state, and artifacts were preserved"
