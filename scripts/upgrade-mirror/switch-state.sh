#!/usr/bin/env bash
# Fast A/B switch on the mirror without re-running the upgrade:
#   to95 : park the 9.1 state, bring back the migrated 9.5 state (plugins included)
#   to91 : the reverse
set -euo pipefail
test "$(id -u)" = 0
R=/srv/versa-mirror95; U=versa-rehearsal; UNIT=versa-mirror95-gateway
MI=$R/capability-alignment-20260911/plugin-sources/home/openclaw/makaron-openclaw/.openclaw-local/workspace/plugins/makaron-image/index.js
target=${1:?to95|to91}
systemctl stop $UNIT 2>/dev/null || true
sleep 3
case "$target" in
  to95)
    test -d $R/state.parked-95
    test ! -e $R/state.parked-91
    mv $R/state $R/state.parked-91
    mv $R/state.parked-95 $R/state
    sed -i "s#$R/runtime/openclaw/dist/plugin-sdk/#$R/runtime/openclaw95/node_modules/openclaw/dist/plugin-sdk/#" $MI
    bash $R/scripts/start-gateway.sh 95 ;;
  to91)
    test -d $R/state.parked-91
    test ! -e $R/state.parked-95
    mv $R/state $R/state.parked-95
    mv $R/state.parked-91 $R/state
    sed -i "s#$R/runtime/openclaw95/node_modules/openclaw/dist/plugin-sdk/#$R/runtime/openclaw/dist/plugin-sdk/#" $MI
    bash $R/scripts/start-gateway.sh 91 ;;
  *) echo "unknown $target"; exit 1 ;;
esac
