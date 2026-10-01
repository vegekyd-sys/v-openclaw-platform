#!/usr/bin/env bash
# Mirror-only: restore the 9.1 state, drop agent DB leases copied from another
# lab instance (dead owners, paths outside this mirror; production leases all
# point inside its own state dir), then rerun the 9.6 upgrade.
set -euo pipefail
R=/srv/versa-mirror95; U=versa-rehearsal; UNIT=versa-mirror95-gateway
systemctl stop $UNIT 2>/dev/null || true
systemctl reset-failed $UNIT 2>/dev/null || true
rm -rf $R/state.failed96; mv $R/state $R/state.failed96
zstd -q -dc $R/rollback-state-before-95.tar.zst | tar -C $R -xf -
C=$R/state/shared-vlab-20260909-v3/openclaw.json; WC=$R/state/shared-vlab-20260909-v3/worker-openclaw.json
cp -a $R/rollback-openclaw.json $C; cp -a $R/rollback-worker-openclaw.json $WC
cp -a $R/rollback-makaron-image-index.js $R/capability-alignment-20260911/plugin-sources/home/openclaw/makaron-openclaw/.openclaw-local/workspace/plugins/makaron-image/index.js
sha256sum -c --quiet $R/rollback-configs.sha256 && echo "configs restored"
rm -rf $R/state.failed96
sqlite3 $R/state/state/openclaw.sqlite "DELETE FROM agent_database_leases WHERE path NOT LIKE '$R/%' AND path LIKE '/%'; SELECT 'leases left: '||count(*) FROM agent_database_leases;"
chown -R $U: $R/state
df -h /srv | tail -1
P=$R/pkgs/final96
bash $R/scripts/upgrade95-final.sh $P/versa96-<hash>.tgz $P/openclaw-feishu-2026.9.6.tgz $P/openclaw-codex-2026.9.6.tgz $P/worker
