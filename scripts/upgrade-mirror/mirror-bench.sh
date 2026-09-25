#!/usr/bin/env bash
# Bench ladder against the mirror Gateway, recording cgroup CPU per tier.
set -uo pipefail
R=/srv/versa-mirror95; U=versa-rehearsal
prefix=${1:?}; NODE=${2:?}
C=/sys/fs/cgroup/system.slice/versa-mirror95-gateway.service
cpu() { awk '/usage_usec/{print $2}' $C/cpu.stat; }
thr() { awk '/throttled_usec/{print $2}' $C/cpu.stat; }
cd $R/workspace
for n in 1 5 15; do
  for attempt in 1 2 3; do
    c0=$(cpu); t0=$(thr)
    out=$(VERSA_UNIT=versa-mirror95-gateway.service runuser --preserve-environment -u $U -- $NODE $R/scripts/bench.mjs mirror $n $prefix-c$n $R/evidence/bench 2>&1 | tail -2)
    c1=$(cpu); t1=$(thr)
    if echo "$out" | grep -q '"output"'; then
      echo "$out" | grep -oE '"(label|completed|finals|errors|totalMs|firstTextMs|peakWorkers)":(\{[^}]*\}|[^,]*)' | tr '\n' ' '
      echo " cpuSec=$(( (c1-c0)/1000000 )) throttledSec=$(( (t1-t0)/1000000 ))"
      break
    fi
    echo "$prefix-c$n attempt $attempt failed: $(echo "$out" | tail -1 | cut -c1-160)"
    sleep 40
  done
  sleep 45
done
