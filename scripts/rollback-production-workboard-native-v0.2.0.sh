#!/usr/bin/env bash
set -euo pipefail

backup=${1:-}
release_root=/home/openclaw/releases/nightshift-workboard
gateway_config=/home/openclaw/.openclaw/openclaw.json
worker_config=/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
gateway_service=openclaw-gateway.service
workboard_service=nightshift-workboard.service
workboard_unit=/etc/systemd/system/nightshift-workboard.service

if [[ ${EUID} -ne 0 || ! "$backup" =~ ^/home/openclaw/\.openclaw/backups/workboard-native-dispatch-v0\.2\.0/[0-9TZ]+$ || ! -d "$backup" ]]; then
  echo "Usage: sudo $0 /home/openclaw/.openclaw/backups/workboard-native-dispatch-v0.2.0/<timestamp>" >&2
  exit 2
fi
cron_id=$(/opt/node-v22.23.1/bin/node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1]));process.stdout.write(x.id??x.job?.id??"")}catch{}' "$backup/cron.add.json")
if [[ -n "$cron_id" ]]; then
  sudo -u openclaw env HOME=/home/openclaw OPENCLAW_HOME=/home/openclaw \
    OPENCLAW_STATE_DIR=/home/openclaw/.openclaw OPENCLAW_CONFIG_PATH="$gateway_config" \
    /opt/node-v22.23.1/bin/node /opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js cron remove "$cron_id" >/dev/null || true
fi
systemctl stop "$workboard_service" || true
cp -a "$backup/openclaw.json.before" "$gateway_config"
cp -a "$backup/worker-openclaw.json.before" "$worker_config"
runtime_before=$(find "$backup" -maxdepth 1 -type f -name 'runtime-api-*.js.before' -print)
runtime_target=/opt/openclaw-2026.7.1/node_modules/openclaw/dist/$(basename "${runtime_before%.before}")
cp -a "$runtime_before" "$runtime_target"
cp -a "$backup/workboard.service.before" "$workboard_unit"
previous=$(cat "$backup/current.before")
[[ "$previous" =~ ^/home/openclaw/releases/nightshift-workboard/[A-Za-z0-9._-]+$ ]]
ln -sfn "$previous" "$release_root/current"
ln -sfn "$previous/scripts/nightshiftctl.mjs" /home/openclaw/.local/bin/nightshiftctl
systemctl daemon-reload
systemctl restart "$gateway_service"
systemctl enable --now "$workboard_service"
systemctl is-active --quiet "$gateway_service"
curl -fsS --max-time 10 http://127.0.0.1:24879/api/health >/dev/null
echo "rolled_back=$backup"
