#!/usr/bin/env bash
# Roll the shared VLab instance back from 9.6 to the 9.1 it had before
# upgrade96-shared-vlab.sh or upgrade96-noworker-shared-vlab.sh:
#   rollback96-shared-vlab.sh <backup dir>
# Restores core, worker, both configs (the no-worker conversion is undone by
# restoring the pre-upgrade files) and the pre-upgrade state archive, removes the
# 9.6 drop-ins (incl. the traffic-closed one) and versa-runtime-providers, and
# starts 9.1. The companion is started again only if it was active before.
#
# Disk: the instance disk (/dev/vdb) cannot hold the 9.6 state next to the restored
# 9.1 state, and moving it to the root disk copies ~18 GB raw. The 9.6 state is
# therefore archived (zstd, verified) into the backup dir and then removed; nothing
# is lost. ROLLBACK_96_STATE=move keeps the old behaviour (raw move to the backup dir).
set -euo pipefail
test "$(id -u)" = 0
B=${1:?backup dir from upgrade96-*-shared-vlab.sh}
I=/srv/vlab-production-mirror/labs/instances/db91-parity; U=lab-db91-parity
UNIT=openclaw-vlab-production-mirror-v8; COMPANION=nightshift-vlab-production-mirror
DDIR=/etc/systemd/system/$UNIT.service.d
C=$I/state/shared-vlab-20260909-v3/openclaw.json; WC=$I/state/shared-vlab-20260909-v3/worker-openclaw.json
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a $B/evidence/rollback.log; }
for f in state.tar.zst openclaw.json worker-openclaw.json openclaw-9.1 production-worker; do test -e $B/$f || { echo "missing $B/$f"; exit 1; }; done
zstd -q -t $B/state.tar.zst || { echo "pre-upgrade state archive fails zstd -t"; exit 1; }
TS=$(date +%Y%m%dT%H%M%S); t0=$(date +%s)
log "stop"
systemctl stop $COMPANION 2>/dev/null || true; systemctl stop $UNIT
log "core, worker, drop-ins, versa-runtime-providers"
mv $I/runtime/openclaw $B/openclaw-9.6-rolledback-$TS
cp -a $B/openclaw-9.1 $I/runtime/openclaw
rsync -a --checksum --delete $B/production-worker/ $I/runtime/production-worker/
if [ -e $I/runtime/versa-runtime-providers ]; then mv $I/runtime/versa-runtime-providers $B/versa-runtime-providers-rolledback-$TS; fi
rm -f $DDIR/99z-versa-openclaw96.conf $DDIR/99zz-versa-traffic-closed.conf; systemctl daemon-reload
log "state and configs"
if [ "${ROLLBACK_96_STATE:-archive}" = move ]; then
  mv $I/state $B/state-9.6-rolledback-$TS
else
  a=$(date +%s)
  tar -C $I -cf - state | nice -n 10 zstd -q -T2 -o $B/state-9.6-rolledback-$TS.tar.zst
  zstd -q -t $B/state-9.6-rolledback-$TS.tar.zst
  log "   9.6 state archived to $B/state-9.6-rolledback-$TS.tar.zst ($(du -h $B/state-9.6-rolledback-$TS.tar.zst | cut -f1), $(( $(date +%s)-a ))s)"
  rm -rf $I/state
fi
zstd -q -dc $B/state.tar.zst | tar -C $I -xf -
cp -a $B/openclaw.json $C; cp -a $B/worker-openclaw.json $WC
if [ -f $B/configs-before.sha256 ]; then sha256sum -c --quiet $B/configs-before.sha256 && log "   configs byte-identical to pre-upgrade"; fi
chown -R $U: $I/state $I/runtime/openclaw $I/runtime/production-worker
log "start 9.1"
systemctl reset-failed $UNIT 2>/dev/null || true
start=$(date +%s); systemctl start --no-block $UNIT
ready=0
for _ in $(seq 1 1800); do
  if journalctl -u $UNIT --since "@$start" --no-pager -o cat 2>/dev/null | grep -c "\[gateway\] ready" >/dev/null; then ready=1; log "ready after $(( $(date +%s)-start ))s"; break; fi
  if ! systemctl is-active --quiet $UNIT && ! systemctl is-activating --quiet $UNIT; then log "unit exited"; exit 2; fi
  sleep 2
done
test $ready = 1 || { log "NOT READY after $(( $(date +%s)-start ))s"; exit 3; }
if [ "$(cat $B/companion.state 2>/dev/null)" = active ]; then systemctl start $COMPANION; log "companion started"; fi
log "rollback total $(( $(date +%s)-t0 ))s"
log "next: restore labs/shared-workflow/current.json from the pre-upgrade copy (see README), then vlab.mjs status: runtimeSha + configSha must match the pre-upgrade record"
