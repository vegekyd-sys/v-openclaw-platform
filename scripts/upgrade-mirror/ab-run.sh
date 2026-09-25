#!/usr/bin/env bash
# Controlled A/B from the same pre-upgrade state: rollback -> 9.1 bench ->
# upgrade (final package) -> 9.5 bench.   ab-run.sh <core95.tgz> <feishu.tgz> <codex.tgz> <worker-dir>
set -uo pipefail
R=/srv/versa-mirror95
echo "== rollback to 9.1 $(date +%T)"; bash $R/scripts/rollback91-final.sh 2>&1 | grep -E "configs|schema|ready|rollback total|NOT READY|exited"
echo "== 9.1 bench $(date +%T)"; bash $R/scripts/bench-reps.sh ab91 /opt/vlab/node-v22.23.1-linux-x64/bin/node
echo "== upgrade to 9.5 $(date +%T)"; bash $R/scripts/upgrade95-final.sh "$@" 2>&1 | grep -E "backup|installed|verified|schema|findings|ready|NOT READY|FAILED|mismatch"
echo "== 9.5 bench $(date +%T)"; bash $R/scripts/bench-reps.sh ab95 $R/runtime/node-v24.17.0-linux-x64/bin/node
echo "== end $(date +%T)"
