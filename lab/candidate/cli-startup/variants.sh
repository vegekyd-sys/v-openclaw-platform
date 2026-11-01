#!/bin/bash
set -u
N=/opt/vlab/node-v22.23.1-linux-x64/bin/node
R=$VLAB_CANDIDATE_RUNTIME/openclaw; C=$R/openclaw.mjs
HERE=$(cd "$(dirname "$0")" && pwd)
W=$(mktemp -d); DB=$W/mock.sqlite
$N --no-warnings $HERE/mock-bridge.mjs $DB > $W/mock.log & MOCK=$!
sleep 1; cat $W/mock.log; uptime
RELAY="hooks relay --provider codex --relay-id mock --state-db $DB --event post_tool_use --timeout 3000"
RP=${REPS:-12}
one() { # variant label env... -- cmd...
  local v=$1 l=$2; shift 2
  for i in 1 2 3; do "$@" </dev/null >/dev/null 2>&1; done
  for i in $(seq 1 $RP); do /usr/bin/time -f "$v $l wall=%e cpu=%U+%S rss_kb=%M" "$@" </dev/null 2>&1 >/dev/null | tail -1; sleep 0.2; done
}
sanity() { echo "-- sanity $1"; $N $C config get gateway.port </dev/null 2>$W/err | head -c 80; echo " rc=$? stderr_bytes=$(wc -c <$W/err)"; head -c 300 $W/err; $N $C $RELAY </dev/null; echo "relay rc=$?"; $N $C config validate </dev/null 2>&1 | tail -1 | cut -c1-120; OPENCLAW_NODE_OPTIONS_READY=1 $N $C sessions --json --limit 1 </dev/null 2>/dev/null | head -c 60; echo; }
matrix() { local v=$1
  one $v relay nice -n 10 $N $C $RELAY
  one $v cron_status env $2 $N $C cron status --json --timeout 1000
  one $v config_get env $2 $N $C config get gateway.port
  one $v sessions env $2 $N $C sessions --json --limit 1
}
one thin relay $N --no-warnings $HERE/thin-relay.mjs $RELAY
matrix base0 X=1
matrix ready OPENCLAW_NODE_OPTIONS_READY=1
sanity ready
python3 $HERE/patch.py $R ansi
matrix ready+ansi OPENCLAW_NODE_OPTIONS_READY=1
python3 $HERE/patch.py $R fast
matrix ready+ansi+fast OPENCLAW_NODE_OPTIONS_READY=1
sanity fast
python3 $HERE/patch.py $R bundle
matrix ready+ansi+fast+bundle OPENCLAW_NODE_OPTIONS_READY=1
sanity bundle
python3 $HERE/patch.py $R relaytrim
one ready+ansi+fast+bundle+trim relay nice -n 10 $N $C $RELAY
sanity trim
one thin relay $N --no-warnings $HERE/thin-relay.mjs $RELAY
kill $MOCK; rm -rf $W; uptime
