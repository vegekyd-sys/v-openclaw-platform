# Daily V 首字 report

V is reachable only from Tianyi's Mac (`ssh v`), so the daily job runs there under launchd:

- `install.sh [report.mjs]` copies the job to `~/.cache/v-firsttext/daily-job/` and loads
  `~/Library/LaunchAgents/com.vlab.firsttext-daily.plist` (00:20 local time daily; a slot
  missed while the Mac sleeps runs once on wake). Pass the newest
  `scripts/firsttext-e2e-report.mjs` (the one with the model/overhead split) if this branch's
  copy is older.
- `run.sh [YYYY-MM-DD]` (default: yesterday, Asia/Shanghai) pipes the report script to V's
  `/tmp`, runs it read-only with `sudo -n` over that CST day of journald, and writes
  `~/.cache/v-firsttext/daily/<day>.json`, `<day>.md` and `latest.md`. Only aggregate timings
  leave V; no message text or message ids.
- `format.mjs --dir <dir> --day <day>` renders the Markdown: the day's P50/P95/P99/Max for
  首字, first visible, overhead and its segments, per harness, the five slowest, change
  against the previous day, and a 14-day trend table.

The project thread "V首字每日报告" reads `latest.md` each morning and posts it. Nothing on V
is installed or changed; uninstall with
`launchctl bootout gui/$(id -u)/com.vlab.firsttext-daily && rm ~/Library/LaunchAgents/com.vlab.firsttext-daily.plist`.
