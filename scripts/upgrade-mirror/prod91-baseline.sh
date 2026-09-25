#!/usr/bin/env bash
# Production 9.1 (bytes identical to V) under the production profile: steady ladder x2.
set -uo pipefail
R=/srv/versa-mirror95; N=/opt/vlab/node-v22.23.1-linux-x64/bin/node
log() { echo "$(date +%T) $*"; }
systemctl stop versa-mirror95-gateway; sleep 3
bash $R/scripts/start-gateway-prod.sh prod91 | grep -o "ready version=prod91 startSeconds=[0-9]*"
bash $R/scripts/steady-bench.sh b91a $N
log "second ladder"; bash $R/scripts/mirror-bench.sh b91b $N
log done
