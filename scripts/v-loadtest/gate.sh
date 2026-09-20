#!/usr/bin/env bash
# Abort gate between stages. Thresholds come from the measured pre-test
# baseline, not from thin air: gateway 1.75G idle (heap cap 12G), event-loop
# P99 21-29ms idle, 0 stalls/hour, 73G disk free, 23.7G host memory free.
gwpid=$(systemctl show openclaw-gateway -p MainPID --value)
gwrss=$(awk '/VmRSS/{printf "%.2f", $2/1048576}' /proc/"$gwpid"/status 2>/dev/null)
restarts=$(systemctl show openclaw-gateway -p NRestarts --value)
nsr=$(systemctl show nightshift-workboard -p NRestarts --value)
stalled=$(journalctl -u openclaw-gateway --since "-5min" --no-pager -o cat 2>/dev/null | grep -c "stalled session")
elu=$(journalctl -u openclaw-gateway --since "-5min" --no-pager -o cat 2>/dev/null | grep -oE "eventLoopDelayP99Ms=[0-9.]+" | cut -d= -f2 | sort -rn | head -1)
disk=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
memfree=$(free -m | sed -n 's/^Mem: *[0-9]* *[0-9]* *[0-9]* *[0-9]* *[0-9]* *\([0-9]*\).*/\1/p')
oom=$(journalctl -k --since "-5min" --no-pager -o cat 2>/dev/null | grep -ciE "out of memory|oom-kill")
printf 'gw_rss=%sG restarts=%s/%s stalled_5m=%s elu_p99_5m=%s disk=%sG mem_avail=%sM oom=%s\n' \
  "${gwrss:-?}" "$restarts" "$nsr" "$stalled" "${elu:-0}" "$disk" "${memfree:-?}" "$oom"
fail=0
awk -v v="${gwrss:-0}" 'BEGIN{exit !(v>9)}'  && { echo "ABORT: gateway RSS >9G"; fail=1; }
awk -v v="${elu:-0}"   'BEGIN{exit !(v>1000)}' && { echo "ABORT: event loop P99 >1000ms"; fail=1; }
[ "${stalled:-0}" -gt 0 ]      && { echo "ABORT: stalled sessions"; fail=1; }
[ "${disk:-99}" -lt 20 ]       && { echo "ABORT: disk <20G"; fail=1; }
[ "${memfree:-99999}" -lt 4096 ] && { echo "ABORT: host memory <4G"; fail=1; }
[ "${oom:-0}" -gt 0 ]          && { echo "ABORT: OOM kill"; fail=1; }
[ "$restarts" != "0" ]         && { echo "ABORT: gateway restarted"; fail=1; }
[ $fail -eq 0 ] && echo PASS
exit $fail
