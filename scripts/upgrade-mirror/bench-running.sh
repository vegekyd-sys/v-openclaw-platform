#!/usr/bin/env bash
# Accept + measure the Gateway that is already running on the mirror, the same
# way candidate91-run.sh measures a fresh 9.1:  bench-running.sh <label> <node>
set -uo pipefail
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway
LABEL=${1:?label}; N=${2:-/opt/vlab/node-v22.23.1-linux-x64/bin/node}
log() { echo "$(date +%T) $*"; }
P=$(systemctl show -p MainPID --value $UNIT); test "$P" != 0 || { log "not running"; exit 1; }
while [ $(ps -o etimes= -p $P | tr -d " ") -lt 300 ]; do sleep 10; done
cd $R/workspace
b() { VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/bench.mjs mirror $1 $2 $R/evidence/bench 2>&1 | tee $R/evidence/raw-$2.log | tail -1 | grep -oE "\"(label|finals|errors|firstTextMs|totalMs|peakWorkers)\":(\{[^}]*\}|[^,]*)" | tr "\n" " "; echo; }
b 10 $LABEL-warm1; sleep 30; b 10 $LABEL-warm2; sleep 30
VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/accept.mjs $LABEL $R/evidence/accept 2>&1 | tail -13
for i in 1 2 3; do b 1 $LABEL-c1-$i; sleep 20; done
for i in 1 2 3; do b 5 $LABEL-c5-$i; sleep 30; done
for i in 1 2 3 4; do b 15 $LABEL-c15-$i; sleep 45; done
log done
