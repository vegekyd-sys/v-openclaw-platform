#!/usr/bin/env bash
# Driver for gc-swapped-heap.mjs on a lab host (root, cgroup v2): run the heap in its own scope,
# then push RECLAIM of that scope's memory to swap with memory.reclaim before the second GC.
# SWAPMAX=0 runs the same scope with MemorySwapMax=0, the Gateway unit setting this fix adds.
set -euo pipefail
NODE=${NODE:-/opt/vlab/node-v22.23.1-linux-x64/bin/node}
RECLAIM=${RECLAIM:-1500M}
DIR=/tmp/cc-gcswap; rm -rf "$DIR"; mkdir -p "$DIR"
UNIT=cc-gcswap-$$
systemd-run --quiet --scope --unit "$UNIT" -p MemoryAccounting=yes ${SWAPMAX:+-p MemorySwapMax="$SWAPMAX"} -- env GC_DIR="$DIR" HEAP_MB="${HEAP_MB:-2500}" \
  "$NODE" --expose-gc --max-old-space-size=12288 "$(dirname "$0")/gc-swapped-heap.mjs" > "$DIR/out.jsonl" 2>&1 &
until [ -e "$DIR/READY" ]; do sleep 1; done
CG=/sys/fs/cgroup$(systemctl show -p ControlGroup --value "$UNIT.scope")
echo "{\"swapMax\":\"${SWAPMAX:-unset}\",\"reclaim\":\"$RECLAIM\",\"cgroupBeforeMb\":$(( $(cat "$CG/memory.current") / 1048576 ))}"
echo "$RECLAIM" > "$CG/memory.reclaim" || true
echo "{\"cgroupAfterMb\":$(( $(cat "$CG/memory.current") / 1048576 )),\"cgroupSwapMb\":$(( $(cat "$CG/memory.swap.current") / 1048576 ))}"
touch "$DIR/GO"
wait
cat "$DIR/out.jsonl"
rm -rf "$DIR"
