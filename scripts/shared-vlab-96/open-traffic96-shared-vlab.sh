#!/usr/bin/env bash
# Open traffic on the shared VLab 9.6 Gateway once post-restart-check.mjs passed:
# remove the traffic-closed drop-in (channels + cron), restart, wait for ready.
#   open-traffic96-shared-vlab.sh <backup dir> [--start-companion]
# The companion (nightshift-vlab-production-mirror) is started only if it was
# active before the upgrade or --start-companion is given.
set -euo pipefail
test "$(id -u)" = 0
B=${1:?backup dir}; START_COMPANION=${2:-}
UNIT=openclaw-vlab-production-mirror-v8; COMPANION=nightshift-vlab-production-mirror
CLOSED=/etc/systemd/system/$UNIT.service.d/99zz-versa-traffic-closed.conf
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a $B/evidence/restart.log; }
test -e $CLOSED || { log "$CLOSED is already gone; nothing to open"; exit 1; }
rm -f $CLOSED; systemctl daemon-reload
if systemctl show -p Environment $UNIT | tr ' ' '\n' | grep -c '^OPENCLAW_SKIP_\(CHANNELS\|CRON\)=' >/dev/null; then log "skip env still present"; exit 1; fi
t0=$(date +%s); log "open traffic: restart"
systemctl restart --no-block $UNIT; t1=$(date +%s)
for _ in $(seq 1 1800); do
  if journalctl -u $UNIT --since "@$t1" --no-pager -o cat 2>/dev/null | grep -c "\[gateway\] ready" >/dev/null; then
    t2=$(date +%s); echo $t2 > $B/open-ready.epoch; log "READY_EPOCH=$t2 downtime $((t2-t0))s (traffic open)"; break
  fi
  if ! systemctl is-active --quiet $UNIT && ! systemctl is-activating --quiet $UNIT; then log "unit exited"; exit 2; fi
  sleep 2
done
test -f $B/open-ready.epoch || { log "NOT READY"; exit 3; }
if [ "$(cat $B/companion.state)" = active ] || [ "$START_COMPANION" = --start-companion ]; then
  systemctl start $COMPANION && log "$COMPANION started ($(systemctl is-active $COMPANION))"
fi
