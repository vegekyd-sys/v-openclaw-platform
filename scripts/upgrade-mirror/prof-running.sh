#!/usr/bin/env bash
# Profile Gateway + workers during one c15 run of the running Gateway (started
# with VERSA_NODE_FLAGS=--inspect=127.0.0.1:0):  prof-running.sh <label> <node>
set -uo pipefail
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway; LABEL=${1:?label}; N=${2:?node}
P=$(systemctl show -p MainPID --value $UNIT)
while [ $(ps -o etimes= -p $P | tr -d " ") -lt 300 ]; do sleep 10; done
cd $R/workspace; OUT=$R/evidence/prof-$LABEL; mkdir -p $OUT
b() { VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/bench.mjs mirror $1 $2 $R/evidence/bench 2>&1 | tail -1 | grep -oE "\"(label|totalMs|firstTextMs)\":(\{[^}]*\}|[^,]*)" | tr "\n" " "; echo; }
b 10 $LABEL-warm; sleep 30; b 15 $LABEL-pre; sleep 45
PIDS=$(cat /sys/fs/cgroup/system.slice/$UNIT.service/cgroup.procs | while read p; do tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | grep -qE "dist/index.js gateway|worker" && echo $p; done | tr '\n' ' ')
echo "profiling: $PIDS"
$N $R/scripts/cdp-multi.mjs 22 $OUT $PIDS > $OUT/profiles.json 2>&1 &
sleep 2; b 15 $LABEL-c15; wait
cat $OUT/profiles.json | head -c 2000; echo
