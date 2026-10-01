#!/usr/bin/env bash
# Planned restart after the upgrade (production profile; inspector for ELD/heap sampling).
set -uo pipefail
R=/srv/versa-mirror95; UNIT=versa-mirror95-gateway
t0=$(date +%s); echo "$(date --iso-8601=seconds) stop"
systemctl stop $UNIT; t1=$(date +%s); echo "$(date --iso-8601=seconds) stopped in $((t1-t0))s"
VERSA_NODE_FLAGS="--inspect=127.0.0.1:0" bash $R/scripts/start-gateway-prod.sh 95 2>&1 | cut -c1-300
t2=$(date +%s); echo "$(date --iso-8601=seconds) READY_EPOCH=$t2 start $((t2-t1))s downtime $((t2-t0))s"
