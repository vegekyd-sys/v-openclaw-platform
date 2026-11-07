#!/usr/bin/env bash
# Install ops/v-storage-governance on V (the daily 04:00 snapshot and package-cache retention).
#
#   scripts/install-v-storage-governance.sh v            # plan: show the diff against V, run --audit
#   scripts/install-v-storage-governance.sh v --apply    # install, keep the old copy, run --audit
#
# --apply copies the old files to /var/lib/v-storage-governance/previous-<ts>/ first, so
#   sudo cp -a /var/lib/v-storage-governance/previous-<ts>/lib/. /usr/local/lib/v-storage-governance/
# puts them back. It never deletes anything itself and never starts the service:
# the next 04:00 timer run is the first one that applies. --audit is read-only.
#
# It also installs /etc/tmpfiles.d/v-workspace-tmp.conf (14-day cleanup of the agent
# workspace tmp/, run by the stock systemd-tmpfiles-clean.timer at 22:52) and prints
# what that rule would remove today. Remove the file to turn the rule off.
set -euo pipefail

host=${1:?usage: install-v-storage-governance.sh <ssh-host> [--apply]}
apply=${2:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
src="$repo_root/ops/v-storage-governance"
lib=/usr/local/lib/v-storage-governance
unit=/etc/systemd/system/v-storage-governance.service
tmpfiles=/etc/tmpfiles.d/v-workspace-tmp.conf
wstmp=/home/openclaw/makaron-openclaw/.openclaw-local/workspace/tmp

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "$src"/core.mjs "$src"/maintain.mjs "$src"/package-cache.mjs "$src"/policy.json \
  "$src"/systemd/v-storage-governance.service "$src"/tmpfiles/v-workspace-tmp.conf "$host:$stage/"

ssh "$host" bash -s -- "$stage" "$lib" "$unit" "$tmpfiles" "$wstmp" <<'REMOTE'
stage=$1 lib=$2 unit=$3 tmpfiles=$4 wstmp=$5
for f in core.mjs maintain.mjs package-cache.mjs policy.json; do sudo diff -u "$lib/$f" "$stage/$f" || true; done
sudo diff -u "$unit" "$stage/v-storage-governance.service" || true
if [ -e "$tmpfiles" ]; then sudo diff -u "$tmpfiles" "$stage/v-workspace-tmp.conf" || true; else echo "(new) $tmpfiles"; fi
# What the tmpfiles rule would remove today: files whose mtime and ctime are both 14+ days old.
sudo ionice -c3 nice -n19 find "$wstmp" -xdev -type f -mtime +14 -ctime +14 -printf '%s\n' |
  awk '{s+=$1;n++} END{printf "tmpfiles rule would remove %d files, %.2f GB today\n",n,s/1e9}'
REMOTE

if [ "$apply" = "--apply" ]; then
  ssh "$host" bash -s -- "$stage" "$lib" "$unit" "$tmpfiles" "$wstmp" <<'REMOTE'
set -euo pipefail
stage=$1 lib=$2 unit=$3 tmpfiles=$4 wstmp=$5
prev=/var/lib/v-storage-governance/previous-$(date +%Y%m%dT%H%M%S)
sudo install -d -m 0700 "$prev/lib"
sudo cp -a "$lib/." "$prev/lib/"
sudo cp -a "$unit" "$prev/"
if [ -e "$tmpfiles" ]; then sudo cp -a "$tmpfiles" "$prev/"; fi
for f in core.mjs maintain.mjs package-cache.mjs policy.json; do sudo install -m 0644 -o root -g root "$stage/$f" "$lib/$f"; done
sudo install -m 0644 -o root -g root "$stage/v-storage-governance.service" "$unit"
sudo install -m 0644 -o root -g root "$stage/v-workspace-tmp.conf" "$tmpfiles"
sudo systemctl daemon-reload
# The rule must be the one systemd-tmpfiles actually resolves for that path.
sudo systemd-tmpfiles --cat-config | grep -F -- "$wstmp" | grep -q 'cmBM:14d'
echo "installed, previous copy in $prev"
REMOTE
  run=$lib/maintain.mjs
else
  # Plan mode: audit the staged copy, not the installed one.
  run=$stage/maintain.mjs
fi

# Read-only: lists what the next run would remove; deletes nothing.
ssh "$host" "sudo ionice -c3 nice -n19 /opt/node-v22.23.1/bin/node $run --audit" | /usr/bin/env node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);
const sum=r.actions.reduce((n,a)=>n+a.bytes,0);
console.log(JSON.stringify({level:r.level,error:r.error,wouldRemove:r.actions.length,wouldRemoveGB:+(sum/1e9).toFixed(2),
skipped:r.skipped.reduce((m,x)=>(m[x.reason]=(m[x.reason]||0)+1,m),{})},null,1));});'
