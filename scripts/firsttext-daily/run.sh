#!/bin/bash
# Daily V 首字 report, run on the Mac that can `ssh v` (launchd, see README.md).
#
#   run.sh [YYYY-MM-DD]     default: yesterday in Asia/Shanghai
#
# Copies firsttext-e2e-report.mjs to V's /tmp, runs it read-only over that CST
# calendar day of journald, keeps the JSON summary under $OUT, and renders
# $OUT/<day>.md (plus latest.md) with the trend over earlier days, and
# $OUT/records-<day>.jsonl.gz with one line of timings per message (export-records.mjs).
# Reads only aggregate timings; no message text leaves V.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${FIRSTTEXT_DAILY_DIR:-$HOME/.cache/v-firsttext/daily}"
HOST="${FIRSTTEXT_DAILY_HOST:-v}"
NODE="${NODE:-$(command -v node)}"
# the installed copy keeps the report script next to run.sh; in the repo it is one level up
REPORT="${FIRSTTEXT_REPORT:-$HERE/firsttext-e2e-report.mjs}"
[ -f "$REPORT" ] || REPORT="$HERE/../firsttext-e2e-report.mjs"
mkdir -p "$OUT"

day="${1:-$(TZ=Asia/Shanghai date -v-1d +%F 2>/dev/null || TZ=Asia/Shanghai date -d yesterday +%F)}"
# CST midnight expressed in UTC so V's own timezone does not matter
start_utc="$("$NODE" -e 'const d=new Date(process.argv[1]+"T00:00:00+08:00");console.log(d.toISOString().slice(0,19).replace("T"," "))' "$day")"
end_utc="$("$NODE" -e 'const d=new Date(new Date(process.argv[1]+"T00:00:00+08:00").getTime()+864e5);console.log(d.toISOString().slice(0,19).replace("T"," "))' "$day")"

log="$OUT/run.log"
echo "$(date -u +%FT%TZ) start day=$day window=[$start_utc, $end_utc) UTC" >>"$log"

ssh -o BatchMode=yes -o ConnectTimeout=20 "$HOST" 'cat > /tmp/firsttext-e2e-report.mjs' <"$REPORT"
tmp="$OUT/.$day.json.tmp"
ssh -o BatchMode=yes -o ConnectTimeout=20 "$HOST" \
  "sudo -n node /tmp/firsttext-e2e-report.mjs --since '$start_utc UTC' --until '$end_utc UTC' --json" >"$tmp"
"$NODE" -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$tmp"
mv "$tmp" "$OUT/$day.json"

# per-message timings (no text) for breaking down the tail; gzip keeps it small enough to relay
# (a failed export must not cost the day's report)
if ssh -o BatchMode=yes -o ConnectTimeout=20 "$HOST" 'cat > /tmp/firsttext-export-records.mjs' <"$HERE/export-records.mjs" &&
  ssh -o BatchMode=yes -o ConnectTimeout=20 "$HOST" \
    "sudo -n node /tmp/firsttext-export-records.mjs --since '$start_utc UTC' --until '$end_utc UTC'" | gzip -9 >"$OUT/.records-$day.jsonl.gz.tmp"; then
  mv "$OUT/.records-$day.jsonl.gz.tmp" "$OUT/records-$day.jsonl.gz"
else
  echo "$(date -u +%FT%TZ) records export failed day=$day" >>"$log"
fi

"$NODE" "$HERE/format.mjs" --dir "$OUT" --day "$day" >"$OUT/$day.md"
cp "$OUT/$day.md" "$OUT/latest.md"
echo "$(date -u +%FT%TZ) done day=$day" >>"$log"
