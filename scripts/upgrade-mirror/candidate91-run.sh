#!/usr/bin/env bash
# Source-built 9.1 candidate on the mirror, measured exactly like production 9.1:
# install package -> start with the production profile (same state, config,
# worker and Feishu plugins as prod91) -> warm -> acceptance -> c1x3 c5x3 c15x2.
#   candidate91-run.sh <package.tgz> <label> [feishu-plugin.tgz]
# With a Feishu package the run also swaps prod91's Feishu plugin for it and
# restores the config path afterwards.
set -uo pipefail
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway; N=/opt/vlab/node-v22.23.1-linux-x64/bin/node
PKG=${1:?package}; LABEL=${2:?label}; FEISHU=${3:-}
C=$R/state/shared-vlab-20260909-v3/openclaw.json; PROD_FEISHU=$R/prod91/feishu-project/node_modules/@openclaw/feishu
MI=$R/capability-alignment-20260911/plugin-sources/home/openclaw/makaron-openclaw/.openclaw-local/workspace/plugins/makaron-image/index.js
D=$R/candidates/$LABEL
log() { echo "$(date +%T) $*"; }
test -f $R/state/shared-vlab-20260909-v3/openclaw.json && grep -q prod91/worker $R/state/shared-vlab-20260909-v3/openclaw.json || { log "state is not the 9.1 production state"; exit 1; }
systemctl stop $UNIT 2>/dev/null; sleep 3
rm -rf $D; mkdir -p $D
# "prod91" measures production's own 9.1 core with the same procedure.
if [ "$PKG" != prod91 ]; then
(cd $D && PATH=$(dirname $N):/usr/bin:/bin npm_config_cache=$R/cache/npm $R/runtime/node-v24.17.0-linux-x64/bin/npm install --no-audit --no-fund --omit=dev "$PKG") > $R/evidence/npm-$LABEL.log 2>&1 || { log "npm install failed"; tail -5 $R/evidence/npm-$LABEL.log; exit 1; }
fi
if [ -n "$FEISHU" ]; then
  mkdir -p $D/feishu-project
  (cd $D/feishu-project && echo '{"private":true}' > package.json && PATH=$(dirname $N):/usr/bin:/bin npm_config_cache=$R/cache/npm $R/runtime/node-v24.17.0-linux-x64/bin/npm install --no-audit --no-fund --omit=dev --omit=peer "$FEISHU") >> $R/evidence/npm-$LABEL.log 2>&1 || { log "feishu install failed"; exit 1; }
  CAND_FEISHU=$D/feishu-project/node_modules/@openclaw/feishu
  sed -i "s#$PROD_FEISHU#$CAND_FEISHU#" $C
  # Stop first: a live config edit would hot-reload the running Gateway.
  trap 'systemctl stop $UNIT; sed -i "s#$CAND_FEISHU#$PROD_FEISHU#" $C' EXIT
  grep -q "$CAND_FEISHU" $C && log "feishu plugin -> $CAND_FEISHU"
fi
chown -R versa-rehearsal: $D
CORE=$D/node_modules/openclaw; [ "$PKG" = prod91 ] && CORE=$R/prod91/core/node_modules/openclaw
log "version $($N $CORE/dist/index.js --version | head -1)"
sed -i -E "s#$R/[a-z0-9/_.-]*node_modules/openclaw/dist/plugin-sdk/#$CORE/dist/plugin-sdk/#" $MI
VERSA_CORE_DIR=$CORE bash $R/scripts/start-gateway-prod.sh prod91 | grep -oE "ready version=prod91 startSeconds=[0-9]+|NOT READY.*|unit exited"
P=$(systemctl show -p MainPID --value $UNIT)
while [ $(ps -o etimes= -p $P | tr -d " ") -lt 300 ]; do sleep 10; done
cd $R/workspace
b() { VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/bench.mjs mirror $1 $2 $R/evidence/bench 2>&1 | tail -1 | grep -oE "\"(label|finals|errors|firstTextMs|totalMs|peakWorkers)\":(\{[^}]*\}|[^,]*)" | tr "\n" " "; echo; }
b 10 $LABEL-warm1; sleep 30; b 10 $LABEL-warm2; sleep 30
VERSA_UNIT=$UNIT.service runuser --preserve-environment -u versa-rehearsal -- $N $R/scripts/accept.mjs $LABEL $R/evidence/accept 2>&1 | tail -13
for i in 1 2 3; do b 1 $LABEL-c1-$i; sleep 20; done
for i in 1 2 3; do b 5 $LABEL-c5-$i; sleep 30; done
for i in 1 2; do b 15 $LABEL-c15-$i; sleep 45; done
log done
