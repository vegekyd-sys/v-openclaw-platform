#!/usr/bin/env bash
# No-worker rehearsal phase A: warm >= 20 min with stable RSS, then functional checks.
#   nw-phase-a.sh <readyEpoch> <outDir>
set -uo pipefail
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway; C=/sys/fs/cgroup/system.slice/$UNIT.service
N=$R/runtime/node-v24.17.0-linux-x64/bin/node; READY=${1:?}; OUT=${2:?}
log() { echo "$(date +%T) $*"; }
AS() { (cd /tmp && VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N "$@"); }
while [ $(( $(date +%s) - READY )) -lt 1200 ]; do sleep 20; done
log "20 min after ready"
ok=0; prev=$(cat $C/memory.current); tries=0
while [ $ok -lt 3 ] && [ $tries -lt 20 ]; do
  sleep 60; tries=$((tries+1))
  cur=$(cat $C/memory.current); drift=$(( (cur>prev ? cur-prev : prev-cur) / 1048576 )); prev=$cur
  warn=$(journalctl -u $UNIT --no-pager --since "-60 s" | grep -c "liveness")
  if [ $drift -lt 200 ] && [ "$warn" = 0 ]; then ok=$((ok+1)); else ok=0; fi
  log "sample mem=$((cur/1048576))MB drift=${drift}MB liveness=$warn streak=$ok load=$(cut -d" " -f1-3 /proc/loadavg)"
done
log "steady=$ok; functional start"
FSTART=$(date +%s)
for i in 1 2; do log "accept-$i load=$(cut -d" " -f1-3 /proc/loadavg)"; AS $R/scripts/accept.mjs nwf-accept-$i $OUT 2>&1; done
for i in 1 2 3; do log "stress-$i load=$(cut -d" " -f1-3 /proc/loadavg)"; AS $R/scripts/stress-tools96c.mjs nwf-tools-$i $OUT 2>&1; sleep 30; done
log "talk+compaction"; AS $R/scripts/talk-compact-check.mjs nwf-tc $OUT 2>&1
since=$(date -d @$FSTART "+%Y-%m-%d %H:%M:%S")
j=$(journalctl -u $UNIT --since "$since" --no-pager -o cat)
log "journal since functional start: modelRouteChanged=$(grep -c "Model route changed" <<<"$j") compactionProviderFailed=$(grep -c "Compaction provider" <<<"$j") fallingBack=$(grep -c "falling back" <<<"$j") unhandled=$(grep -c "Unhandled promise rejection" <<<"$j") liveness=$(grep -c liveness <<<"$j") slowDbOpen=$(grep -c "slow OpenClaw agent database open" <<<"$j")"
grep -E "Compaction provider|compaction|Compaction" <<<"$j" | cut -c1-240 | tail -20
log "phase A done"
