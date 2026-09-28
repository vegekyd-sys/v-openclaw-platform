#!/usr/bin/env bash
# Upgrade the shared VLab instance (db91-parity) from 9.1 to the versa 9.6 fork in
# NO-WORKER mode (agent turns in the Gateway on 9.6's native "openclaw" runtime),
# the flow rehearsed on /srv/versa-mirror95 (upgrade96-noworker.sh, 2026-09-28:
# accept 6/6, stress 12/12, 130 min soak):
#   upgrade96-noworker-shared-vlab.sh <core.tgz> <feishu.tgz> <codex.tgz> <versa-runtime-providers-dir> <deepseek-provider.tgz>
# Differences from upgrade96-shared-vlab.sh (worker mode):
#   - the Worker component is NOT installed; runtime/production-worker is left as is
#     (backed up) and its plugin is disabled by the converter;
#   - versa-runtime-providers goes to runtime/versa-runtime-providers;
#   - noworker96-config.mjs converts the Gateway config (vlab-worker -> openclaw,
#     worker plugin off, providers plugin on, mcp.sessionIdleTtlMs, voice-memory MCP
#     off = V parity); the worker config (worker-openclaw.json) stays byte-identical;
#   - our DeepSeek provider build is overlaid like Feishu and Codex;
#   - TRAFFIC CLOSED: a 99zz drop-in sets OPENCLAW_SKIP_CHANNELS=1 and
#     OPENCLAW_SKIP_CRON=1 and the companion is NOT started. The 2026-09-27 attempt
#     opened channels on the first start and the first makaron access ran a 285 s
#     synchronous integrity check. Open traffic with open-traffic96-shared-vlab.sh
#     only after planned-restart96-shared-vlab.sh + post-restart-check.mjs pass.
# Everything replaced is kept under /srv/vlab-upgrade96-backups/upgrade96nw-<ts>/ for
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
PKG=${1:?core tgz}; FEISHU=${2:?feishu tgz}; CODEX=${3:?codex tgz}; PROVIDERS_SRC=${4:?versa-runtime-providers dir}; DEEPSEEK=${5:?deepseek-provider tgz}
SCRIPTS=$(cd "$(dirname "$0")" && pwd); CONVERT=$SCRIPTS/noworker96-config.mjs
test -f $CONVERT || CONVERT=$SCRIPTS/../upgrade-mirror/noworker96-config.mjs
# UPGRADE_DRY_RUN=1: run every precondition check below, dry-run the converter on a
# private copy of the live config, print the result and exit without changing anything.
DRY=${UPGRADE_DRY_RUN:-0}
# Backups live on the root disk: the instance disk (/dev/vdb) has ~10-14 GB free and
# the 9.6 migration grows the state by ~2 GB.
TS=$(date +%Y%m%dT%H%M%S); B=/srv/vlab-upgrade96-backups/upgrade96nw-$TS; EV=$B/evidence
if [ "$DRY" = 1 ]; then EV=$(mktemp -d); fi
mkdir -p $EV; [ "$DRY" = 1 ] || chmod 755 $B
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a $EV/upgrade.log; }
C=$I/state/shared-vlab-20260909-v3/openclaw.json; WC=$I/state/shared-vlab-20260909-v3/worker-openclaw.json
N24D=/opt/vlab/node-v24.17.0-linux-x64; N24=$N24D/bin/node
DDIR=/etc/systemd/system/$UNIT.service.d
DROPIN=$DDIR/99z-versa-openclaw96.conf; CLOSED=$DDIR/99zz-versa-traffic-closed.conf
P=$I/runtime/versa-runtime-providers
test "$(df --output=avail -B1 $I | tail -1)" -gt $((8*1024**3)) || { log "instance disk has < 8 GB free; refusing"; exit 1; }
test "$(df --output=avail -B1 /srv/vlab-upgrade96-backups | tail -1)" -gt $((10*1024**3)) || { log "backup disk has < 10 GB free; refusing"; exit 1; }
grep -q '"version": "2026.9.1"' $I/runtime/openclaw/package.json || { log "core is not 9.1; refusing"; exit 1; }
test ! -e $DROPIN || { log "$DROPIN already exists; refusing"; exit 1; }
test ! -e $P || { log "$P already exists; refusing"; exit 1; }
test -f $CONVERT && test -f $PROVIDERS_SRC/openclaw.plugin.json
grep -q '"id": *"versa-runtime-providers"' $PROVIDERS_SRC/openclaw.plugin.json
grep -q '"vlab-agent-worker-isolation"' $C || { log "config has no worker plugin entry; not the 9.1 worker-mode config"; exit 1; }
for f in $PKG $FEISHU $CODEX $DEEPSEEK; do test -s $f; done
if [ ! -x $N24 ]; then cp -a /srv/versa-mirror95/runtime/node-v24.17.0-linux-x64 $N24D; chmod -R a+rX $N24D; fi
$N24 --version | tee -a $EV/upgrade.log
sha256sum $PKG $FEISHU $CODEX $DEEPSEEK | tee -a $EV/upgrade.log
(cd $PROVIDERS_SRC && sha256sum $(ls | grep -v '\.test\.mjs$')) > $EV/providers.sha256
log "preflight: core 9.1, no 9.6 drop-in, no providers dir, packages present; instance free $(df --output=avail -h $I | tail -1), backup free $(df --output=avail -h /srv/vlab-upgrade96-backups | tail -1), state $(du -sh $I/state | cut -f1)"
if [ "$DRY" = 1 ]; then
  cp -a $C $EV/openclaw.json; cp -a $WC $EV/worker-openclaw.json
  $N24 $CONVERT --config $EV/openclaw.json --plugin-path $P --worker-config $EV/worker-openclaw.json --disable-mcp voice-memory --dry-run
  log "dry run: companion $(systemctl is-active $COMPANION || true), unit $(systemctl is-active $UNIT || true)"
  rm -rf $EV; exit 0
fi

log "1/11 stop (graceful drain via SIGTERM budget); companion stays stopped"
if systemctl is-active --quiet $COMPANION; then echo active > $B/companion.state; else echo inactive > $B/companion.state; fi
# vlab-cua-node runs the instance core (runtime/openclaw) with Node 22; it is
# recreated on Node 24 by open-traffic96-shared-vlab.sh (cua-node-shared-vlab.sh).
if systemctl is-active --quiet vlab-cua-node; then echo active > $B/cua-node.state; else echo inactive > $B/cua-node.state; fi
bash $SCRIPTS/cua-node-shared-vlab.sh stop
systemctl stop $COMPANION 2>/dev/null || true; systemctl stop $UNIT
log "   gateway down (downtime starts)"; date +%s > $B/down.epoch

log "2/11 backup state, configs, core (worker component kept in place and copied)"
t0=$(date +%s)
tar -C $I -cf - state | zstd -q -T2 -o $B/state.tar.zst
chgrp $U $B/state.tar.zst; chmod 640 $B/state.tar.zst
cp -a $C $B/openclaw.json; cp -a $WC $B/worker-openclaw.json
sha256sum $C $WC > $B/configs-before.sha256
cp -a $I/runtime/production-worker $B/production-worker
# 9.6 migrates the CUA node's own state database on its first start; 9.1 cannot open it.
test -d $I/node-cua/state && cp -a $I/node-cua/state $B/node-cua-state
mv $I/runtime/openclaw $B/openclaw-9.1
log "   backup $(du -h $B/state.tar.zst | cut -f1) in $(( $(date +%s)-t0 ))s"

log "3/11 install core $PKG as a self-contained runtime/openclaw"
PI=$I/upgrade/openclaw96-$TS; mkdir -p $PI
# shallow: openclaw's dependencies go into its own node_modules (verified layout).
(cd $PI && PATH=$N24D/bin:/usr/bin:/bin npm_config_cache=$I/cache/npm $N24D/bin/npm install --install-strategy=shallow --no-audit --no-fund --omit=dev "$PKG") > $EV/npm-install.log 2>&1
mv $PI/node_modules/openclaw $I/runtime/openclaw
CORE=$I/runtime/openclaw; CLI=$CORE/dist/index.js
PV=$($N24 -p "require('$CORE/package.json').version")
log "   version: $($N24 $CLI --version | head -1)"

log "4/11 versa-runtime-providers -> $P (no Worker component)"
mkdir -p $P; rsync -a --checksum --exclude='*.test.mjs' $PROVIDERS_SRC/ $P/
(cd $P && sha256sum $(ls)) | cmp -s - $EV/providers.sha256 || { log "   providers copy mismatch"; exit 1; }
log "   $(grep -o '"version": *"[^"]*"' $P/package.json) files=$(ls $P | tr '\n' ' ')"

log "5/11 Gateway config: official plugin paths -> npm installs, swarm off (worker config untouched)"
OFFICIAL_LIST=$EV/official-plugins.txt $N24 - $C $WC <<'NODE' | tee -a $EV/upgrade.log
const fs = require('node:fs');
const [gateway, worker] = process.argv.slice(2);
// Every official @openclaw/* package loaded by path (in either config) is reinstalled
// from npm at the core's version (9.6's doctor imports each plugin's own doctor
// contract natively). Only the Gateway config is rewritten.
const official = (p) => p.match(/\/node_modules\/@openclaw\/([a-z0-9-]+)$/)?.[1];
const managed = (p) => Boolean(official(p)) || /openclaw-codex-|feishu-project|openclaw-moonshot-provider-/.test(p);
const names = new Set(['feishu', 'codex', 'moonshot-provider', 'deepseek-provider']);
for (const file of [gateway, worker]) for (const p of JSON.parse(fs.readFileSync(file, 'utf8')).plugins?.load?.paths ?? []) if (official(p)) names.add(official(p));
const c = JSON.parse(fs.readFileSync(gateway, 'utf8'));
const before = c.plugins.load.paths;
c.plugins.load.paths = before.filter((p) => !managed(p));
c.tools = c.tools || {}; c.tools.swarm = { ...(c.tools.swarm || {}), enabled: false };
fs.writeFileSync(gateway, JSON.stringify(c, null, 2) + '\n');
console.log(JSON.stringify({ file: gateway, removed: before.length - c.plugins.load.paths.length }));
fs.writeFileSync(process.env.OFFICIAL_LIST, [...names].sort().join('\n') + '\n');
NODE

log "6/11 no-worker conversion (worker config drift listed; voice-memory MCP off = V parity)"
$N24 $CONVERT --config $C --plugin-path $P --worker-config $WC --disable-mcp voice-memory 2>&1 | tee $EV/convert-gateway.log | tee -a $EV/upgrade.log
test "${PIPESTATUS[0]}" = 0
again=$($N24 $CONVERT --config $C --plugin-path $P --disable-mcp voice-memory --dry-run)
log "   re-run: $(echo "$again" | sed -n 2p)"
case "$(echo "$again" | sed -n 2p)" in "0 change"*) ;; *) log "converter not idempotent"; exit 1 ;; esac
sha256sum -c --quiet <(grep worker-openclaw.json $B/configs-before.sha256) || { log "   worker config changed; refusing"; exit 1; }
log "   worker config byte-identical (unused in no-worker mode; kept for rollback)"
chown -R $U: $I/runtime $I/state $I/cache $I/upgrade 2>/dev/null || true

set -a; . $I/secrets.env; set +a
common=(HOME=$I OPENCLAW_HOME=$I OPENCLAW_STATE_DIR=$I/state OPENCLAW_CONFIG_PATH=$C OPENCLAW_WORKSPACE_DIR=$I/workspace
  XDG_CACHE_HOME=$I/cache TMPDIR=$I/tmp CODEX_HOME=$I/codex OPENCLAW_SKIP_CHANNELS=1 OPENCLAW_SKIP_CRON=1 OPENCLAW_GATEWAY_PORT=$PORT
  VLAB_OPENCLAW_AGENT_RUNTIME=$CORE/dist/plugin-sdk/agent-runtime.js npm_config_cache=$I/cache/npm
  PATH=$N24D/bin:/usr/local/bin:/usr/bin:/bin)
cd $I/workspace
log "7/11 plugins @$PV: $(tr '\n' ' ' < $EV/official-plugins.txt)"
t0=$(date +%s)
for spec in $(sed "s#^#@openclaw/#; s#\$#@$PV#" $EV/official-plugins.txt); do
  if runuser --preserve-environment -u $U -- env "${common[@]}" $N24 $CLI plugins install --force --accept-capabilities --acknowledge-install-policy-warning $spec >>$EV/plugins-install.log 2>&1; then
    log "   installed $spec"
  else
    log "   FAILED $spec"; tail -15 $EV/plugins-install.log | sed -E 's/(key|secret|token|password)[^ ]*/\1=<redacted>/Ig' | tee -a $EV/upgrade.log; exit 1
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
overlay $DEEPSEEK @openclaw/deepseek-provider
log "   plugins $(( $(date +%s)-t0 ))s"

log "8/11 config validate"
if ! runuser --preserve-environment -u $U -- env "${common[@]}" $N24 $CLI config validate > $EV/config-validate.log 2>&1; then tail -20 $EV/config-validate.log | tee -a $EV/upgrade.log; exit 1; fi
log "   $(tail -1 $EV/config-validate.log | cut -c1-200)"

log "9/11 systemd drop-ins: Node 24 + 9.6 startup migration/validation receipts; traffic closed"
cat > $DROPIN <<EOF
# versa 9.6 no-worker upgrade $TS (rollback: rollback96-shared-vlab.sh $B)
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
cat > $CLOSED <<EOF
# versa 9.6 upgrade $TS: no channels, no cron until the planned restart and the
# receipt check pass (open-traffic96-shared-vlab.sh removes this file).
[Service]
Environment=OPENCLAW_SKIP_CHANNELS=1
Environment=OPENCLAW_SKIP_CRON=1
EOF
cp -a $DROPIN $CLOSED $B/
mkdir -p $I/state/.validation-receipts; chown $U: $I/state/.validation-receipts
systemctl daemon-reload
systemctl show -p ExecStart $UNIT | cut -c1-300 | tee -a $EV/upgrade.log
systemctl show -p Environment $UNIT | tr ' ' '\n' | grep -E '^OPENCLAW_SKIP_(CHANNELS|CRON)=' | tee -a $EV/upgrade.log

log "10/11 start 9.6 (first start migrates the databases; ~25 min expected)"
systemctl reset-failed $UNIT 2>/dev/null || true
start=$(date +%s)
systemctl start --no-block $UNIT
ready=0
for _ in $(seq 1 3600); do
  if unit_gone $UNIT; then log "unit exited"; journalctl -u $UNIT -n 40 --no-pager -o cat | cut -c1-300 | tee -a $EV/upgrade.log; exit 2; fi
  if journalctl -u $UNIT --since "@$start" --no-pager -o cat 2>/dev/null | grep -c "\[gateway\] ready" >/dev/null; then ready=1; log "   ready after $(( $(date +%s)-start ))s"; break; fi
  sleep 2
done
test $ready = 1 || { log "NOT READY after $(( $(date +%s)-start ))s"; exit 3; }
date +%s > $B/first-ready.epoch

log "11/11 traffic stays closed; companion stays stopped (was $(cat $B/companion.state))"
log "next: planned-restart96-shared-vlab.sh, post-restart-check.mjs, open-traffic96-shared-vlab.sh $B"
log "done; backup and evidence in $B"
