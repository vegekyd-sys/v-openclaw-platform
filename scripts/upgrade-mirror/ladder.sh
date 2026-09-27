#!/usr/bin/env bash
# Measured ladder: ladder.sh <mode> <outDir>   (c5,c10,c15 x2, 90 s cool-down)
set -uo pipefail
R=/srv/versa-mirror95; N=$R/runtime/node-v24.17.0-linux-x64/bin/node; MODE=${1:?}; OUT=${2:?}
mkdir -p $OUT
echo "$(date +%T) idle $MODE"; $N $R/scripts/eldstep.mjs $MODE-idle 0 $OUT 2>&1 | tail -3; sleep 10
for rep in 1 2; do for c in 5 10 15; do
  echo "$(date +%T) start $MODE-c$c-r$rep load=$(cut -d' ' -f1-3 /proc/loadavg) rss=$(( $(cat /sys/fs/cgroup/system.slice/versa-mirror95-gateway.service/memory.current) / 1048576 ))MB"
  $N $R/scripts/eldstep.mjs $MODE-c$c-r$rep $c $OUT 2>&1 | tail -3
  sleep 90
done; done
echo "$(date +%T) ladder done"
