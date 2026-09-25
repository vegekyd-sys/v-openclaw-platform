#!/usr/bin/env bash
# Install the Night Shift check on V, beside the existing sentinel.
#
# Read-only in effect: it reads the Night Shift and Workboard SQLite files, the
# Night Shift health endpoint and systemd state. It changes nothing about the
# Gateway, Night Shift, or any service that serves traffic.
#
#   scripts/install-v-nightshift-check.sh v
set -euo pipefail

host=${1:?usage: install-v-nightshift-check.sh <ssh-host>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# The alert path is sentinel.py's, so it must already be there.
ssh "$host" 'test -f /opt/v-sentinel/sentinel.py' \
  || { echo "v-sentinel is not installed on $host; install it first" >&2; exit 1; }

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "${repo_root}/scripts/v-nightshift-check.py" "$host:$stage/nightshift-check.py"
scp -q "${repo_root}/systemd/v-nightshift-check.service" "${repo_root}/systemd/v-nightshift-check.timer" "$host:$stage/"

ssh "$host" "sudo -n bash -s" <<REMOTE
set -euo pipefail
install -o root -g root -m 755 $stage/nightshift-check.py /opt/v-sentinel/nightshift-check.py
install -o root -g root -m 644 $stage/v-nightshift-check.service /etc/systemd/system/v-nightshift-check.service
install -o root -g root -m 644 $stage/v-nightshift-check.timer /etc/systemd/system/v-nightshift-check.timer
systemctl daemon-reload
# The first run records the card-level baseline and sends nothing for it; only
# a service that is actually down at install time alerts.
systemctl start v-nightshift-check.service
systemctl enable --now v-nightshift-check.timer
systemctl list-timers v-nightshift-check.timer --no-pager | head -2
REMOTE
