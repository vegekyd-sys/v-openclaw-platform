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
grep -q "$R/prod91/worker" $C || { log "state is not the 9.1 production state"; exit 1; }

log "1/9 drain-stop 9.1"
if systemctl is-active --quiet $UNIT; then
  ok=0; for a in 1 2 3; do (cd $R/workspace && VERSA_UNIT=$UNIT.service $N22 $R/scripts/drain-stop.mjs rehearsal upgrade-$a) >>$EV/drain.log 2>&1 && { ok=1; break; }; sleep 30; done
  test $ok = 1 || { log "drain failed; stopping unit"; systemctl stop $UNIT; }
fi
systemctl stop $UNIT 2>/dev/null || true

log "2/9 backup state + configs"
t0=$(date +%s)
tar -C $R -cf - state | zstd -q -T2 -o $R/rollback-state-before-95.tar.zst -f
sha256sum $C $WC > $R/rollback-configs.sha256
cp -a $C $R/rollback-openclaw.json; cp -a $WC $R/rollback-worker-openclaw.json
cp -a $MI $R/rollback-makaron-image-index.js
log "   backup $(du -h $R/rollback-state-before-95.tar.zst | cut -f1) in $(( $(date +%s)-t0 ))s"

log "3/9 install core $PKG"
rm -rf $R/runtime/openclaw95; mkdir -p $R/runtime/openclaw95
t0=$(date +%s)
(cd $R/runtime/openclaw95 && PATH=$(dirname $N24):/usr/bin:/bin npm_config_cache=$R/cache/npm $(dirname $N24)/npm install --no-audit --no-fund --omit=dev "$PKG") > $EV/npm-install.log 2>&1
CORE=$R/runtime/openclaw95/node_modules/openclaw; CLI=$CORE/dist/index.js
# Official plugins are installed at the core's own version (9.5, 9.6, ...).
PV=$($N24 -p "require('$CORE/package.json').version")
log "   npm install $(( $(date +%s)-t0 ))s; version: $($N24 $CLI --version | head -1)"

log "4/9 worker plugin $WORKER_SRC"
W=$R/runtime/worker-95-final; rm -rf $W; cp -a $WORKER_SRC $W
log "   worker version $(grep -o '"version": *"[^"]*"' $W/package.json)"

log "5/9 convert plugin paths, fix makaron-image SDK import"
OFFICIAL_LIST=$EV/official-plugins.txt $N24 - $C $WC $R/prod91/worker $W <<'NODE' | tee -a $EV/upgrade.log
const fs = require('node:fs');
const [main, worker, oldW, newW] = process.argv.slice(2);
// Every official @openclaw/* package loaded by path is reinstalled from npm at the
// core's version: 9.6's doctor imports each plugin's own doctor contract natively,
// and a 9.1 package there cannot resolve "openclaw" (production V: msteams).
const official = (p) => p.match(/\/node_modules\/@openclaw\/([a-z0-9-]+)$/)?.[1];
const managed = (p) => Boolean(official(p)) || /openclaw-codex-|feishu-project|openclaw-moonshot-provider-/.test(p);
const names = new Set(['feishu', 'codex', 'moonshot-provider']);
for (const file of [main, worker]) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = c.plugins.load.paths;
  for (const p of before) if (official(p)) names.add(official(p));
  const next = before.filter((p) => !managed(p)).map((p) => (p === oldW ? newW : p));
  c.plugins.load.paths = next;
  // Production 9.1 has no swarm; 9.5 enables it by default and its collector
  // launch does not pass through the worker bridge yet.
  c.tools = c.tools || {}; c.tools.swarm = { ...(c.tools.swarm || {}), enabled: false };
  // 9.5 worker prewarm is wired (9.1 never called it): warm these agents before ready.
  const worker = c.plugins.entries?.['vlab-agent-worker-isolation'];
  if (worker?.config) worker.config.prewarmAgents = (process.env.PREWARM_AGENTS || 'makaron').split(',');
  fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
  console.log(JSON.stringify({ file, removed: before.filter(managed).length, worker: next.includes(newW) }));
}
fs.writeFileSync(process.env.OFFICIAL_LIST, [...names].sort().join('\n') + '\n');
NODE
sed -i -E "s#$R/[a-z0-9/_.-]*node_modules/openclaw/dist/plugin-sdk/#$CORE/dist/plugin-sdk/#; s#$R/runtime/openclaw/dist/plugin-sdk/#$CORE/dist/plugin-sdk/#" $MI
log "   makaron-image import -> $(grep -c "$CORE/dist/plugin-sdk/" $MI)"
chown -R $U: $R/runtime $R/state $R/capability-alignment-20260911 $R/cache

set -a; . $R/secrets.env; set +a
common=(HOME=$R OPENCLAW_HOME=$R OPENCLAW_STATE_DIR=$R/state OPENCLAW_CONFIG_PATH=$C OPENCLAW_WORKSPACE_DIR=$R/workspace
  XDG_CACHE_HOME=$R/cache TMPDIR=$R/tmp CODEX_HOME=$R/codex OPENCLAW_SKIP_CHANNELS=1 OPENCLAW_GATEWAY_PORT=25096
  VLAB_OPENCLAW_AGENT_RUNTIME=$CORE/dist/plugin-sdk/agent-runtime.js npm_config_cache=$R/cache/npm
  PATH=$(dirname $N24):/usr/local/bin:/usr/bin:/bin)
cd $R/workspace
log "6/9 plugins: every official @openclaw plugin @$PV from npm, then our Feishu/Codex builds over them"
# Only an official npm install record carries trusted-plugin status in 9.5; local
# archives never do. Install the official package, then replace its files
# (node_modules kept) with the same-version package built from the fork.
t0=$(date +%s)
log "   official plugins: $(tr '\n' ' ' < $EV/official-plugins.txt)"
for spec in $(sed "s#^#@openclaw/#; s#\$#@$PV#" $EV/official-plugins.txt); do
  runuser --preserve-environment -u $U -- env "${common[@]}" $N24 $CLI plugins install --force --accept-capabilities --acknowledge-install-policy-warning $spec >>$EV/plugins-install.log 2>&1 \
    && log "   installed $spec" || { log "   FAILED $spec"; tail -15 $EV/plugins-install.log | tee -a $EV/upgrade.log; exit 1; }
done
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
