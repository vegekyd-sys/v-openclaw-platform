#!/usr/bin/env bash
# 9.5 (production worker 0.2.11 + 9.5 patch) under the production profile,
# measured exactly like the production 9.1 baseline.
set -uo pipefail
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway; C=/sys/fs/cgroup/system.slice/$UNIT.service
N=$R/runtime/node-v24.17.0-linux-x64/bin/node
MI=$R/capability-alignment-20260911/plugin-sources/home/openclaw/makaron-openclaw/.openclaw-local/workspace/plugins/makaron-image/index.js
log() { echo "$(date +%T) $*"; }
systemctl stop $UNIT; sleep 3
test -d $R/state.parked-95 && test ! -e $R/state.parked-91 || { log "unexpected state layout"; exit 1; }
mv $R/state $R/state.parked-91; mv $R/state.parked-95 $R/state
sed -i "s#$R/prod91/core/node_modules/openclaw/dist/plugin-sdk/#$R/runtime/openclaw95/node_modules/openclaw/dist/plugin-sdk/#" $MI
bash $R/scripts/start-gateway-prod.sh 95 | grep -o "ready version=95 startSeconds=[0-9]*"
start=$(date -d "$(systemctl show $UNIT -p ActiveEnterTimestamp --value)" +%s)
while [ $(( $(date +%s) - start )) -lt 1200 ]; do sleep 30; done
ok=0; prev=$(cat $C/memory.current)
while [ $ok -lt 3 ]; do
  sleep 60; cur=$(cat $C/memory.current); drift=$(( (cur>prev ? cur-prev : prev-cur) / 1048576 )); prev=$cur
  warn=$(journalctl -u $UNIT --no-pager --since "-60 s" | grep -c "liveness warning")
  if [ $drift -lt 200 ] && [ "$warn" = 0 ]; then ok=$((ok+1)); else ok=0; fi
done
log steady
cd $R/workspace
b() { VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/bench.mjs mirror $1 $2 $R/evidence/bench 2>&1 | tail -1 | grep -oE "\"(label|finals|errors|firstTextMs|totalMs|peakWorkers)\":(\{[^}]*\}|[^,]*)" | tr "\n" " "; echo; }
b 10 f95-warm1; sleep 30; b 10 f95-warm2; sleep 30
for i in 1 2 3; do b 1 f95-c1-$i; sleep 20; done
for i in 1 2 3; do b 5 f95-c5-$i; sleep 30; done
for i in 1 2; do b 15 f95-c15-$i; sleep 45; done
log done
