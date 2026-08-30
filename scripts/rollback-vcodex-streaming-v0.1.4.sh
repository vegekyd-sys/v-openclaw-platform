#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <predeploy-backup-dir>" >&2
  exit 2
fi

BACKUP_ROOT=$1
OPENCLAW_STATE=/home/openclaw/.openclaw
DROPIN=/etc/systemd/system/openclaw-gateway.service.d/vcodex-streaming-v0.1.4.conf
BUNDLE_PRIMARY=${OPENCLAW_STATE}/npm/projects/openclaw-feishu-dc69f44688/node_modules/@openclaw/feishu/dist/monitor.account-Dr7do33p.js
BUNDLE_GENERATION=${OPENCLAW_STATE}/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-c74b020f77637f52/node_modules/@openclaw/feishu/dist/monitor.account-Dr7do33p.js

test -f "${BACKUP_ROOT}/openclaw.json.before"
test -f "${BACKUP_ROOT}/worker-openclaw.json.before"
test -f "${BACKUP_ROOT}/monitor.account.primary.before.js"
test -f "${BACKUP_ROOT}/monitor.account.generation.before.js"

install -o openclaw -g openclaw -m 0600 "${BACKUP_ROOT}/openclaw.json.before" "${OPENCLAW_STATE}/openclaw.json"
install -o openclaw -g openclaw -m 0600 "${BACKUP_ROOT}/worker-openclaw.json.before" "${OPENCLAW_STATE}/experiments/agent-worker-isolation-v1/worker-openclaw.json"
install -o openclaw -g openclaw -m 0644 "${BACKUP_ROOT}/monitor.account.primary.before.js" "${BUNDLE_PRIMARY}"
install -o openclaw -g openclaw -m 0644 "${BACKUP_ROOT}/monitor.account.generation.before.js" "${BUNDLE_GENERATION}"

if [[ -f "${BACKUP_ROOT}/systemd-dropins/vcodex-streaming-v0.1.4.conf" ]]; then
  install -o root -g root -m 0644 "${BACKUP_ROOT}/systemd-dropins/vcodex-streaming-v0.1.4.conf" "${DROPIN}"
else
  rm -f "${DROPIN}"
fi

systemctl daemon-reload
systemctl restart openclaw-gateway.service
echo "ROLLED_BACK_FROM=${BACKUP_ROOT}"
