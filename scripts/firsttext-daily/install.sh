#!/bin/bash
# Install the daily V 首字 report job on this Mac (needs a working `ssh v` with sudo -n on V).
#
#   install.sh [path/to/firsttext-e2e-report.mjs]
#
# Copies run.sh, format.mjs and the report script to ~/.cache/v-firsttext/daily-job/,
# writes ~/Library/LaunchAgents/com.vlab.firsttext-daily.plist and loads it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
JOB="$HOME/.cache/v-firsttext/daily-job"
OUT="$HOME/.cache/v-firsttext/daily"
REPORT="${1:-$HERE/../firsttext-e2e-report.mjs}"
NODE_DIR="$(dirname "$(command -v node)")"
mkdir -p "$JOB" "$OUT" "$HOME/Library/LaunchAgents"
cp "$HERE/run.sh" "$HERE/format.mjs" "$HERE/export-records.mjs" "$JOB/"
cp "$REPORT" "$JOB/firsttext-e2e-report.mjs"
chmod +x "$JOB/run.sh"
PLIST="$HOME/Library/LaunchAgents/com.vlab.firsttext-daily.plist"
sed -e "s#__JOB_DIR__#$JOB#g" -e "s#__OUT_DIR__#$OUT#g" -e "s#__PATH__#$NODE_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin#g" \
  "$HERE/com.vlab.firsttext-daily.plist" >"$PLIST"
launchctl bootout "gui/$(id -u)/com.vlab.firsttext-daily" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: $PLIST -> $JOB/run.sh, reports in $OUT (Mac timezone: $(date +%Z))"
