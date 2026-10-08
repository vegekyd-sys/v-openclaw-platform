#!/usr/bin/env bash
# Install the pre-start Codex registration cleanup on V's Gateway unit.
#
#   scripts/install-v-codex-orphan-cleanup.sh v
#
# Installs /opt/v-ops/codex-orphan-cleanup.py and the drop-in, runs the script once
# in --dry-run as the service user to show what it would remove now, and reloads
# systemd. It does not restart the Gateway: the cleanup takes effect at the next
# start, whoever restarts it.
set -euo pipefail

host=${1:?usage: install-v-codex-orphan-cleanup.sh <ssh-host>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# The db91 release drop-ins (zz-db91-c5 ... zzzzzzzz-db91-state-db-fastpath-v6)
# each start with an empty ExecStartPre=, which clears every ExecStartPre set
# by a drop-in that sorts before them. This one must sort after all of them,
# like zzzzzzzzz-node-async-context-frame.conf (#266). The check at the end
# fails the install if a later reset ever clears it again.
dropin=/etc/systemd/system/openclaw-gateway.service.d/zzzzzzzzz-codex-orphan-cleanup.conf

ssh "$host" 'test -x /usr/bin/python3' || { echo "/usr/bin/python3 missing on $host" >&2; exit 1; }

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "${repo_root}/scripts/v-codex-orphan-cleanup.py" "$host:$stage/codex-orphan-cleanup.py"
scp -q "${repo_root}/systemd/openclaw-gateway.service.d/codex-orphan-cleanup.conf" "$host:$stage/codex-orphan-cleanup.conf"

ssh "$host" "sudo install -d -m 0755 -o root -g root /opt/v-ops
sudo install -m 0755 -o root -g root $stage/codex-orphan-cleanup.py /opt/v-ops/codex-orphan-cleanup.py
sudo -u openclaw /usr/bin/python3 /opt/v-ops/codex-orphan-cleanup.py --dry-run
sudo install -m 0644 -o root -g root $stage/codex-orphan-cleanup.conf $dropin
sudo systemctl daemon-reload
systemctl show openclaw-gateway -p ExecStartPre --value | grep -c codex-orphan-cleanup.py"
