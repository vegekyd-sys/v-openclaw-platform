#!/usr/bin/env bash
# Install and start the memory_search vector warmer on V.
#
#   scripts/install-v-memory-vector-warm.sh v
#
# Safe at any time: it only reads the agent DB (read-only connection, short
# batches), never calls or restarts the Gateway, and takes effect for the next
# memory_search. Roll back with `systemctl disable --now v-memory-vector-warm.timer`.
set -euo pipefail

host=${1:?usage: install-v-memory-vector-warm.sh <ssh-host>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "${repo_root}/scripts/v-memory-vector-warm.py" "${repo_root}/systemd/v-memory-vector-warm.service" "${repo_root}/systemd/v-memory-vector-warm.timer" "$host:$stage/"

ssh "$host" "sudo install -d -m 0755 /opt/v-sentinel
sudo install -m 0755 -o root -g root $stage/v-memory-vector-warm.py /opt/v-sentinel/v-memory-vector-warm.py
sudo install -m 0644 -o root -g root $stage/v-memory-vector-warm.service /etc/systemd/system/v-memory-vector-warm.service
sudo install -m 0644 -o root -g root $stage/v-memory-vector-warm.timer /etc/systemd/system/v-memory-vector-warm.timer
sudo systemctl daemon-reload
sudo systemctl start v-memory-vector-warm.service
sudo systemctl enable --now v-memory-vector-warm.timer
sudo journalctl -u v-memory-vector-warm.service -n 1 --no-pager -o cat"
