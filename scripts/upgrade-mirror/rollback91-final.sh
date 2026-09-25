#!/usr/bin/env bash
# Roll the mirror back from the 9.5 rehearsal to 9.1 as production would:
# stop, restore the pre-upgrade state archive and configs, start 9.1 with the
# production profile.
set -euo pipefail
test "$(id -u)" = 0
R=/srv/versa-mirror95; U=versa-rehearsal; UNIT=versa-mirror95-gateway
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"; }
test -f $R/rollback-state-before-95.tar.zst
t0=$(date +%s)
systemctl stop $UNIT 2>/dev/null || true
mv $R/state $R/state.after-95-$(date +%Y%m%dT%H%M%S)
zstd -q -dc $R/rollback-state-before-95.tar.zst | tar -C $R -xf -
C=$R/state/shared-vlab-20260909-v3/openclaw.json; WC=$R/state/shared-vlab-20260909-v3/worker-openclaw.json
cp -a $R/rollback-openclaw.json $C; cp -a $R/rollback-worker-openclaw.json $WC
cp -a $R/rollback-makaron-image-index.js $R/capability-alignment-20260911/plugin-sources/home/openclaw/makaron-openclaw/.openclaw-local/workspace/plugins/makaron-image/index.js
sha256sum -c --quiet $R/rollback-configs.sha256 && log "configs byte-identical to pre-upgrade"
chown -R $U: $R/state
/opt/vlab/node-v22.23.1-linux-x64/bin/node --experimental-sqlite -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log("state schema "+db.prepare("PRAGMA user_version").get().user_version)' $R/state/state/openclaw.sqlite 2>/dev/null
bash $R/scripts/start-gateway-prod.sh prod91
log "rollback total $(( $(date +%s)-t0 ))s"
