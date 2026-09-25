#!/usr/bin/env bash
# CPU seconds per process class during c15 runs on the Gateway that is already
# running (any version):  cpu-running.sh <label> [bench-node]
set -uo pipefail
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway
LABEL=${1:?label}; N=${2:-/opt/vlab/node-v22.23.1-linux-x64/bin/node}
P=$(systemctl show -p MainPID --value $UNIT); test "$P" != 0 || { echo "not running"; exit 1; }
while [ $(ps -o etimes= -p $P | tr -d " ") -lt 300 ]; do sleep 10; done
cd $R/workspace
b() { VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/bench.mjs mirror $1 $2 $R/evidence/bench 2>&1 | tee $R/evidence/raw-$2.log | tail -1 | grep -oE "\"(label|totalMs|firstTextMs)\":(\{[^}]*\}|[^,]*)" | tr "\n" " "; echo; }
snap() {
  for p in $(cat /sys/fs/cgroup/system.slice/$UNIT.service/cgroup.procs); do
    [ -r /proc/$p/stat ] || continue
    t=$(awk '{print $14+$15}' /proc/$p/stat 2>/dev/null) || continue
    if [ "$p" = "$P" ]; then c=gateway; elif tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | grep -q "worker"; then c=worker; else c=other; fi
    echo "$p $c $t $(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-80 | tr ' ' '_')"
  done
}
b 10 $LABEL-warm; sleep 30
for i in 1 2 3; do
  snap > /tmp/cpu-a; b 15 $LABEL-c15-$i; snap > /tmp/cpu-b
  awk -v hz=$(getconf CLK_TCK) 'NR==FNR{a[$1]=$3;next}{d=$3-($1 in a?a[$1]:0); s[$2]+=d; if($2=="other"){o[$4]+=d}} END{for(k in s) printf "  cpu %s %.1fs\n", k, s[k]/hz; for(k in o) if(o[k]/hz>0.3) printf "    other %.1fs %s\n", o[k]/hz, k}' /tmp/cpu-a /tmp/cpu-b
  sleep 45
done
echo "$(date +%T) done"
