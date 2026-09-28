#!/usr/bin/env bash
# 9.6 no-worker patch regression on the shared VLab (vlab91). Read-only toward the instance except:
# test sessions keyed "regress96-", one regress96- workboard board (created + deleted), at most
# one regress96- cron job (only if the C patch is missing; then removed), one short managed-room
# voice session (created + closed). Concurrency <= 2 (a parent turn and its subagent).
#   run-all.sh <label> [phase ...]     phases: static inspector rpc-read chat rpc-write units state logs
set -uo pipefail
cd "$(dirname "$0")"
L=${1:?label}; shift
PHASES=${*:-static inspector rpc-read chat rpc-write units state logs}
N=/opt/vlab/node-v24.17.0-linux-x64/bin/node
OUT=results/$L; mkdir -p "$OUT"
UNIT=openclaw-vlab-production-mirror-v8
PID=$(systemctl show $UNIT -p MainPID --value)
CORE=$(tr '\0' '\n' </proc/$PID/cmdline | grep '/openclaw/dist/index.js$' | sed 's#/dist/index.js##')
I=$(dirname "$(dirname "$CORE")")
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a "$OUT/run.log"; }
journalctl -u $UNIT --since "$(systemctl show $UNIT -p ExecMainStartTimestamp --value | awk '{print $2, $3}')" --no-pager -o cat | grep -c '\[gateway\] ready' >/dev/null || { log "gateway not ready; refusing"; exit 3; }  # not grep -q: pipefail + SIGPIPE
log "label=$L pid=$PID core=$CORE phases=[$PHASES]"
for p in $PHASES; do
  case $p in
    static)    log static;    timeout 540 $N r4-static.mjs "$L" "$OUT" core-dist-manifest.json 2>>"$OUT/stderr.log" | tee -a "$OUT/run.log" ;;
    inspector) log inspector; timeout 120 $N r6-inspector.mjs "$L" "$OUT" 2>>"$OUT/stderr.log" | tee -a "$OUT/run.log" ;;
    rpc-read)  log rpc-read;  timeout 540 $N r2-rpc.mjs "$L-read" "$OUT" health,listings,no-worker 2>>"$OUT/stderr.log" | tee -a "$OUT/run.log" ;;
    chat)
      log chat
      $N r8-locks.mjs "$L" "$OUT" "${LOCK_SECS:-1800}" > "$OUT/r8-locks.out" 2>>"$OUT/stderr.log" &
      SAMPLER=$!
      $N r1-chat.mjs "$L" "$OUT" ${CHAT_IDS:-} 2>&1 | tee -a "$OUT/run.log"
      log "chat done; waiting for lock sampler"; wait $SAMPLER; cat "$OUT/r8-locks.out" | tee -a "$OUT/run.log" ;;
    rpc-write) log rpc-write; timeout 540 $N r2-rpc.mjs "$L-write" "$OUT" setup-verify-b4,workboard-d,voice,controlui-assets 2>>"$OUT/stderr.log" | tee -a "$OUT/run.log" ;;
    units)
      log units
      FEISHU=$(ls -dt $I/state/npm/projects/*/node_modules/@openclaw/feishu $I/runtime/npm/projects/*/node_modules/@openclaw/feishu 2>/dev/null | head -1)
      (cd units && OPENCLAW_PKG=$CORE timeout 300 $N --import ./hooks.mjs units.mjs --config "$(tr '\0' '\n' </proc/$PID/environ | sed -n 's/^OPENCLAW_CONFIG_PATH=//p' | head -1)" > "../$OUT/r5-units-$L.json" 2>>"../$OUT/stderr.log"); tail -c 600 "$OUT/r5-units-$L.json" | tee -a "$OUT/run.log"
      (cd feishu && FEISHU_PKG=$FEISHU OPENCLAW_PKG=$CORE timeout 300 $N --import ./hooks.mjs harness.mjs > "../$OUT/r5-feishu-$L.json" 2>>"../$OUT/stderr.log"); tail -c 600 "$OUT/r5-feishu-$L.json" | tee -a "$OUT/run.log" ;;
    state)     log state;     timeout 540 $N r7-state.mjs "$L" "$OUT" 2>>"$OUT/stderr.log" | tee -a "$OUT/run.log" ;;
    logs)      log logs;      timeout 540 $N r3-logs.mjs "$L" "$OUT" $(ls "$OUT"/r1-chat-*.json 2>/dev/null) 2>>"$OUT/stderr.log" | tee -a "$OUT/run.log" ;;
    *) log "unknown phase $p" ;;
  esac
done
log done
