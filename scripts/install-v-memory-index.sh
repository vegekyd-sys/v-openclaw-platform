#!/usr/bin/env bash
# Install the memory_search index sync timer on V.
#
#   scripts/install-v-memory-index.sh v
#
# It does not run an index itself: the first catch-up after 2026-09-28 should be a
# `memory index --force` in a Gateway maintenance window
# (docs/memory-search-latency-quality-20261002.md). The timer then keeps it current.
set -euo pipefail

host=${1:?usage: install-v-memory-index.sh <ssh-host>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "${repo_root}/scripts/v-memory-index.sh" "$host:$stage/v-memory-index.sh"
scp -q "${repo_root}/systemd/v-memory-index.service" "${repo_root}/systemd/v-memory-index.timer" "$host:$stage/"

ssh "$host" "sudo install -d -m 0755 /opt/v-sentinel
sudo install -m 0755 -o root -g root $stage/v-memory-index.sh /opt/v-sentinel/v-memory-index.sh
sudo install -m 0644 -o root -g root $stage/v-memory-index.service /etc/systemd/system/v-memory-index.service
sudo install -m 0644 -o root -g root $stage/v-memory-index.timer /etc/systemd/system/v-memory-index.timer
sudo systemctl daemon-reload
sudo systemctl enable --now v-memory-index.timer"
ssh "$host" 'systemctl list-timers v-memory-index.timer --no-pager'
