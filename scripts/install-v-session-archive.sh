#!/usr/bin/env bash
# Install the daily Night Shift session archive job on V.
#
#   scripts/install-v-session-archive.sh v            # install + dry run, timer NOT enabled
#   scripts/install-v-session-archive.sh v --enable   # also enable the daily timer
#
# Installs /opt/v-session-archive/ and the systemd units. It changes no Gateway
# file or setting; the dry run only reads the agent and Workboard SQLite files.
set -euo pipefail

host=${1:?usage: install-v-session-archive.sh <ssh-host> [--enable]}
enable=${2:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
src="${repo_root}/ops/v-session-archive"

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "$src/archive.py" "$src/README.md" "$src/systemd/v-session-archive.service" \
  "$src/systemd/v-session-archive.timer" "$host:$stage/"

ssh "$host" "sudo install -d -m 0755 -o root -g root /opt/v-session-archive
sudo install -m 0755 -o root -g root $stage/archive.py /opt/v-session-archive/archive.py
sudo install -m 0644 -o root -g root $stage/README.md /opt/v-session-archive/README.md
sudo install -m 0644 -o root -g root $stage/v-session-archive.service /etc/systemd/system/v-session-archive.service
sudo install -m 0644 -o root -g root $stage/v-session-archive.timer /etc/systemd/system/v-session-archive.timer
sudo systemctl daemon-reload"

echo '--- dry run (reads only) ---'
ssh "$host" 'cd /tmp && sudo -n -u openclaw -H ionice -c3 nice -n19 python3 /opt/v-session-archive/archive.py --max-per-run 0 | tail -1'

if [[ "$enable" == "--enable" ]]; then
  ssh "$host" 'sudo systemctl enable --now v-session-archive.timer && systemctl list-timers v-session-archive.timer --no-pager'
else
  echo 'timer not enabled; rerun with --enable after the pilot'
fi
