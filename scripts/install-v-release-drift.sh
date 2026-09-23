#!/usr/bin/env bash
# Install the release drift check on V, beside the existing sentinel.
#
# Read-only in effect: the check hashes the running release and compares it to
# the manifest this repo publishes. It changes nothing about the Gateway, the
# release, or any service that serves traffic.
#
#   scripts/install-v-release-drift.sh v release/captured/v2026.9.1-db91.6/manifest.json
set -euo pipefail

host=${1:?usage: install-v-release-drift.sh <ssh-host> <manifest-path>}
manifest=${2:?usage: install-v-release-drift.sh <ssh-host> <manifest-path>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

[ -f "$manifest" ] || { echo "no such manifest: $manifest" >&2; exit 1; }

# The alert path is sentinel.py's, so it must already be there. Inventing a
# second Feishu sender would mean a second set of credentials to keep working.
ssh "$host" 'test -f /opt/v-sentinel/sentinel.py' \
  || { echo "v-sentinel is not installed on $host; install it first" >&2; exit 1; }

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT

scp -q "${repo_root}/scripts/v-release-drift.py" "$host:$stage/release-drift.py"
scp -q "$manifest" "$host:$stage/expected-release.json"
scp -q "${repo_root}/systemd/v-release-drift.service" \
       "${repo_root}/systemd/v-release-drift.timer" "$host:$stage/"

ssh "$host" "sudo install -m 0755 -o root -g root $stage/release-drift.py /opt/v-sentinel/release-drift.py
sudo install -m 0644 -o root -g root $stage/expected-release.json /opt/v-sentinel/expected-release.json
sudo install -m 0644 -o root -g root $stage/v-release-drift.service /etc/systemd/system/v-release-drift.service
sudo install -m 0644 -o root -g root $stage/v-release-drift.timer /etc/systemd/system/v-release-drift.timer
sudo systemctl daemon-reload
sudo systemctl enable --now v-release-drift.timer"

echo '--- first run (prints findings, sends nothing) ---'
ssh "$host" 'sudo /usr/bin/python3 /opt/v-sentinel/release-drift.py --check' || true
ssh "$host" 'systemctl list-timers v-release-drift.timer --no-pager'
