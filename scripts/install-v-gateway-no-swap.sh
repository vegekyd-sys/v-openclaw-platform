#!/usr/bin/env bash
# Keep the Gateway unit's memory out of swap on V (docs/gateway-freeze-20261016.md).
#
#   scripts/install-v-gateway-no-swap.sh <ssh-host> [--dry-run | --rollback]
#
# Installs the drop-in for later starts and applies the same limit to the running unit with
# `systemctl set-property --runtime` (cgroup memory.swap.max), so no restart is needed.
# Pages that are already in swap stay there until touched: the next full GC reads them back
# once. To avoid that pause, restart the Gateway off-peak or run `swapoff -a && swapon -a`
# when free RAM is well above the swap in use.
set -euo pipefail

host=${1:?usage: install-v-gateway-no-swap.sh <ssh-host> [--dry-run|--rollback]}
mode=${2:-apply}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dropin=/etc/systemd/system/openclaw-gateway.service.d/gateway-no-swap.conf
cg=/sys/fs/cgroup/system.slice/openclaw-gateway.service

show() {
  ssh "$host" "echo \"$1: MemorySwapMax=\$(systemctl show openclaw-gateway -p MemorySwapMax --value)\" \
    \"memory.swap.max=\$(cat $cg/memory.swap.max)\" \"memory.swap.current=\$(( \$(cat $cg/memory.swap.current) / 1048576 ))MB\" \
    \"memory.current=\$(( \$(cat $cg/memory.current) / 1048576 ))MB\" \"MemAvailable=\$(awk '/MemAvailable/{print int(\$2/1024)}' /proc/meminfo)MB\""
}

show before
case "$mode" in
  --dry-run) echo "would install $dropin and set MemorySwapMax=0 at runtime" ;;
  --rollback)
    ssh "$host" "sudo rm -f $dropin && sudo systemctl daemon-reload && sudo systemctl set-property --runtime openclaw-gateway MemorySwapMax=infinity"
    show after ;;
  apply)
    stage=$(ssh "$host" 'mktemp -d')
    trap 'ssh "$host" "rm -rf -- $stage"' EXIT
    scp -q "${repo_root}/systemd/openclaw-gateway.service.d/gateway-no-swap.conf" "$host:$stage/"
    ssh "$host" "set -e
      sudo install -m 0644 -o root -g root $stage/gateway-no-swap.conf $dropin
      sudo systemctl daemon-reload
      sudo systemctl set-property --runtime openclaw-gateway MemorySwapMax=0
      test \"\$(cat $cg/memory.swap.max)\" = 0"
    show after ;;
  *) echo "unknown mode $mode" >&2; exit 2 ;;
esac
