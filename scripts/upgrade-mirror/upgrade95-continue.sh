#!/usr/bin/env bash
# Final rehearsal of the production upgrade 9.1 -> Versa 9.5 (source fork) on the
# mirror, production profile throughout:
#   upgrade95-final.sh <core.tgz> <feishu.tgz> <codex.tgz> <worker-dir>
# drain -> back up state+configs -> install core -> worker 0.2.11-versa95.1 ->
# convert plugin paths -> install our Feishu/Codex builds (+ official moonshot)
# -> config validate -> doctor --post-upgrade -> start 9.5 (production profile).
set -euo pipefail
test "$(id -u)" = 0
R=/srv/versa-mirror95; U=versa-rehearsal; UNIT=versa-mirror95-gateway
PKG=${1:?core tgz}; FEISHU=${2:?feishu tgz}; CODEX=${3:?codex tgz}; WORKER_SRC=${4:?worker dir}
EV=$R/evidence/upgrade-final-$(date +%Y%m%dT%H%M%S); mkdir -p $EV; chown $U: $EV
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a $EV/upgrade.log; }
C=$R/state/shared-vlab-20260909-v3/openclaw.json; WC=$R/state/shared-vlab-20260909-v3/worker-openclaw.json
N24=$R/runtime/node-v24.17.0-linux-x64/bin/node
N22=/opt/vlab/node-v22.23.1-linux-x64/bin/node
MI=$R/capability-alignment-20260911/plugin-sources/home/openclaw/makaron-openclaw/.openclaw-local/workspace/plugins/makaron-image/index.js

CORE=$R/runtime/openclaw95/node_modules/openclaw; CLI=$CORE/dist/index.js; t0=$(date +%s)
PV=$($N24 -p "require('$CORE/package.json').version")
set -a; . $R/secrets.env; set +a
common=(HOME=$R OPENCLAW_HOME=$R OPENCLAW_STATE_DIR=$R/state OPENCLAW_CONFIG_PATH=$C OPENCLAW_WORKSPACE_DIR=$R/workspace
  XDG_CACHE_HOME=$R/cache TMPDIR=$R/tmp CODEX_HOME=$R/codex OPENCLAW_SKIP_CHANNELS=1 OPENCLAW_GATEWAY_PORT=25096
  VLAB_OPENCLAW_AGENT_RUNTIME=$CORE/dist/plugin-sdk/agent-runtime.js npm_config_cache=$R/cache/npm
  PATH=$(dirname $N24):/usr/local/bin:/usr/bin:/bin)
cd $R/workspace
overlay() { # <tgz> <package-name>
  local tgz=$1 name=$2 dir src
  dir=$(ls -dt $R/state/npm/projects/*/node_modules/$name $R/npm/projects/*/node_modules/$name 2>/dev/null | head -1 || true)
  test -n "$dir" && grep -q "\"version\": \"$PV\"" $dir/package.json || { log "   no official $name install found"; exit 1; }
  src=$(mktemp -d); tar -xzf $tgz -C $src
  rsync -a --delete --exclude=/node_modules/ $src/package/ $dir/
  (cd $src/package && find . -path ./node_modules -prune -o -type f -print0 | xargs -0 sha256sum | sort -k2) > $EV/overlay-$(basename $tgz).want
  (cd $dir && find . -path ./node_modules -prune -o -type f -print0 | xargs -0 sha256sum | sort -k2) > $EV/overlay-$(basename $tgz).have
  cmp -s $EV/overlay-$(basename $tgz).want $EV/overlay-$(basename $tgz).have && log "   $name <- $(basename $tgz) (files verified) at $dir" || { log "   overlay mismatch for $name"; exit 1; }
  chown -R $U: $dir; rm -rf $src
}
overlay $FEISHU @openclaw/feishu
overlay $CODEX @openclaw/codex
log "   plugins $(( $(date +%s)-t0 ))s"

log "7/9 config validate"
runuser --preserve-environment -u $U -- env "${common[@]}" $N24 $CLI config validate > $EV/config-validate.log 2>&1 || { tail -20 $EV/config-validate.log | tee -a $EV/upgrade.log; exit 1; }

log "8/9 doctor --post-upgrade (state migration)"
t0=$(date +%s)
runuser --preserve-environment -u $U -- env "${common[@]}" $N24 $CLI doctor --post-upgrade --json > $EV/doctor.json 2> $EV/doctor.stderr || true
log "   doctor $(( $(date +%s)-t0 ))s"
$N24 -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log("   state schema "+db.prepare("PRAGMA user_version").get().user_version+" "+db.prepare("PRAGMA quick_check").get().quick_check)' $R/state/state/openclaw.sqlite | tee -a $EV/upgrade.log
$N24 -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("   doctor findings="+(d.findings?.length??"?"))}catch(e){console.log("   doctor json unreadable: "+e.message)}' $EV/doctor.json | tee -a $EV/upgrade.log

log "9/9 start 9.5 (production profile)"
bash $R/scripts/start-gateway-prod.sh 95 2>&1 | tee -a $EV/upgrade.log
log "evidence $EV"
