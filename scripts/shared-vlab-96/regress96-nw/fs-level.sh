#!/usr/bin/env bash
# One Feishu load level against the shared VLab (runs on the Mac):
#   fs-level.sh <label> <N> [scenarios]
# Starts the server-side collector (first text per session) and loadmon (CPU, event-loop
# delay, journal counters), fires fs-load.mjs, then stops both and copies the receipts.
set -euo pipefail
L=${1:?label}; N=${2:?N}; SC=${3:-mix}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${FS_OUT:-$HERE/fs-results}; mkdir -p $OUT
R=/srv/vlab-upgrade96-backups/regress-nw; RO=$R/results/fs-$L
GROUPS_JSON=$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const m=[...s.matchAll(/"(oc_[0-9a-f]{32})"/g)].map(x=>x[1]);console.log(m.slice(0,Number(process.argv[2])).join(","))' $HERE/fs-load.mjs $N)
KEYS=$(echo $GROUPS_JSON | tr ',' '\n' | sed 's#^#agent:makaron:feishu:group:#' | paste -sd, -)
ssh vlab91 "sudo mkdir -p $RO && sudo rm -f $RO/stop-$L $RO/collector-$L.ready && \
  sudo systemd-run --unit=versa-fscol-$L --collect --working-directory=$R /opt/vlab/node-v24.17.0-linux-x64/bin/node $R/fs-collector.mjs $L 1000 $RO $KEYS >/dev/null && \
  sudo systemd-run --unit=versa-fsmon-$L --collect --working-directory=$R /opt/vlab/node-v24.17.0-linux-x64/bin/node $R/loadmon.mjs $L 1000 $RO >/dev/null && \
  for i in \$(seq 1 60); do sudo test -f $RO/collector-$L.ready && break; sleep 1; done; sudo test -f $RO/collector-$L.ready && echo collector-ready"
node $HERE/fs-load.mjs $L $N $OUT $SC | tee $OUT/fs-load-$L.summary.json
sleep 10
ssh vlab91 "sudo touch $RO/stop-$L; for i in \$(seq 1 120); do systemctl is-active --quiet versa-fscol-$L || systemctl is-active --quiet versa-fsmon-$L || break; sleep 2; done; sudo cat $RO/collector-$L.json" > $OUT/collector-$L.json
ssh vlab91 "sudo cat $RO/loadmon-$L.json" > $OUT/loadmon-$L.json
echo "level $L done: $OUT"
