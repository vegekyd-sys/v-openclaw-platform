#!/usr/bin/env bash
# Install and start the memory_search vector pinner on V, replacing the timer-based warmer.
#
#   scripts/install-v-memory-vector-pin.sh v
#
# Safe at any time: it only maps the agent DB read-only and locks the vector tables'
# pages (~760 MB); it never calls or restarts the Gateway. It also stops the temporary
# transient unit of the same name (2026-10-20) and removes v-memory-vector-warm.
# Roll back with `systemctl disable --now v-memory-vector-pin` (releases the pages).
set -euo pipefail

host=${1:?usage: install-v-memory-vector-pin.sh <ssh-host>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "${repo_root}/scripts/v-memory-vector-pin.py" "${repo_root}/systemd/v-memory-vector-pin.service" "$host:$stage/"

ssh "$host" "set -e
sudo install -d -m 0755 /opt/v-sentinel
sudo install -m 0755 -o root -g root $stage/v-memory-vector-pin.py /opt/v-sentinel/v-memory-vector-pin.py
# The one-shot round both checks the install and leaves nothing locked behind.
sudo runuser -u openclaw -- python3 /opt/v-sentinel/v-memory-vector-pin.py --once makaron
sudo systemctl disable --now v-memory-vector-warm.timer 2>/dev/null || true
sudo rm -f /etc/systemd/system/v-memory-vector-warm.timer /etc/systemd/system/v-memory-vector-warm.service /opt/v-sentinel/v-memory-vector-warm.py
sudo rm -rf /var/lib/v-memory-vector-warm
# The transient stop-gap has the same unit name, so it has to stop (releasing its locks)
# before the installed unit can start; the pages stay cached and are re-locked within seconds.
sudo systemctl stop v-memory-vector-pin.service 2>/dev/null || true
sudo systemctl reset-failed v-memory-vector-pin.service 2>/dev/null || true
sudo install -m 0644 -o root -g root $stage/v-memory-vector-pin.service /etc/systemd/system/v-memory-vector-pin.service
sudo systemctl daemon-reload
# A leftover transient definition (/run/systemd/transient) would shadow the installed one.
fragment=\$(systemctl show v-memory-vector-pin.service -p FragmentPath --value)
[ \"\$fragment\" = /etc/systemd/system/v-memory-vector-pin.service ] || { echo \"unit still resolves to \$fragment\" >&2; exit 1; }
sudo systemctl enable --now v-memory-vector-pin.service
sleep 60
sudo journalctl -u v-memory-vector-pin.service -n 3 --no-pager -o cat
grep -E 'Mlocked|MemAvailable' /proc/meminfo"
