#!/usr/bin/env bash
# Install (not start) the real-time memory indexer on V.
#
#   scripts/install-v-memory-indexer.sh v
#
# Start it with `systemctl start v-memory-indexer` inside the maintenance window,
# after `memory index --force` and before the Gateway comes back
# (docs/memory-search-latency-quality-20261002.md): its startup holds the agent DB
# write lock for several seconds.
#
# Upgrading a running indexer: install, then `systemctl restart v-memory-indexer` off-peak
# (its startup integrity pass runs in its own process; the schema step can hold the
# write lock for seconds), then `python3 /opt/v-sentinel/v-cmdline-secret-scan.py`
# must report 0 processes leaking.
set -euo pipefail

host=${1:?usage: install-v-memory-indexer.sh <ssh-host>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "${repo_root}/scripts/v-memory-indexer.mjs" "${repo_root}/scripts/v-memory-indexer-run.py" "${repo_root}/scripts/v-cmdline-secret-scan.py" "${repo_root}/systemd/v-memory-indexer.service" "$host:$stage/"

# Keep the installed runner and indexer for rollback (restore, then restart the unit).
ssh "$host" 'stamp=$(date +%Y%m%d-%H%M%S); for f in v-memory-indexer-run.py v-memory-indexer.mjs; do
  [ -e /opt/v-sentinel/$f ] && sudo cp -p /opt/v-sentinel/$f /opt/v-sentinel/$f.bak-$stamp; done; true'
ssh "$host" "sudo install -d -m 0755 /opt/v-sentinel
sudo install -m 0644 -o root -g root $stage/v-memory-indexer.mjs /opt/v-sentinel/v-memory-indexer.mjs
sudo install -m 0755 -o root -g root $stage/v-memory-indexer-run.py /opt/v-sentinel/v-memory-indexer-run.py
sudo install -m 0755 -o root -g root $stage/v-cmdline-secret-scan.py /opt/v-sentinel/v-cmdline-secret-scan.py
sudo install -m 0644 -o root -g root $stage/v-memory-indexer.service /etc/systemd/system/v-memory-indexer.service
sudo systemctl daemon-reload
sudo systemctl enable v-memory-indexer.service"
ssh "$host" 'sudo DRY_RUN=1 python3 /opt/v-sentinel/v-memory-indexer-run.py makaron'
