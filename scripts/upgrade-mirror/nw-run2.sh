#!/usr/bin/env bash
# Run 2: phase A (warm + functional) then phase B (ladder, burst, soak).
#   nw-run2.sh <readyEpoch> <outDir> [soakMinutes]
set -uo pipefail
R=/srv/versa-mirror95
bash $R/scripts/nw-phase-a.sh "$1" "$2" > "$2/phase-a.log" 2>&1
echo "$(date +%T) phase A exit $?" >> "$2/phase-a.log"
sleep 60
bash $R/scripts/nw-phase-b.sh "$2" "${3:-62}" > "$2/phase-b.log" 2>&1
