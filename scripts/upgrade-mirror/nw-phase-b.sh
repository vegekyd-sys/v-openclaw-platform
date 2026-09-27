#!/usr/bin/env bash
# No-worker rehearsal phase B: ELD/CPU ladder (c5,c10,c15 x2), c15 x3 burst, then soak.
#   nw-phase-b.sh <outDir> [soakMinutes=65]
set -uo pipefail
R=/srv/versa-mirror95; N=$R/runtime/node-v24.17.0-linux-x64/bin/node; OUT=${1:?}; SOAK=${2:-65}
log() { echo "$(date +%T) $*"; }
bash $R/scripts/ladder.sh nwf $OUT
sleep 90
for i in 1 2 3; do log "burst-$i load=$(cut -d" " -f1-3 /proc/loadavg)"; $N $R/scripts/eldstep.mjs nwf-burst-$i 15 $OUT 2>&1 | tail -3; done
log "burst done; soak ${SOAK} min"
sleep 120
$N $R/scripts/soak.mjs nwf $SOAK $OUT 240 2>&1 | tail -3
log "phase B done"
