#!/usr/bin/env bash
# Install the Gateway capacity drop-in on V
# (docs/incidents/2026-11-26-gateway-tasks-max-crash-loop.md).
#
#   scripts/install-v-gateway-capacity.sh <ssh-host> [--dry-run | --rollback]
#
# TasksMax applies to the running unit at once (`systemctl set-property --runtime`); the
# preflight timeout applies from the next start. Also removes the two emergency copies made on
# the host on 2026-11-26 (a /run drop-in and a `set-property` file under system.control), so the
# repository file is the only source.
set -euo pipefail

host=${1:?usage: install-v-gateway-capacity.sh <ssh-host> [--dry-run|--rollback]}
mode=${2:-apply}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dropin=/etc/systemd/system/openclaw-gateway.service.d/gateway-capacity.conf
emergency="/run/systemd/system/openclaw-gateway.service.d/zzzz-db91-preflight-timeout.conf /etc/systemd/system.control/openclaw-gateway.service.d/50-TasksMax.conf"

show() {
  ssh "$host" "echo \"$1: \$(systemctl show openclaw-gateway -p TasksMax -p TasksCurrent | tr '\n' ' ')\" \
    \"\$(systemctl show openclaw-gateway -p Environment --value | tr ' ' '\n' | grep PREFLIGHT_TIMEOUT || echo 'preflight timeout: default 300000')\""
}

show before
case "$mode" in
  --dry-run) echo "would install $dropin, remove $emergency, and set TasksMax=16384 at runtime" ;;
  --rollback)
    ssh "$host" "sudo rm -f $dropin && sudo systemctl daemon-reload && sudo systemctl set-property --runtime openclaw-gateway TasksMax=4096"
    show after ;;
  apply)
    stage=$(ssh "$host" 'mktemp -d')
    trap 'ssh "$host" "rm -rf -- $stage"' EXIT
    scp -q "${repo_root}/systemd/openclaw-gateway.service.d/gateway-capacity.conf" "$host:$stage/"
    ssh "$host" "set -e
      sudo install -m 0644 -o root -g root $stage/gateway-capacity.conf $dropin
      sudo rm -f $emergency
      sudo systemctl daemon-reload
      sudo systemctl set-property --runtime openclaw-gateway TasksMax=16384
      test \"\$(systemctl show openclaw-gateway -p TasksMax --value)\" = 16384
      systemctl show openclaw-gateway -p Environment --value | grep -q OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS=3600000"
    show after ;;
  *) echo "unknown mode $mode" >&2; exit 2 ;;
esac
