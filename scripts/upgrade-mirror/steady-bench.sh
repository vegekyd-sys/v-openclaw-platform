#!/usr/bin/env bash
# Run the bench ladder only once the mirror Gateway is in steady state:
# up >= 20 min, then 3 consecutive 60 s samples with RSS drift < 200 MB and no
# liveness warnings (the rule from load-test-after-warmup).
set -uo pipefail
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway
C=/sys/fs/cgroup/system.slice/$UNIT.service
prefix=${1:?}; NODE=${2:?}
log() { echo "$(date +%T) $*"; }
start=$(date -d "$(systemctl show $UNIT -p ActiveEnterTimestamp --value)" +%s)
while [ $(( $(date +%s) - start )) -lt 1200 ]; do sleep 30; done
log "uptime >= 20 min"
ok=0; prev=$(cat $C/memory.current)
while [ $ok -lt 3 ]; do
  sleep 60
  cur=$(cat $C/memory.current); drift=$(( (cur>prev ? cur-prev : prev-cur) / 1048576 )); prev=$cur
  warn=$(journalctl -u $UNIT --no-pager --since "-60 s" | grep -c "liveness warning")
  if [ $drift -lt 200 ] && [ "$warn" = 0 ]; then ok=$((ok+1)); else ok=0; fi
  log "sample drift=${drift}MB liveness=$warn streak=$ok"
done
log "steady; running ladder $prefix"
bash $R/scripts/mirror-bench.sh "$prefix" "$NODE"
