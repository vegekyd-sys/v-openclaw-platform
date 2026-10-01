#!/usr/bin/env bash
# V production read-only sampler. Emits key=value lines on stdout.
# Constraints: no recursive grep, no full-disk du, no synthetic traffic.
# Never use set -e/pipefail here: grep misses must not abort the sample.

WINDOW="${1:-70}"

# --- unit state ---
for u in openclaw-gateway nightshift-workboard openclaw-vlab-browser \
         hermes-gateway nexus-gateway openclaw-dashboard \
         dealclaw-central-gateway dealclaw-agent dealclaw-sq-api \
         dealclaw-provisioning dealclaw-credits-ledger dealclaw-admin-dashboard; do
  # Parse by property NAME: systemctl orders --value output by its own internal
  # ordering, not by the order of the -p flags. Positional reads silently swap fields.
  eval "$(systemctl show "$u" -p ActiveState -p SubState -p NRestarts 2>/dev/null | sed 's/^/u_/')"
  echo "unit ${u} ${u_ActiveState:-missing} ${u_SubState:-missing} ${u_NRestarts:-0}"
  unset u_ActiveState u_SubState u_NRestarts
done

# --- host resources ---
echo "disk_avail_mb $(df -BM --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')"
echo "mem_avail_mb $(free -m | awk '/^Mem:/{print $7}')"
echo "load1 $(awk '{print $1}' /proc/loadavg)"

# --- worker pool (rss KiB, age seconds) ---
ps -eo pid,rss,etimes,args 2>/dev/null | grep 'worker/worker' | grep -v grep \
  | awk '{print "worker " $1 " " $2 " " $3}'

# Pool size itself. On 2026-09-20 a config hot reload closed the Worker pool
# without rebuilding it: the Gateway stayed active with a 200 health endpoint
# and NRestarts=0 while every request died in 2ms on "worker pool is closing".
# An empty pool is a total outage that no other signal here reports.
# Second field is seconds since the Gateway unit became active, so the rule
# layer can ignore the ~2 minutes an empty pool is normal during startup.
# Runtime mode, printed before poolsize so the rule layer knows whether an
# empty pool is an outage. Same rule as v-sentinel's worker_mode(): 9.6
# no-worker mode (agent turns in the Gateway, Worker plugin disabled) has no
# pool at all. "unknown" (config unreadable) keeps the worker rules.
runtime_mode=$(python3 -c '
import json, sys
try:
    c = json.load(open("/home/openclaw/.openclaw/openclaw.json"))
except Exception:
    print("unknown"); sys.exit()
def routes(v):
    if isinstance(v, dict):
        rt = v.get("agentRuntime")
        return (isinstance(rt, dict) and rt.get("id") == "vlab-worker") or any(routes(x) for x in v.values())
    return isinstance(v, list) and any(routes(x) for x in v)
e = ((c.get("plugins") or {}).get("entries") or {}).get("vlab-agent-worker-isolation")
print("worker" if (isinstance(e, dict) and e.get("enabled", True) is not False) or routes(c) else "no-worker")
' 2>/dev/null)
echo "runtime_mode ${runtime_mode:-unknown}"
gw_mono=$(systemctl show openclaw-gateway -p ActiveEnterTimestampMonotonic --value 2>/dev/null)
gw_up=$(awk -v m="${gw_mono:-0}" '{ if (m > 0) printf "%d", $1 - m/1e6; else print -1 }' /proc/uptime)
echo "poolsize $(ps -eo args 2>/dev/null | grep -c '[w]orker/worker.mjs') ${gw_up}"
# Pool closing, plus the saturation signals. Measured on 2026-09-20: all three
# stall counters are exactly 0 across 10-11h, 14-15h and 18-19h of real traffic,
# and jump to 18.9 / 0.4 / 3.0 per 70s window once the pool pins at maxWorkers.
# They are what a user actually feels -- a message that never gets answered --
# so a low threshold is safe here.
journalctl -u openclaw-gateway --since "-${WINDOW}s" --no-pager -o cat 2>/dev/null \
  | awk '
      /worker pool is closing/                  { closing++ }
      /Worker stream acknowledgement timed out/  { ack++ }
      /made no progress for/                     { noprog++ }
      /Request timed out before a response/      { reqto++ }
      END { printf "poolclosing %d\n", closing+0
            printf "stall %d %d %d\n", ack+0, noprog+0, reqto+0 }'

# --- gateway main process ---
ps -eo pid,rss,etimes,args 2>/dev/null | grep -- '--inspect=127.0.0.1:9229' | grep -v grep \
  | awk '{print "gateway_proc " $1 " " $2 " " $3}'

# --- loopback health probes (cheap, no auth, no traffic generation) ---
for spec in nightshift:24879:/health gateway:18789:/ dashboard:18890:/ browser_broker:22794:/; do
  name="${spec%%:*}"; rest="${spec#*:}"; port="${rest%%:*}"; path="${rest#*:}"
  # One slow answer is not an outage: nightshift's board.read swings from 11ms
  # to 1.6s, so a single 4s curl reported 000 on a service that was serving 200s.
  # Confirm a bad code with a second, longer attempt before believing it.
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}${path}" 2>/dev/null)
  case "${code:-000}" in
    000|5??) sleep 2
             code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}${path}" 2>/dev/null) ;;
  esac
  echo "health ${name} ${port} ${code:-000}"
done


# --- public egress and TCP health toward the model provider ---
# Egress cap, not RTT, was the 2026-09-18 first-token root cause: a TTFB probe
# cannot see it. Sum bytes_sent deltas over 5s for non-loopback, non-private
# peers; count provider sockets stuck at cwnd:1 (policer drops).
python3 - <<'PY' 2>/dev/null
import subprocess,re,time,ipaddress
def snap():
    d={}; cur=None
    for l in subprocess.run(["ss","-tinH","state","established"],capture_output=True,text=True).stdout.splitlines():
        m=re.search(r"bytes_sent:(\d+)",l)          # tcp-info line (tab-indented) vs header line
        if m and cur: d[cur]=d.get(cur,0)+int(m.group(1))
        elif not m and len(l.split())>3: cur=l.split()[3]
    return d
def pub(peer):
    try: a=ipaddress.ip_address(peer.rsplit(":",1)[0].strip("[]")); return not(a.is_loopback or a.is_private or a.is_link_local)
    except: return False
a=snap(); time.sleep(5); b=snap()
mbps=sum((b[k]-a.get(k,0))*8/5/1e6 for k in b if pub(k) and b[k]>a.get(k,0))
ds=subprocess.run(["ss","-tin","dst 3.173.21.0/24"],capture_output=True,text=True).stdout
tot=ds.count("cwnd:"); c1=len(re.findall(r"cwnd:1\b",ds))
print(f"egress_public_mbps {mbps:.2f}"); print(f"provider_cwnd1 {c1} {tot}")
PY

# --- passive latency + failure signal from real traffic ---
journalctl -u openclaw-gateway --since "-${WINDOW}s" --no-pager -o cat 2>/dev/null \
  | grep -o '\[firsttext-metrics\] {.*}' | sed 's/^\[firsttext-metrics\] //' \
  | awk '{print "ftm " $0}'

# --- runs that began speaking and then died ---
# A run that emitted first-nonempty-text and still ended isError=true means the
# user watched a reply start and stop. This is the one shape that cannot be
# confused with the agent deciding a message needs no reply: that path never
# starts streaming. A 2026-09-20 rule keyed on "no reply" was removed for
# exactly that confusion. Measured 2026-09-23: 5 user-facing occurrences in a
# full day, every one a real truncated answer.
journalctl -u openclaw-gateway --since "-${WINDOW}s" --no-pager -o cat 2>/dev/null \
  | python3 -c '
import sys, re
streamed, failed, internal = set(), {}, ("workboard", "nightshift", "announce")
for line in sys.stdin:
    if "first-nonempty-text" in line:
        m = re.search(r"\"runId\":\"([^\"]+)\"", line)
        if m: streamed.add(m.group(1))
    elif "isError=true" in line:
        m = re.search(r"runId=([0-9a-zA-Z:_-]+)", line)
        if m: failed[m.group(1)] = line
hits = [r for r in streamed & set(failed)
        if not r.startswith(internal)
        and "internal-session-effects" not in r and "skill-workshop" not in r]
print("cutoff %d %s" % (len(hits), ",".join(hits) if hits else "-"))
' 2>/dev/null

# --- error signatures in the window (fixed patterns, bounded scan) ---
journalctl -u openclaw-gateway --since "-${WINDOW}s" --no-pager -o cat 2>/dev/null \
  | grep -E '^[0-9T:+.-]+ \[[a-zA-Z0-9:_-]+\]' \
  | grep -vE '\[agent:[a-z]+\]|\[firsttext-metrics\]' \
  | grep -E 'ECONNREFUSED|ETIMEDOUT|ERR_STREAM|heap out of memory|FATAL ERROR|Unhandled|UnhandledPromise|EADDRINUSE|ENOSPC|SQLITE_BUSY|SQLITE_CORRUPT|502 Bad Gateway|circuit open' \
  | awk '{ n++; if (match($0, /\[[A-Za-z:_-]+\]/)) src[substr($0, RSTART+1, RLENGTH-2)]++; else src["?"]++ }
         END { printf "errcount gateway %d", n+0; for (k in src) printf " %s=%d", k, src[k]; printf "\n" }'

# --- OOM / kernel kills in the window ---
journalctl -k --since "-${WINDOW}s" --no-pager -o cat 2>/dev/null \
  | grep -cE 'Out of memory|oom-kill|oom_reaper' \
  | awk '{print "oomcount " $1}'
