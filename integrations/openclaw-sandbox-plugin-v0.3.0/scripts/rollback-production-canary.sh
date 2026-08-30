#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

backup_root=/home/openclaw/.openclaw/backups/project-sandbox-v0.3.1
backup_dir=${1:-}
latest_backup=$backup_root/LATEST
gateway_service=openclaw-gateway.service
broker_service=v-project-sandbox-broker.service
tunnel_service=v-openshell-tunnel.service
state_root=/home/openclaw/.openclaw/experiments/project-sandbox-v0.3.1/state
lock_path=/run/lock/v-project-sandbox-v0.3.1.lock

[[ $(id -u) -eq 0 ]] || { echo "run as root" >&2; exit 1; }
if [[ ${PROJECT_SANDBOX_LOCK_HELD:-0} != 1 ]]; then
  exec 9>"$lock_path"
  flock -n 9 || { echo "another Project Sandbox install or rollback is active" >&2; exit 1; }
fi
if [[ -z $backup_dir && -f $latest_backup ]]; then backup_dir=$(<"$latest_backup"); fi
[[ -n $backup_dir && $backup_dir == "$backup_root"/* && -d $backup_dir ]] || {
  echo "pass an exact Project Sandbox v0.3.1 backup" >&2; exit 1;
}
[[ -f $backup_dir/service-state.env ]] || { echo "backup service state is missing" >&2; exit 1; }

if [[ -S $state_root/broker.sock ]]; then
  health=$(/opt/openclaw-experiments/project-sandbox-v0.3.1/current/bin/sandboxctl.mjs health) || {
    echo "rollback refused: unable to verify that Project Sandbox is idle" >&2; exit 1;
  }
  jq -e '(.workspaces.active // 0) == 0 and (.workspaces.opening // 0) == 0 and (.workspaces.queued // 0) == 0' <<<"$health" >/dev/null || {
    echo "rollback refused: active or queued Sandbox work remains" >&2; exit 1;
  }
fi

service_value() { sed -n "s/^${1}=//p" "$backup_dir/service-state.env" | head -n 1; }
gateway_enabled=$(service_value gateway_enabled)
gateway_active=$(service_value gateway_active)
broker_enabled=$(service_value broker_enabled)
broker_active=$(service_value broker_active)
tunnel_enabled=$(service_value tunnel_enabled)
tunnel_active=$(service_value tunnel_active)

systemctl disable --now "$gateway_service" >/dev/null 2>&1 || true
systemctl disable --now "$broker_service" >/dev/null 2>&1 || true
systemctl disable --now "$tunnel_service" >/dev/null 2>&1 || true
restore_entry() {
  local target=$1 saved=$backup_dir/${1#/}
  if [[ -e $target || -L $target ]]; then rm -rf -- "$target"; fi
  if [[ -e $saved || -L $saved ]]; then install -d "$(dirname "$target")"; cp -a "$saved" "$target"; fi
}
restore_entry /home/openclaw/.openclaw/openclaw.json
restore_entry /home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
restore_entry /home/openclaw/.openclaw/extensions/project-sandbox
restore_entry /etc/systemd/system/v-project-sandbox-broker.service
restore_entry /etc/systemd/system/v-openshell-tunnel.service
restore_entry /opt/openclaw-experiments/project-sandbox-v0.3.1/current
restore_entry /usr/local/sbin/v-project-sandbox-rollback
systemctl daemon-reload

case "$tunnel_enabled" in enabled|enabled-runtime|linked|linked-runtime) systemctl enable "$tunnel_service" >/dev/null 2>&1 || true ;; esac
case "$broker_enabled" in enabled|enabled-runtime|linked|linked-runtime) systemctl enable "$broker_service" >/dev/null 2>&1 || true ;; esac
case "$gateway_enabled" in enabled|enabled-runtime|linked|linked-runtime) systemctl enable "$gateway_service" >/dev/null 2>&1 || true ;; esac
[[ $tunnel_active == active ]] && systemctl start "$tunnel_service"
[[ $broker_active == active ]] && systemctl start "$broker_service"
[[ $gateway_active == active ]] && systemctl start "$gateway_service"
[[ $gateway_active != active ]] || systemctl is-active --quiet "$gateway_service"
echo "rollback restored $backup_dir; Session, Memory, Broker state, and artifacts were preserved"
