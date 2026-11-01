#!/bin/bash
# cli-startup-fast on real bytes: timing, then the launcher behaviours the release depends on.
set -u
N=/opt/vlab/node-v22.23.1-linux-x64/bin/node
HERE=$(cd "$(dirname "$0")/cli-startup" && pwd)
C=$VLAB_CANDIDATE_RUNTIME/openclaw/openclaw.mjs; I=$VLAB_CANDIDATE_RUNTIME/openclaw/dist/index.js
W=$(mktemp -d); DB=$W/mock.sqlite
$N --no-warnings $HERE/mock-bridge.mjs $DB > $W/mock.log & MOCK=$!
sleep 1
A="--provider codex --relay-id mock --state-db $DB --timeout 3000"
t() { local l=$1 n=$2; shift 2; for i in $(seq 1 $n); do /usr/bin/time -f "$l wall=%e cpu=%U+%S rss_kb=%M" "$@" </dev/null 2>&1 >/dev/null | tail -1; done; }
for i in 1 2 3; do $N $C hooks relay $A --event post_tool_use </dev/null >/dev/null 2>&1; done
t relay-fast 10 nice -n 10 $N $C hooks relay $A --event post_tool_use
OPENCLAW_V_CLI_FAST_PATH=0 t relay-switch-off 5 nice -n 10 $N $C hooks relay $A --event post_tool_use
for i in 1 2 3; do $N $C cron status --json --timeout 1000 </dev/null >/dev/null 2>&1; done
t cron-fast 5 $N $C cron status --json --timeout 1000
OPENCLAW_V_CLI_FAST_PATH=0 t cron-switch-off 5 $N $C cron status --json --timeout 1000
echo "-- relay output"; echo '{"x":1}' | $N $C hooks relay $A --event post_tool_use 2>$W/e; echo "rc=$? stderr_bytes=$(wc -c <$W/e)"
echo "-- entry is not loaded by the relay, and is by everything else (module list)"
cat > $W/hook.mjs <<'H'
import {registerHooks} from 'node:module'; import fs from 'node:fs'; let n=0,e=false,r=false;
registerHooks({load(u,c,x){n++;if(u.endsWith('/dist/entry.js'))e=true;if(u.includes('/cli/run-main'))r=true;return x(u,c)}});
process.on('exit',()=>fs.appendFileSync(process.env.OUT,JSON.stringify({argv:process.argv.slice(2,4),modules:n,entry:e,runMain:r,ready:process.env.OPENCLAW_NODE_OPTIONS_READY??null})+'\n'));
H
OUT=$W/m.jsonl $N --import $W/hook.mjs $C hooks relay $A --event post_tool_use </dev/null >/dev/null 2>&1
OUT=$W/m.jsonl $N --import $W/hook.mjs $C config get gateway.port </dev/null >/dev/null 2>&1
cat $W/m.jsonl
echo "-- respawn: child processes of cron status"
cat > $W/ps.sh <<'P'
P
strace -f -qq -e trace=execve -o $W/s.txt $N $C cron status --json --timeout 1000 </dev/null >/dev/null 2>&1; echo "execve node count=$(grep -c 'execve(.*node' $W/s.txt)"
OPENCLAW_V_CLI_FAST_PATH=0 strace -f -qq -e trace=execve -o $W/s.txt $N $C cron status --json --timeout 1000 </dev/null >/dev/null 2>&1; echo "switch off execve node count=$(grep -c 'execve(.*node' $W/s.txt)"
echo "-- entrypoints that do not go through the launcher"
OUT=$W/i.jsonl $N --import $W/hook.mjs $I config get gateway.port </dev/null 2>&1 | tail -1 | cut -c1-40; cat $W/i.jsonl
echo "preflight loaded by index.js: $(strace -f -qq -e trace=openat -o $W/s2.txt $N $I config get gateway.port </dev/null >/dev/null 2>&1; grep -c 'dist/warning-filter.js' $W/s2.txt)"
echo "preflight loaded by launcher: $(strace -f -qq -e trace=openat -o $W/s2.txt $N $C config get gateway.port </dev/null >/dev/null 2>&1; grep -c 'dist/warning-filter.js' $W/s2.txt)"
echo "-- stderr unchanged on a warning-prone command"
$N $C config validate </dev/null >$W/o1 2>$W/e1; r1=$?; OPENCLAW_V_CLI_FAST_PATH=0 $N $C config validate </dev/null >$W/o2 2>$W/e2; r2=$?
echo "rc $r1 $r2; stderr same: $(cmp -s $W/e1 $W/e2 && echo yes || echo no); stdout same: $(cmp -s $W/o1 $W/o2 && echo yes || echo no); stderr_experimental=$(grep -c Experimental $W/e1)"
kill $MOCK; rm -rf $W
