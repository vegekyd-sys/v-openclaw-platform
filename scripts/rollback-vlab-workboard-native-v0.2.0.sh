#!/usr/bin/env bash
set -euo pipefail

backup=${1:-}
release_root=/srv/vlab/releases/nightshift-workboard
gateway_config=/srv/vlab/state/openclaw.json
worker_config=/srv/vlab/experiments/agent-worker-isolation-v1/worker-openclaw.json
gateway_service=openclaw-vlab-gateway.service
workboard_service=nightshift-vlab-workboard.service
workboard_unit=/etc/systemd/system/nightshift-vlab-workboard.service
capacity_dropin=/etc/systemd/system/openclaw-vlab-gateway.service.d/zz-worker-capacity-45.conf

if [[ ${EUID} -ne 0 || ! "$backup" =~ ^/srv/vlab/backups/workboard-native-dispatch-v0\.2\.0/[0-9TZ]+$ || ! -d "$backup" ]]; then
  echo "Usage: sudo $0 /srv/vlab/backups/workboard-native-dispatch-v0.2.0/<timestamp>" >&2
  exit 2
fi

cron_id=$(/opt/vlab/node/bin/node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1]));process.stdout.write(x.id??x.job?.id??"")}catch{}' "$backup/cron.add.json")
if [[ -n "$cron_id" ]]; then
  sudo -u vlab env HOME=/srv/vlab OPENCLAW_HOME=/srv/vlab OPENCLAW_STATE_DIR=/srv/vlab/state \
    OPENCLAW_CONFIG_PATH="$gateway_config" OPENCLAW_WORKSPACE_DIR=/srv/vlab/workspace \
    OPENCLAW_GATEWAY_PORT=23793 TMPDIR=/srv/vlab/tmp \
    /opt/vlab/node/bin/node /opt/vlab/current/node_modules/openclaw/dist/index.js cron remove "$cron_id" >/dev/null || true
fi

systemctl disable --now "$workboard_service" 2>/dev/null || true
cp -a "$backup/openclaw.json.before" "$gateway_config"
cp -a "$backup/worker-openclaw.json.before" "$worker_config"
runtime_before=$(find "$backup" -maxdepth 1 -type f -name 'runtime-api-*.js.before' -print)
runtime_target=/opt/vlab/current/node_modules/openclaw/dist/$(basename "${runtime_before%.before}")
cp -a "$runtime_before" "$runtime_target"

if [[ -f "$backup/capacity.conf.before" ]]; then
  cp -a "$backup/capacity.conf.before" "$capacity_dropin"
else
  rm -f -- "$capacity_dropin"
fi
if [[ -f "$backup/workboard.service.before" ]]; then
  cp -a "$backup/workboard.service.before" "$workboard_unit"
else
  rm -f -- "$workboard_unit"
fi
if [[ -s "$backup/current.before" ]]; then
  previous=$(cat "$backup/current.before")
  [[ "$previous" =~ ^/srv/vlab/releases/nightshift-workboard/[A-Za-z0-9._-]+$ ]]
  ln -sfn "$previous" "$release_root/current"
else
  rm -f -- "$release_root/current"
fi

systemctl daemon-reload
systemctl restart "$gateway_service"
if [[ -f "$backup/workboard.service.before" ]]; then systemctl enable --now "$workboard_service"; fi
systemctl is-active --quiet "$gateway_service"
echo "rolled_back=$backup"
