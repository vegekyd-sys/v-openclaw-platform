#!/bin/bash
# Snapshot copies made by `nodes list` / `nodes status` / `status` on a private copy of VLab state,
# talking to the shared VLab Gateway (read-only RPCs). A churn writer stands in for V's Gateway,
# which appends to the state WAL all the time.
#   LABEL=..  CHURN=0|1  REPS=n  BLOAT_MB=n (grow the copy to V's size first)  SWEEP=1 (orphan checks)
set -u
N=/opt/vlab/node-v22.23.1-linux-x64/bin/node
HERE=$(cd "$(dirname "$0")" && pwd)
R=$VLAB_CANDIDATE_RUNTIME/openclaw; C=$R/openclaw.mjs
DB=$OPENCLAW_STATE_DIR/state/openclaw.sqlite
W=$VLAB_CANDIDATE_DATA/measure; mkdir -p $W/cache; export XDG_CACHE_HOME=$W/cache
LABEL=${LABEL:-run}; REPS=${REPS:-2}
SPORT=$($N -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).gateway.port)' "$VLAB_SHARED_CONFIG_PATH")
$N -e 'const fs=require("fs");const p=process.argv[1];const c=JSON.parse(fs.readFileSync(p));c.gateway.port=Number(process.argv[2]);fs.writeFileSync(p,JSON.stringify(c,null,2))' "$OPENCLAW_CONFIG_PATH" "$SPORT"
if [ "${BLOAT_MB:-0}" -gt 0 ] && [ ! -e $W/bloated ]; then
  $N --no-warnings -e '
    const { DatabaseSync } = require("node:sqlite"); const fs = require("fs");
    const [db, mb] = process.argv.slice(1); const d = new DatabaseSync(db);
    d.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS zz_candidate_bloat(id INTEGER PRIMARY KEY, v BLOB)");
    const ins = d.prepare("INSERT INTO zz_candidate_bloat(v) VALUES (randomblob(1048576))");
    while (fs.statSync(db).size + (fs.existsSync(db + "-wal") ? fs.statSync(db + "-wal").size : 0) < Number(mb) * 1048576) { d.exec("BEGIN"); for (let i = 0; i < 32; i++) ins.run(); d.exec("COMMIT"); }
    d.exec("PRAGMA wal_checkpoint(TRUNCATE)"); d.close();' $DB $BLOAT_MB
  touch $W/bloated
fi
for f in openclaw-state-db-readonly-C7txILW9.js sqlite-readonly-location-BvtpsFvn.js; do echo "runtime $f sha256=$(sha256sum $R/dist/$f | cut -c1-16) patched=$(grep -c cli-readonly-live $R/dist/$f)"; done
echo "== $LABEL: db=$(stat -c %s $DB) bytes, gateway port -> shared $SPORT, churn=${CHURN:-0}"
$N $HERE/trace-inject.mjs $R/dist/sqlite-readonly-location-BvtpsFvn.js
start_churn() { $N --no-warnings $HERE/churn.mjs $DB ${CHURN_MS:-50} ${CHURN_BYTES:-8192} 2>>$W/churn.log & CP=$!; sleep 2; }
stop_churn() { kill $CP; wait $CP 2>/dev/null; }
run() { # name args...
  local name=$1; shift
  for i in $(seq 1 $REPS); do
    rm -f $W/trace.jsonl
    [ "${CHURN:-0}" = 1 ] && start_churn
    local before_files=$(ls $OPENCLAW_STATE_DIR/state | tr '\n' ' ')
    OPENCLAW_SNAPSHOT_TRACE=$W/trace.jsonl /usr/bin/time -o $W/time -f "wall=%e out_blocks=%O maxrss_kb=%M" $N $C "$@" </dev/null >$W/out 2>$W/err; rc=$?
    local during_files=$(ls $OPENCLAW_STATE_DIR/state | tr '\n' ' ')
    [ "${CHURN:-0}" = 1 ] && stop_churn
    local blocks=$(sed -n 's/.*out_blocks=\([0-9]*\).*/\1/p' $W/time)
    local copies=$(grep -c '"fn":"createStableReadOnlyCopyInTempDirectory"\|"fn":"createOnlineReadOnlyBackup"' $W/trace.jsonl 2>/dev/null || true)
    echo "-- $LABEL $name #$i rc=$rc $(cat $W/time) write_MB=$((blocks*512/1048576)) copy_attempts=${copies:-0} state_files=[$during_files] same_as_before=$([ "$before_files" = "$during_files" ] && echo yes || echo no) leftover_dirs=$(ls $W/cache/openclaw 2>/dev/null | grep -c sqlite-readonly)"
    [ $rc = 0 ] || tail -c 600 $W/err
    [ $i = 1 ] && $N $HERE/summarize.mjs $W/trace.jsonl | $N -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("   calls:",JSON.stringify(j.byFn));for(const [k,v] of Object.entries(j.callers))console.log("   ",v,"x",k)})'
    [ $i = 1 ] && $N -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log("   output:",JSON.stringify({paired:j.paired?.length,pending:j.pending?.length,nodes:j.nodes?.length,keys:Object.keys(j).length}))' $W/out
  done
}
run nodes-list nodes list --json
run nodes-status nodes status --json
run status status --json
if [ "${SWEEP:-0}" = 1 ]; then
  echo "== sweep: a CLI killed mid-copy leaves its directory; the next allocation reclaims it once the owner is gone and it is 10 min old"
  ST=$W/cache/openclaw; mkdir -p $ST; chmod 700 $ST
  DEAD=$(bash -c 'echo $$')
  mkdir -p $ST/openclaw-sqlite-readonly-$DEAD-fake; head -c 1048576 /dev/zero > $ST/openclaw-sqlite-readonly-$DEAD-fake/database.sqlite; touch -d '1 hour ago' $ST/openclaw-sqlite-readonly-$DEAD-fake
  mkdir -p $ST/openclaw-sqlite-readonly-$DEAD-young
  start_churn
  OPENCLAW_V_LIVE_WAL_READS=0 $N $C nodes list --json </dev/null >/dev/null 2>&1 & K=$!
  for t in $(seq 1 100); do ls $ST | grep -q "openclaw-sqlite-readonly-$K-" && break; sleep 0.1; done
  kill -9 $K; wait $K 2>/dev/null
  echo "   after kill -9 of pid $K: $(ls $ST | tr '\n' ' ')"
  for d in $ST/openclaw-sqlite-readonly-$K-*; do touch -d '1 hour ago' $d; done
  OPENCLAW_V_LIVE_WAL_READS=0 $N $C nodes list --json </dev/null >/dev/null 2>&1; echo "   next snapshotting CLI rc=$?: $(ls $ST | tr '\n' ' ')"
  stop_churn
fi
tail -2 $W/churn.log 2>/dev/null
