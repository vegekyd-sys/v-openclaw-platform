#!/usr/bin/env bash
# Production-profile start for the mirror. $1 = prod91 | 95
# Both versions run with production V's non-secret switches, heap and limits
# (read from V on 2026-09-24); 95 adds only its own new variables. The mirror's
# CPU/memory caps (4 cores, 12G) are the same for both.
set -euo pipefail
test "$(id -u)" = 0
R=/srv/versa-mirror95; U=versa-rehearsal; UNIT=versa-mirror95-gateway; PORT=25096; P=$R/prod91
which=${1:?prod91 or 95}
PROD_ENV=(--setenv=OPENCLAW_DB91_INTEGRITY_ENABLE=1 --setenv=OPENCLAW_DB91_PROVENANCE_ENABLE=1
  --setenv=OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE=1 --setenv=OPENCLAW_DB91_MAINTENANCE_ENABLE=1
  --setenv=OPENCLAW_DB91_READ_AHEAD_ENABLE=1 --setenv=OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE=1
  --setenv=OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE=1 --setenv=OPENCLAW_DB91_INTEGRITY_STATE_ROOT=$R/state
  --setenv=OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS=900000
  --setenv=OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP=1 --setenv=OPENCLAW_CRON_SHARED_POLICY=$P/cron-shared-policy.json
  --setenv=OPENCLAW_EXTENSION_COMMAND_TIMEOUT_MS=180000 --setenv=OPENCLAW_PERSISTENT_CDP_CONNECT_TIMEOUT_MS=60000
  --setenv=OPENCLAW_FIRSTTEXT_WORKER_PHASES=1 --setenv=OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE=1
  --setenv=OPENCLAW_SESSION_HOTSET_ENABLED=1 --setenv=OPENCLAW_SESSION_HOTSET_TTL_MS=180000
  --setenv=OPENCLAW_SESSION_HOTSET_REPORT=$R/state/experiments/agent-worker-isolation-v1/last-prune.json
  --setenv=VLAB_FEISHU_STEER_ENABLED=1)
case "$which" in
  prod91) NODE=/opt/vlab/node-v22.23.1-linux-x64/bin/node; CORE=${VERSA_CORE_DIR:-$P/core/node_modules/openclaw}; EXTRA=() ;;
  95) NODE=$R/runtime/node-v24.17.0-linux-x64/bin/node; CORE=$(readlink -f $R/runtime/openclaw95/node_modules/openclaw)
      EXTRA=(--setenv=OPENCLAW_AGENT_DB_VALIDATION_RECEIPT_DIR=$R/state/.validation-receipts
             --setenv=OPENCLAW_AGENT_DB_VALIDATION_EPOCH=$(cat /proc/sys/kernel/random/uuid)
             --setenv=OPENCLAW_SQLITE_STARTUP_INPLACE_READONLY=1 --setenv=OPENCLAW_SQLITE_INTEGRITY_READ_AHEAD=1
             --setenv=OPENCLAW_AGENT_DB_INTEGRITY_MAX_AGE_HOURS=24 --setenv=OPENCLAW_SQLITE_CLOSE_ON_SIGNAL=1
             --setenv=OPENCLAW_SESSION_ROW_MATERIALIZE_COALESCE_MS=1000
             --setenv=OPENCLAW_STARTUP_MIGRATION_LEASE_TTL_MS=7200000
             --setenv=OPENCLAW_STARTUP_MIGRATION_EXTERNAL_BACKUP=$R/rollback-state-before-95.tar.zst) ;;
  *) echo "unknown $which"; exit 1 ;;
esac
# A/B: VERSA_DROP_ENV=NAME[,NAME] leaves those variables out of this start.
# Profiling: VERSA_NODE_FLAGS="--cpu-prof --cpu-prof-dir=..." (children inherit execArgv).
if [ -n "${VERSA_DROP_ENV:-}" ]; then
  keep=(); for a in "${PROD_ENV[@]}" "${EXTRA[@]}"; do
    drop=0; for n in ${VERSA_DROP_ENV//,/ }; do [[ "$a" == --setenv=$n=* ]] && drop=1; done
    [ $drop = 1 ] || keep+=("$a")
  done
  PROD_ENV=("${keep[@]}"); EXTRA=()
fi
test -x "$NODE"; test -f "$CORE/dist/index.js"
systemctl is-active --quiet $UNIT && { echo "$UNIT already active"; exit 1; }
systemctl reset-failed $UNIT 2>/dev/null || true
rm -rf $R/tmp/openclaw-plugin-build-* $R/tmp/openclaw-model-catalog-* $R/tmp/vlab-worker-*
mkdir -p $R/state/experiments/agent-worker-isolation-v1 && chown $U: $R/state/experiments $R/state/experiments/agent-worker-isolation-v1
C=$R/state/shared-vlab-20260909-v3/openclaw.json
systemd-run --unit=$UNIT --collect --uid=$U --gid=$U --working-directory=$R/workspace \
  -p MemoryMax=12G -p CPUQuota=400% -p Nice=5 -p TasksMax=4096 -p LimitNOFILE=1048576 -p EnvironmentFile=$R/secrets.env \
  --setenv=PATH="$(dirname $NODE):/usr/local/bin:/usr/bin:/bin" --setenv=HOME=$R --setenv=USER=$U --setenv=LOGNAME=$U \
  --setenv=OPENCLAW_HOME=$R --setenv=OPENCLAW_STATE_DIR=$R/state --setenv=OPENCLAW_CONFIG_PATH=$C \
  --setenv=OPENCLAW_WORKSPACE_DIR=$R/workspace --setenv=OPENCLAW_GATEWAY_PORT=$PORT --setenv=CODEX_HOME=$R/codex \
  --setenv=XDG_CACHE_HOME=$R/cache --setenv=TMPDIR=$R/tmp --setenv=VLAB_OPENCLAW_AGENT_RUNTIME=$CORE/dist/plugin-sdk/agent-runtime.js \
  --setenv=npm_config_cache=$R/cache/npm --setenv=npm_config_prefix=$R/runtime/user-npm \
  "${PROD_ENV[@]}" "${EXTRA[@]}" ${VERSA_NODE_OPTIONS:+--setenv=NODE_OPTIONS=$VERSA_NODE_OPTIONS} \
  $NODE --max-old-space-size=12288 ${VERSA_NODE_FLAGS:-} $CORE/dist/index.js gateway --port $PORT
start=$(date +%s)
for _ in $(seq 1 3600); do
  if ! systemctl is-active --quiet $UNIT; then echo "unit exited"; journalctl -u $UNIT -n 40 --no-pager; exit 2; fi
  if ss -ltn | awk "{print \$4}" | grep -c ":$PORT\$" >/dev/null 2>&1; then
    if VERSA_UNIT=$UNIT.service runuser --preserve-environment -u $U -- $NODE $R/scripts/probe.mjs > $R/evidence/probe-$which.json 2> $R/evidence/probe-$which.stderr; then
      echo "ready version=$which startSeconds=$(( $(date +%s) - start ))"; cut -c1-400 $R/evidence/probe-$which.json; exit 0
    fi
  fi
  sleep 1
done
echo "NOT READY after $(( $(date +%s) - start ))s"; exit 3
