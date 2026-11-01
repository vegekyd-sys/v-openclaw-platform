#!/bin/bash
# Native hook relay: load micro-benchmark, then 15-concurrency A/B on one private Gateway.
set -u
N=/opt/vlab/node-v22.23.1-linux-x64/bin/node
R=$VLAB_CANDIDATE_RUNTIME/openclaw
HERE=$(cd "$(dirname "$0")" && pwd)
W=$(mktemp -d /tmp/relay-ab.XXXXXX); export OUT_DIR=$W/out; mkdir -p $OUT_DIR
export RELAY_SLOW_FLAG=$W/slow.flag RELAY_NONICE_FLAG=$W/nonice.flag
[ "${SKIP_PATCH:-}" = "1" ] || python3 $HERE/patch.py $R relayfast $RELAY_SLOW_FLAG
mkdir -p $W/vcodex; tar xzf $HERE/v-codex-dist.tgz -C $W/vcodex; export V_CODEX_DIST_DIR=$W/vcodex/dist
DB=$W/mock.sqlite; $N --no-warnings $HERE/mock-bridge.mjs $DB > $W/mock.log & MOCK=$!
sleep 1
ARGS="hooks relay --provider codex --relay-id mock --state-db $DB --event post_tool_use --timeout 9000"
run() { local v=$1 n=$2; shift 2; for i in $(seq 1 $n); do /usr/bin/time -f "$v wall=%e cpu=%U+%S rss_kb=%M" "$@" </dev/null 2>&1 >/dev/null | tail -1; done; }
warm() { touch $RELAY_SLOW_FLAG; for i in 1 2 3; do $N $R/openclaw.mjs $ARGS </dev/null >/dev/null 2>&1; done; rm -f $RELAY_SLOW_FLAG; for i in 1 2 3; do $N $R/openclaw.mjs $ARGS </dev/null >/dev/null 2>&1; done; }
warm
if [ "${SKIP_MICRO:-}" != "1" ]; then
echo "-- host as is: $(uptime)"
rm -f $RELAY_SLOW_FLAG; run idle-fast 12 nice -n 10 $N $R/openclaw.mjs $ARGS
touch $RELAY_SLOW_FLAG; run idle-slow 12 nice -n 10 $N $R/openclaw.mjs $ARGS
# Saturate every core with normal-priority spinners, the state a 15-concurrency level puts the host in.
SP=""; for i in $(seq 1 $(( $(nproc) * 2 ))); do $N -e 'for(;;){}' & SP="$SP $!"; done
sleep 2; echo "-- saturated: $(uptime)"
for r in 1 2 3; do
  touch $RELAY_SLOW_FLAG; run busy-slow-nice10 5 nice -n 10 $N $R/openclaw.mjs $ARGS; run busy-slow-nice0 5 $N $R/openclaw.mjs $ARGS
  rm -f $RELAY_SLOW_FLAG; run busy-fast-nice10 5 nice -n 10 $N $R/openclaw.mjs $ARGS; run busy-fast-nice0 5 $N $R/openclaw.mjs $ARGS
done
kill $SP 2>/dev/null; fi; kill $MOCK 2>/dev/null; sleep 5; rm -f $RELAY_SLOW_FLAG
echo "-- sessions usage"; $N $R/openclaw.mjs sessions --json </dev/null 2>&1 | head -c 500; echo
timeout ${AB_TIMEOUT:-9000} $N --no-warnings $HERE/runtime-concurrency.mjs > $OUT_DIR/stdout.jsonl 2>$OUT_DIR/stderr.txt; echo "harness rc=$?"
tail -c 1500 $OUT_DIR/stderr.txt
python3 - "$OUT_DIR" <<'P'
import json,sys,glob,statistics as st
o=sys.argv[1]; v=None;
for l in open(o+'/progress.jsonl',errors='ignore'):
    try:d=json.loads(l)
    except:continue
    p=d.get('phase')
    if p=='relay-variant': v=d['variant']
    elif p=='level': print('LEVEL',v,{k:d.get(k) for k in('arm','task','c','failed','failRate','doneP50','doneP95','firstP50','stallMaxMs','completeP50','completionP50')})
    elif p in('policy-probe','policy-log','codex-nice-switch','gate','abort','prepare-error'): print(p,json.dumps(d,ensure_ascii=False)[:1400])
P
mkdir -p /tmp/cli-startup-ab; cp -r $OUT_DIR/progress.jsonl /tmp/cli-startup-ab/ 2>/dev/null; python3 - <<P
import json
d=json.load(open("$OUT_DIR/summary.json")) if __import__('os').path.exists("$OUT_DIR/summary.json") else None
print('summary keys',list(d)[:30] if d else None)
if d:
  print(json.dumps(d.get('levels',[{}])[0].get('cpuTop') or {},ensure_ascii=False)[:400])
P
rm -rf $W; uptime
