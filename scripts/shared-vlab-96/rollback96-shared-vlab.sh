#!/usr/bin/env bash
# Roll the shared VLab instance back from 9.6 to the 9.1 it had before
# upgrade96-shared-vlab.sh:   rollback96-shared-vlab.sh <backup dir>
# Restores core, worker, configs and the pre-upgrade state archive, removes the
# 9.6 drop-in, and starts 9.1.
set -euo pipefail
test "$(id -u)" = 0
B=${1:?backup dir from upgrade96-shared-vlab.sh}
I=/srv/vlab-production-mirror/labs/instances/db91-parity; U=lab-db91-parity
UNIT=openclaw-vlab-production-mirror-v8; COMPANION=nightshift-vlab-production-mirror
DROPIN=/etc/systemd/system/$UNIT.service.d/99z-versa-openclaw96.conf
C=$I/state/shared-vlab-20260909-v3/openclaw.json; WC=$I/state/shared-vlab-20260909-v3/worker-openclaw.json
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a $B/evidence/rollback.log; }
for f in state.tar.zst openclaw.json worker-openclaw.json openclaw-9.1 production-worker; do test -e $B/$f || { echo "missing $B/$f"; exit 1; }; done
TS=$(date +%Y%m%dT%H%M%S); t0=$(date +%s)
log "stop"
systemctl stop $UNIT; systemctl stop $COMPANION 2>/dev/null || true
log "core, worker, drop-in"
mv $I/runtime/openclaw $B/openclaw-9.6-rolledback-$TS
cp -a $B/openclaw-9.1 $I/runtime/openclaw
rsync -a --checksum --delete $B/production-worker/ $I/runtime/production-worker/
rm -f $DROPIN; systemctl daemon-reload
log "state and configs"
mv $I/state $B/state-9.6-rolledback-$TS
zstd -q -dc $B/state.tar.zst | tar -C $I -xf -
cp -a $B/openclaw.json $C; cp -a $B/worker-openclaw.json $WC
chown -R $U: $I/state $I/runtime/openclaw $I/runtime/production-worker
log "start 9.1"
systemctl reset-failed $UNIT 2>/dev/null || true
start=$(date +%s); systemctl start --no-block $UNIT
for _ in $(seq 1 1800); do
  if journalctl -u $UNIT --since "@$start" --no-pager -o cat 2>/dev/null | grep -q "\[gateway\] ready"; then log "ready after $(( $(date +%s)-start ))s"; break; fi
  if ! systemctl is-active --quiet $UNIT && ! systemctl is-activating --quiet $UNIT; then log "unit exited"; exit 2; fi
  sleep 2
done
if [ "$(cat $B/companion.state 2>/dev/null)" = active ]; then systemctl start $COMPANION; fi
log "rollback total $(( $(date +%s)-t0 ))s"
