#!/usr/bin/env bash
# Samples V every 10s during a load stage. Read-only: RPC status + /proc + a
# bounded journal window. One compact JSON object per line (the RPC output is
# pretty-printed, so it must be flattened or the line format breaks).
OUT=${1:?out file}; SECS=${2:-600}
B=/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/openclaw.mjs
N=/opt/node-v22.23.1/bin/node
end=$(( $(date +%s) + SECS ))
while [ "$(date +%s)" -lt "$end" ]; do
  ws=$(sudo -n -u openclaw -H env OPENCLAW_CONFIG_PATH=/home/openclaw/.openclaw/openclaw.json "$N" "$B" gateway call vlab.workers.status --json 2>/dev/null \
       | python3 -c 'import sys,json
try: print(json.dumps(json.load(sys.stdin),separators=(",",":")))
except Exception: print("null")')
  gwpid=$(systemctl show openclaw-gateway -p MainPID --value)
  gwrss=$(awk '/VmRSS/{print $2*1024}' /proc/"$gwpid"/status 2>/dev/null)
  live=$(journalctl -u openclaw-gateway --since "-12s" --no-pager -o cat 2>/dev/null | grep -c "liveness warning")
  stall=$(journalctl -u openclaw-gateway --since "-12s" --no-pager -o cat 2>/dev/null | grep -c "stalled session")
  elu=$(journalctl -u openclaw-gateway --since "-60s" --no-pager -o cat 2>/dev/null | grep -oE "eventLoopDelayP99Ms=[0-9.]+" | tail -1 | cut -d= -f2)
  mem=$(free -m | awk '/^Mem:/{print $7}')
  dsk=$(df -BM --output=avail / | tail -1 | tr -dc '0-9')
  printf '{"t":%s,"gw_rss":%s,"mem_avail_mb":%s,"disk_avail_mb":%s,"liveness_12s":%s,"stalled_12s":%s,"elu_p99":%s,"workers":%s}\n' \
    "$(date +%s)" "${gwrss:-0}" "${mem:-0}" "${dsk:-0}" "${live:-0}" "${stall:-0}" "${elu:-0}" "${ws:-null}" >> "$OUT"
  sleep 10
done
