#!/usr/bin/env bash
# Replace only the 9.5 core on the mirror (state, plugins, config unchanged).
#   swap-core95.sh <core.tgz>
set -euo pipefail
R=/srv/versa-mirror95; PKG=${1:?core tgz}; N=$R/runtime/node-v24.17.0-linux-x64/bin
systemctl stop versa-mirror95-gateway 2>/dev/null || true
sleep 5
rm -rf $R/runtime/openclaw95 && mkdir -p $R/runtime/openclaw95
(cd $R/runtime/openclaw95 && PATH=$N:/usr/bin:/bin npm_config_cache=$R/cache/npm $N/npm install --no-audit --no-fund --omit=dev $PKG) > $R/evidence/swap-core95.log 2>&1
chown -R versa-rehearsal: $R/runtime/openclaw95
$N/node $R/runtime/openclaw95/node_modules/openclaw/dist/index.js --version
