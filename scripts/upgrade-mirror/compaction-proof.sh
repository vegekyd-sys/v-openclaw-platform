#!/usr/bin/env bash
# Mirror-only proof that the fast compaction provider (versa-runtime-providers)
# runs in-process on 9.6 no-worker when its model resolves. The mirror has no
# azure-openai provider (V's fastCompactionModel), so the run temporarily points
# fastCompactionModel at deepseek/deepseek-v4-flash, forces one compaction, and
# restores the exact config (sha256 checked) and restarts.
#   compaction-proof.sh <outDir>
set -uo pipefail
test "$(id -u)" = 0
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway; OUT=${1:?}
N=$R/runtime/node-v24.17.0-linux-x64/bin/node
C=$R/state/shared-vlab-20260909-v3/openclaw.json
log() { echo "$(date +%T) $*"; }
restart() { systemctl stop $UNIT; VERSA_NODE_FLAGS="--inspect=127.0.0.1:0" bash $R/scripts/start-gateway-prod.sh 95 2>&1 | grep -E "^ready|NOT READY|exited" | cut -c1-120; }
cp -a $C $C.pre-compaction-proof; want=$(sha256sum < $C)
$N -e 'const fs=require("fs");const f=process.argv[1];const c=JSON.parse(fs.readFileSync(f,"utf8"));const e=c.plugins.entries["versa-runtime-providers"];const m="deepseek/deepseek-v4-flash";e.config.fastCompactionModel=m;e.llm.allowedModels=[...new Set([...(e.llm.allowedModels||[]),m])];fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")' $C
log "fastCompactionModel -> deepseek/deepseek-v4-flash (temporary); restart"
restart; t0=$(date "+%Y-%m-%d %H:%M:%S")
(cd /tmp && VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/talk-compact-check.mjs nwf-cproof $OUT --skip-talk 2>&1 | tail -2)
j=$(journalctl -u $UNIT --since "$t0" --no-pager -o cat)
log "compaction proof: providerFailed=$(grep -c 'Compaction provider' <<<"$j") fallingBack=$(grep -c 'falling back' <<<"$j") notRegistered=$(grep -c 'configured but not registered' <<<"$j") notAuthorized=$(grep -c 'LLM_COMPLETION_NOT_AUTHORIZED' <<<"$j")"
grep -E "compaction" <<<"$j" | grep -vE "firsttext-metrics" | cut -c1-220 | tail -5
grep -E "firsttext-metrics" <<<"$j" | grep -E "compaction|llm" | grep -o '"provider":"[^"]*","model":"[^"]*"' | sort | uniq -c
cp -a $C.pre-compaction-proof $C
test "$(sha256sum < $C)" = "$want" && log "config restored byte-identical" || log "CONFIG RESTORE MISMATCH"
log "restart on the restored config"; restart
