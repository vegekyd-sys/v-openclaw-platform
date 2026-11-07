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
set -euo pipefail

host=${1:?usage: install-v-storage-governance.sh <ssh-host> [--apply]}
apply=${2:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
src="$repo_root/ops/v-storage-governance"
lib=/usr/local/lib/v-storage-governance
unit=/etc/systemd/system/v-storage-governance.service

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "$src"/core.mjs "$src"/maintain.mjs "$src"/package-cache.mjs "$src"/policy.json "$src"/systemd/v-storage-governance.service "$host:$stage/"

ssh "$host" "set -e
for f in core.mjs maintain.mjs package-cache.mjs policy.json; do sudo diff -u $lib/\$f $stage/\$f || true; done
sudo diff -u $unit $stage/v-storage-governance.service || true"

if [ "$apply" = "--apply" ]; then
  ssh "$host" "set -e
ts=\$(date +%Y%m%dT%H%M%S)
prev=/var/lib/v-storage-governance/previous-\$ts
sudo install -d -m 0700 \$prev/lib
sudo cp -a $lib/. \$prev/lib/
sudo cp -a $unit \$prev/
for f in core.mjs maintain.mjs package-cache.mjs policy.json; do sudo install -m 0644 -o root -g root $stage/\$f $lib/\$f; done
sudo install -m 0644 -o root -g root $stage/v-storage-governance.service $unit
sudo systemctl daemon-reload
echo installed, previous copy in \$prev"
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
