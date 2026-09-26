#!/usr/bin/env bash
# Install the release drift check on V, beside the existing sentinel.
#
# Read-only in effect: the check hashes the running release and compares it to
# the manifest this repo publishes. It changes nothing about the Gateway, the
# release, or any service that serves traffic.
#
#   scripts/install-v-release-drift.sh v release/captured/<rel>/manifest.json \
#     release/captured/<rel>.worker/manifest.json release/captured/<rel>.feishu/manifest.json
#
# The first manifest is core dist (checked together with ExecStart and the
# running process). Any further ones are whole-directory components; they
# replace everything in /opt/v-sentinel/expected-release.d/.
set -euo pipefail

usage='usage: install-v-release-drift.sh <ssh-host> <core-manifest> [component-manifest...]'
host=${1:?$usage}
manifest=${2:?$usage}
shift 2
components=("$@")
for c in ${components[@]+"${components[@]}"}; do [ -f "$c" ] || { echo "no such manifest: $c" >&2; exit 1; }; done
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
ssh "$host" "mkdir $stage/components $stage/base"
# A capture against a published package (--base npm:...) needs that package's
# inventory on the host, or undeclared files cannot be checked against it.
base_dir=$(jq -r '.capturedFrom.baseDir' "$manifest")
if [[ "$base_dir" == npm:* ]]; then
  inv_name=$(printf '%s' "${base_dir#npm:}" | sed -e 's/^@//' -e 's#[/:]#__#g')
  inventory="${repo_root}/release/captured/base/${inv_name}.json"
  [ -f "$inventory" ] || { echo "missing base inventory $inventory" >&2; exit 1; }
  scp -q "$inventory" "$host:$stage/base/"
fi
for c in ${components[@]+"${components[@]}"}; do
  # <rel>.worker/manifest.json -> worker.json
  name=$(basename "$(dirname "$c")"); name=${name##*.}
  scp -q "$c" "$host:$stage/components/$name.json"
done
scp -q "${repo_root}/systemd/v-release-drift.service" \
       "${repo_root}/systemd/v-release-drift.timer" "$host:$stage/"

ssh "$host" "sudo install -m 0755 -o root -g root $stage/release-drift.py /opt/v-sentinel/release-drift.py
sudo install -m 0644 -o root -g root $stage/expected-release.json /opt/v-sentinel/expected-release.json
sudo rm -rf /opt/v-sentinel/base && sudo install -d -m 0755 -o root -g root /opt/v-sentinel/base
for f in $stage/base/*.json; do [ -e \"\$f\" ] && sudo install -m 0644 -o root -g root \"\$f\" /opt/v-sentinel/base/; done
sudo rm -rf /opt/v-sentinel/expected-release.d && sudo install -d -m 0755 -o root -g root /opt/v-sentinel/expected-release.d
for f in $stage/components/*.json; do [ -e \"\$f\" ] && sudo install -m 0644 -o root -g root \"\$f\" /opt/v-sentinel/expected-release.d/; done
sudo install -m 0644 -o root -g root $stage/v-release-drift.service /etc/systemd/system/v-release-drift.service
sudo install -m 0644 -o root -g root $stage/v-release-drift.timer /etc/systemd/system/v-release-drift.timer
sudo systemctl daemon-reload
sudo systemctl enable --now v-release-drift.timer"

echo '--- first run (prints findings, sends nothing) ---'
ssh "$host" 'sudo /usr/bin/python3 /opt/v-sentinel/release-drift.py --check' || true
ssh "$host" 'systemctl list-timers v-release-drift.timer --no-pager'
