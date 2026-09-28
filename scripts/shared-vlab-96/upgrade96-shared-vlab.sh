#!/usr/bin/env bash
# Upgrade the shared VLab instance (db91-parity) from 9.1 to the versa 9.6 fork,
# using the flow rehearsed on /srv/versa-mirror95 (2026-09-27, acceptance 6/6):
#   upgrade96-shared-vlab.sh <core.tgz> <feishu.tgz> <codex.tgz> <worker-dir>
# Everything replaced is kept under /srv/vlab-upgrade96-backups/upgrade96-<ts>/ for
# rollback96-shared-vlab.sh <that dir>.
set -euo pipefail
# systemctl has no is-activating verb; a unit counts as gone only when failed, or
# inactive for more than 30 s (a restart passes through inactive briefly).
unit_gone() { local s; s=$(systemctl show -p ActiveState --value $1); if [ "$s" = failed ]; then return 0; fi
  if [ "$s" = inactive ]; then UNIT_INACTIVE_SINCE=${UNIT_INACTIVE_SINCE:-$(date +%s)}; [ $(( $(date +%s) - UNIT_INACTIVE_SINCE )) -gt 30 ]; return; fi
  UNIT_INACTIVE_SINCE=; return 1; }
test "$(id -u)" = 0
I=/srv/vlab-production-mirror/labs/instances/db91-parity; U=lab-db91-parity
UNIT=openclaw-vlab-production-mirror-v8; COMPANION=nightshift-vlab-production-mirror; PORT=24993
PKG=${1:?core tgz}; FEISHU=${2:?feishu tgz}; CODEX=${3:?codex tgz}; WORKER_SRC=${4:?worker dir}
# Backups live on the root disk: the instance disk (/dev/vdb) has ~14 GB free and
# the 9.6 migration grows the state by ~2 GB.
TS=$(date +%Y%m%dT%H%M%S); B=/srv/vlab-upgrade96-backups/upgrade96-$TS; EV=$B/evidence; mkdir -p $EV
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a $EV/upgrade.log; }
C=$I/state/shared-vlab-20260909-v3/openclaw.json; WC=$I/state/shared-vlab-20260909-v3/worker-openclaw.json
N24D=/opt/vlab/node-v24.17.0-linux-x64; N24=$N24D/bin/node
DROPIN=/etc/systemd/system/$UNIT.service.d/99z-versa-openclaw96.conf
test "$(df --output=avail -B1 $I | tail -1)" -gt $((8*1024**3)) || { log "instance disk has < 8 GB free; refusing"; exit 1; }
grep -q '"version": "2026.9.1"' $I/runtime/openclaw/package.json || { log "core is not 9.1; refusing"; exit 1; }
test ! -e $DROPIN || { log "$DROPIN already exists; refusing"; exit 1; }
if [ ! -x $N24 ]; then cp -a /srv/versa-mirror95/runtime/node-v24.17.0-linux-x64 $N24D; chmod -R a+rX $N24D; fi
$N24 --version | tee -a $EV/upgrade.log

log "1/10 stop (graceful drain via SIGTERM budget)"
if systemctl is-active --quiet $COMPANION; then echo active > $B/companion.state; else echo inactive > $B/companion.state; fi
systemctl stop $UNIT; systemctl stop $COMPANION 2>/dev/null || true

log "2/10 backup state, configs, core, worker"
t0=$(date +%s)
tar -C $I -cf - state | zstd -q -T2 -o $B/state.tar.zst
cp -a $C $B/openclaw.json; cp -a $WC $B/worker-openclaw.json
cp -a $I/runtime/production-worker $B/production-worker
# 9.6 migrates the CUA node's own state database on its first start; 9.1 cannot open it.
test -d $I/node-cua/state && cp -a $I/node-cua/state $B/node-cua-state
mv $I/runtime/openclaw $B/openclaw-9.1
log "   backup $(du -h $B/state.tar.zst | cut -f1) in $(( $(date +%s)-t0 ))s"

log "3/10 install core $PKG as a self-contained runtime/openclaw"
P=$I/upgrade/openclaw96-$TS; mkdir -p $P
# shallow: openclaw's dependencies go into its own node_modules (verified layout).
(cd $P && PATH=$N24D/bin:/usr/bin:/bin npm_config_cache=$I/cache/npm $N24D/bin/npm install --install-strategy=shallow --no-audit --no-fund --omit=dev "$PKG") > $EV/npm-install.log 2>&1
mv $P/node_modules/openclaw $I/runtime/openclaw
CORE=$I/runtime/openclaw; CLI=$CORE/dist/index.js
PV=$($N24 -p "require('$CORE/package.json').version")
log "   version: $($N24 $CLI --version | head -1)"

log "4/10 worker plugin -> runtime/production-worker"
rsync -a --checksum --delete --exclude='*.test.mjs' $WORKER_SRC/ $I/runtime/production-worker/
log "   worker version $(grep -o '"version": *"[^"]*"' $I/runtime/production-worker/package.json)"

log "5/10 config: official plugin paths -> npm installs, swarm off, worker prewarm"
OFFICIAL_LIST=$EV/official-plugins.txt $N24 - $C $WC <<'NODE' | tee -a $EV/upgrade.log
const fs = require('node:fs');
const official = (p) => p.match(/\/node_modules\/@openclaw\/([a-z0-9-]+)$/)?.[1];
const managed = (p) => Boolean(official(p)) || /openclaw-codex-|feishu-project|openclaw-moonshot-provider-/.test(p);
const names = new Set(['feishu', 'codex', 'moonshot-provider']);
for (const file of process.argv.slice(2)) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = c.plugins.load.paths;
  for (const p of before) if (official(p)) names.add(official(p));
  c.plugins.load.paths = before.filter((p) => !managed(p));
  c.tools = c.tools || {}; c.tools.swarm = { ...(c.tools.swarm || {}), enabled: false };
  const worker = c.plugins.entries?.['vlab-agent-worker-isolation'];
  if (worker?.config) worker.config.prewarmAgents = ['makaron'];
  fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
  console.log(JSON.stringify({ file, removed: before.length - c.plugins.load.paths.length }));
}
fs.writeFileSync(process.env.OFFICIAL_LIST, [...names].sort().join('\n') + '\n');
NODE
chown -R $U: $I/runtime $I/state $I/cache $I/upgrade 2>/dev/null || true

set -a; . $I/secrets.env; set +a
common=(HOME=$I OPENCLAW_HOME=$I OPENCLAW_STATE_DIR=$I/state OPENCLAW_CONFIG_PATH=$C OPENCLAW_WORKSPACE_DIR=$I/workspace
  XDG_CACHE_HOME=$I/cache TMPDIR=$I/tmp CODEX_HOME=$I/codex OPENCLAW_SKIP_CHANNELS=1 OPENCLAW_GATEWAY_PORT=$PORT
  VLAB_OPENCLAW_AGENT_RUNTIME=$CORE/dist/plugin-sdk/agent-runtime.js npm_config_cache=$I/cache/npm
  PATH=$N24D/bin:/usr/local/bin:/usr/bin:/bin)
cd $I/workspace
log "6/10 plugins @$PV: $(tr '\n' ' ' < $EV/official-plugins.txt)"
t0=$(date +%s)
for spec in $(sed "s#^#@openclaw/#; s#\$#@$PV#" $EV/official-plugins.txt); do
  if runuser --preserve-environment -u $U -- env "${common[@]}" $N24 $CLI plugins install --force --accept-capabilities --acknowledge-install-policy-warning $spec >>$EV/plugins-install.log 2>&1; then
    log "   installed $spec"
  else
    log "   FAILED $spec"; tail -15 $EV/plugins-install.log | tee -a $EV/upgrade.log; exit 1
  fi
done
overlay() { # <tgz> <package-name>
  local tgz=$1 name=$2 dir src
  dir=$(ls -dt $I/state/npm/projects/*/node_modules/$name $I/runtime/npm/projects/*/node_modules/$name $I/npm/projects/*/node_modules/$name 2>/dev/null | head -1 || true)
  if [ -z "$dir" ] || ! grep -q "\"version\": \"$PV\"" $dir/package.json; then log "   no official $name@$PV install found"; exit 1; fi
  src=$(mktemp -d); tar -xzf $tgz -C $src
  rsync -a --checksum --delete --exclude=/node_modules/ $src/package/ $dir/
  (cd $src/package && find . -path ./node_modules -prune -o -type f -print0 | xargs -0 sha256sum | sort -k2) > $EV/overlay-$(basename $tgz).want
  (cd $dir && find . -path ./node_modules -prune -o -type f -print0 | xargs -0 sha256sum | sort -k2) > $EV/overlay-$(basename $tgz).have
  if cmp -s $EV/overlay-$(basename $tgz).want $EV/overlay-$(basename $tgz).have; then log "   $name <- $(basename $tgz) (files verified) at $dir"; else log "   overlay mismatch for $name"; exit 1; fi
  chown -R $U: $dir; rm -rf $src
}
overlay $FEISHU @openclaw/feishu
overlay $CODEX @openclaw/codex
log "   plugins $(( $(date +%s)-t0 ))s"

log "7/10 config validate"
if ! runuser --preserve-environment -u $U -- env "${common[@]}" $N24 $CLI config validate > $EV/config-validate.log 2>&1; then tail -20 $EV/config-validate.log | tee -a $EV/upgrade.log; exit 1; fi

log "8/10 systemd drop-in: Node 24, 9.6 startup migration and validation receipts"
cat > $DROPIN <<EOF
# versa 9.6 upgrade $TS (rollback: rollback96-shared-vlab.sh $B)
[Service]
Environment=PATH=$N24D/bin:/usr/local/bin:/usr/bin:/bin
Environment=OPENCLAW_STARTUP_MIGRATION_LEASE_TTL_MS=7200000
Environment=OPENCLAW_STARTUP_MIGRATION_EXTERNAL_BACKUP=$B/state.tar.zst
Environment=OPENCLAW_AGENT_DB_VALIDATION_RECEIPT_DIR=$I/state/.validation-receipts
Environment=OPENCLAW_SQLITE_STARTUP_INPLACE_READONLY=1
Environment=OPENCLAW_SQLITE_INTEGRITY_READ_AHEAD=1
Environment=OPENCLAW_AGENT_DB_INTEGRITY_MAX_AGE_HOURS=24
Environment=OPENCLAW_SQLITE_CLOSE_ON_SIGNAL=1
Environment=OPENCLAW_SESSION_ROW_MATERIALIZE_COALESCE_MS=1000
TimeoutStartSec=infinity
ExecStart=
ExecStart=/bin/sh -c 'OPENCLAW_AGENT_DB_VALIDATION_EPOCH=\$\$(cat /proc/sys/kernel/random/uuid) exec $N24 --inspect=127.0.0.1:9229 --max-old-space-size=8192 $CLI gateway --port $PORT'
EOF
cp -a $DROPIN $B/
mkdir -p $I/state/.validation-receipts; chown $U: $I/state/.validation-receipts
systemctl daemon-reload
systemctl show -p ExecStart $UNIT | cut -c1-300 | tee -a $EV/upgrade.log

log "9/10 start 9.6 (first start migrates the databases; may take 30+ min)"
systemctl reset-failed $UNIT 2>/dev/null || true
start=$(date +%s)
systemctl start --no-block $UNIT
ready=0
for _ in $(seq 1 3600); do
  if unit_gone $UNIT; then log "unit exited"; journalctl -u $UNIT -n 40 --no-pager -o cat | tee -a $EV/upgrade.log; exit 2; fi
  if journalctl -u $UNIT --since "@$start" --no-pager -o cat 2>/dev/null | grep -q "\[gateway\] ready"; then ready=1; log "   ready after $(( $(date +%s)-start ))s"; break; fi
  sleep 2
done
test $ready = 1 || { log "NOT READY after $(( $(date +%s)-start ))s"; exit 3; }

log "10/10 companion"
if [ "$(cat $B/companion.state)" = active ]; then systemctl start $COMPANION && log "   $COMPANION started"; fi
log "done; backup and evidence in $B"
