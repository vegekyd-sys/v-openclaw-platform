#!/usr/bin/env bash
# Mirror-only: restore the 9.1 state, then run the 9.6 no-worker upgrade.
#   reset-and-upgrade96-noworker.sh [pkg-dir]   (default $R/pkgs/final96nw)
# Disk-aware variant of reset-and-upgrade96.sh: the current (disposable) state
# is deleted before the 9.1 archive is extracted, so the host never holds two
# full state trees at once (27G + 27G does not fit next to the shared VLab).
# Leases copied from another lab instance (dead owners, paths outside this
# mirror) are dropped; production leases all point inside its own state dir.
set -euo pipefail
test "$(id -u)" = 0
R=/srv/versa-mirror95; U=versa-rehearsal; UNIT=versa-mirror95-gateway
P=${1:-$R/pkgs/final96nw}
CORE_TGZ=$(ls $P/versa96-*.tgz | head -1)
test -f "$CORE_TGZ" && test -f $P/openclaw-feishu-2026.9.6.tgz && test -f $P/openclaw-codex-2026.9.6.tgz && test -d $P/versa-runtime-providers
(cd $P && sha256sum -c --quiet SHA256SUMS) && echo "packages match SHA256SUMS"
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"; }
log "reset: stop, drop current state"
systemctl stop $UNIT 2>/dev/null || true
systemctl reset-failed $UNIT 2>/dev/null || true
rm -rf $R/state.failed96 $R/state
log "reset: extract 9.1 state"
zstd -q -dc $R/rollback-state-before-95.tar.zst | tar -C $R -xf -
C=$R/state/shared-vlab-20260909-v3/openclaw.json; WC=$R/state/shared-vlab-20260909-v3/worker-openclaw.json
cp -a $R/rollback-openclaw.json $C; cp -a $R/rollback-worker-openclaw.json $WC
cp -a $R/rollback-makaron-image-index.js $R/capability-alignment-20260911/plugin-sources/home/openclaw/makaron-openclaw/.openclaw-local/workspace/plugins/makaron-image/index.js
sha256sum -c --quiet $R/rollback-configs.sha256 && log "configs restored"
sqlite3 $R/state/state/openclaw.sqlite "DELETE FROM agent_database_leases WHERE path NOT LIKE '$R/%' AND path LIKE '/%'; SELECT 'leases left: '||count(*) FROM agent_database_leases;"
chown -R $U: $R/state
df -h /srv | tail -1
bash $R/scripts/upgrade96-noworker.sh "$CORE_TGZ" $P/openclaw-feishu-2026.9.6.tgz $P/openclaw-codex-2026.9.6.tgz $P/versa-runtime-providers
