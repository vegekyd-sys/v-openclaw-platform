#!/usr/bin/env bash
# Install the agent-shell cgroup sidecar on V (scripts/v-agent-shell-cgroup.py).
#
#   scripts/install-v-agent-shell-cgroup.sh v            dry run only: shows what it would move
#   scripts/install-v-agent-shell-cgroup.sh v --enable   install, enable and start the unit
#
# No Gateway restart: the Gateway unit is already delegated to the service user, and the sidecar
# enables the io controller inside that subtree itself. To undo: systemctl disable --now
# v-agent-shell-cgroup; processes already moved stay in agent-shell until they exit or the Gateway
# restarts.
set -euo pipefail
host=${1:?usage: install-v-agent-shell-cgroup.sh <ssh-host> [--enable]}
enable=${2:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
service=/sys/fs/cgroup/system.slice/openclaw-gateway.service

ssh "$host" "test -d $service/foreground && test \"\$(stat -c %U $service)\" = openclaw" \
  || { echo "openclaw-gateway.service is not delegated to openclaw with a foreground subgroup" >&2; exit 1; }
stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "$repo_root/scripts/v-agent-shell-cgroup.py" "$host:$stage/agent-shell-cgroup.py"
scp -q "$repo_root/systemd/v-agent-shell-cgroup.service" "$host:$stage/v-agent-shell-cgroup.service"
ssh "$host" "sudo install -d -m 0755 -o root -g root /opt/v-ops
sudo install -m 0755 -o root -g root $stage/agent-shell-cgroup.py /opt/v-ops/agent-shell-cgroup.py
sudo -u openclaw /usr/bin/python3 /opt/v-ops/agent-shell-cgroup.py --service-cgroup $service --once --dry-run \
  --io-read-bps 80M --io-write-bps 80M --io-path /home/openclaw/.openclaw --io-path /srv/openclaw-data/disk1"
if [ "$enable" = "--enable" ]; then
  ssh "$host" "sudo install -m 0644 -o root -g root $stage/v-agent-shell-cgroup.service /etc/systemd/system/v-agent-shell-cgroup.service
sudo systemctl daemon-reload && sudo systemctl enable --now v-agent-shell-cgroup.service
sleep 3; systemctl is-active v-agent-shell-cgroup.service; cat $service/agent-shell/memory.high $service/agent-shell/io.max; wc -l < $service/agent-shell/cgroup.procs"
fi
