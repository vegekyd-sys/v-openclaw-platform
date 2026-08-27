#!/usr/bin/env bash
set -euo pipefail

backup_dir=${1:-}
if [[ $(id -u) -ne 0 ]]; then
  echo "rollback-vlab.sh must run as root" >&2
  exit 1
fi
if [[ -z $backup_dir || $backup_dir != /srv/vlab/backups/sandbox-broker-v0.2.0/* || ! -d $backup_dir ]]; then
  echo "pass an exact backup under /srv/vlab/backups/sandbox-broker-v0.2.0" >&2
  exit 1
fi

if [[ -S /srv/vlab/state/sandbox-broker/broker.sock ]]; then
  sudo -u vlab -H /srv/vlab/bin/sandboxctl prune || true
fi
systemctl disable --now vlab-sandbox-broker.service || true

restore_or_remove() {
  local target=$1
  local saved=$backup_dir/${target#/}
  if [[ -f $saved ]]; then
    install -d "$(dirname "$target")"
    cp -a "$saved" "$target"
  else
    rm -f "$target"
  fi
}

restore_or_remove /etc/systemd/system/vlab-sandbox-broker.service
restore_or_remove /srv/vlab/workspace/skills/project-sandbox/SKILL.md
restore_or_remove /srv/vlab/state/sandbox/policies/offline-dev-v1.yaml
restore_or_remove /srv/vlab/state/sandbox/policies/packages-dev-v1.yaml
rm -f /srv/vlab/bin/sandboxctl
systemctl daemon-reload

if [[ -f /etc/systemd/system/vlab-sandbox-broker.service ]]; then
  systemctl enable --now vlab-sandbox-broker.service
fi
echo "rollback restored $backup_dir; job state and artifacts were preserved"
