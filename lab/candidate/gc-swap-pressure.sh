#!/usr/bin/env bash
# Usage (root, lab host): [SWAPMAX=0] gc-swap-pressure.sh SWAPPINESS
# One scope with MemoryHigh=$HIGH holds a Node heap (gc-swap-pressure.mjs) and a reader that
# streams $FILE through the page cache, so reclaim inside the scope must choose between the
# heap's anonymous pages (swap) and file pages. vm.swappiness is restored afterwards.
set -euo pipefail
SW=$1
NODE=${NODE:-/opt/vlab/node-v22.23.1-linux-x64/bin/node}
FILE=${FILE:-/var/tmp/cc-gcswap-cache.bin}
HIGH=${HIGH:-3G}
ORIG=$(cat /proc/sys/vm/swappiness)
trap 'sysctl -q -w vm.swappiness=$ORIG' EXIT
[ -s "$FILE" ] || dd if=/dev/urandom of="$FILE" bs=1M count=${FILE_MB:-6000} status=none
sysctl -q -w vm.swappiness="$SW"
D=$(mktemp -d); UNIT=cc-gcpress-$$
systemd-run --quiet --scope --unit "$UNIT" -p MemoryAccounting=yes -p MemoryHigh="$HIGH" ${SWAPMAX:+-p MemorySwapMax="$SWAPMAX"} -- bash -c "
  env READY_FILE=$D/ready HEAP_MB=${HEAP_MB:-2000} DURATION_S=${DURATION_S:-180} GC_EVERY_S=${GC_EVERY_S:-15} \"$NODE\" --expose-gc --max-old-space-size=12288 $(dirname "$0")/gc-swap-pressure.mjs > $D/node.jsonl 2>&1 &
  NP=\$!
  until [ -e $D/ready ]; do sleep 1; done
  ( while kill -0 \$NP 2>/dev/null; do cat $FILE > /dev/null; done ) &
  wait \$NP" 
echo "{\"swappiness\":$SW,\"swapMax\":\"${SWAPMAX:-unset}\"}"; grep -h summary "$D/node.jsonl"; grep -v summary "$D/node.jsonl" | tail -4
rm -rf "$D"
