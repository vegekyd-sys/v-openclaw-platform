#!/usr/bin/env bash
# Planned restart of the shared VLab 9.6 Gateway after the first (migrating) start.
# Traffic stays as the drop-ins say (closed until open-traffic96-shared-vlab.sh).
#   planned-restart96-shared-vlab.sh <backup dir>
# Prints READY_EPOCH (feed to post-restart-check.mjs) and the downtime.
set -euo pipefail
# systemctl has no is-activating verb; a unit counts as gone only when failed, or
# inactive for more than 30 s (a restart passes through inactive briefly).
unit_gone() { local s; s=$(systemctl show -p ActiveState --value $1); if [ "$s" = failed ]; then return 0; fi
  if [ "$s" = inactive ]; then UNIT_INACTIVE_SINCE=${UNIT_INACTIVE_SINCE:-$(date +%s)}; [ $(( $(date +%s) - UNIT_INACTIVE_SINCE )) -gt 30 ]; return; fi
  UNIT_INACTIVE_SINCE=; return 1; }
test "$(id -u)" = 0
B=${1:?backup dir}
UNIT=openclaw-vlab-production-mirror-v8
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a $B/evidence/restart.log; }
t0=$(date +%s); log "planned restart: stop"
systemctl stop $UNIT; t1=$(date +%s); log "stopped in $((t1-t0))s"
systemctl reset-failed $UNIT 2>/dev/null || true
systemctl start --no-block $UNIT
for _ in $(seq 1 1800); do
  if journalctl -u $UNIT --since "@$t1" --no-pager -o cat 2>/dev/null | grep -c "\[gateway\] ready" >/dev/null; then
    t2=$(date +%s); echo $t2 > $B/planned-ready.epoch
    log "READY_EPOCH=$t2 start $((t2-t1))s downtime $((t2-t0))s"; exit 0
  fi
  if unit_gone $UNIT; then log "unit exited"; journalctl -u $UNIT -n 30 --no-pager -o cat | cut -c1-300; exit 2; fi
  sleep 2
done
log "NOT READY after $(( $(date +%s)-t1 ))s"; exit 3
