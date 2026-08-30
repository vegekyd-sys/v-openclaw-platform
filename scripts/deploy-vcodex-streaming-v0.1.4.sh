#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <staged-release-dir>" >&2
  exit 2
fi

STAGED_RELEASE_DIR=$1

OPENCLAW_STATE=/home/openclaw/.openclaw
OPENCLAW_CONFIG=${OPENCLAW_STATE}/openclaw.json
WORKER_CONFIG=${OPENCLAW_STATE}/experiments/agent-worker-isolation-v1/worker-openclaw.json
OPENCLAW_CLI=/opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js
NODE_BIN=/opt/node-v22.23.1/bin/node
RELEASE_ROOT=${OPENCLAW_STATE}/releases/vcodex-streaming-v0.1.4
BACKUP_ROOT=${OPENCLAW_STATE}/backups/vcodex-streaming-v0.1.4/$(date +%Y%m%d-%H%M%S)-predeploy
DROPIN=/etc/systemd/system/openclaw-gateway.service.d/vcodex-streaming-v0.1.4.conf
BUNDLE_PRIMARY=${OPENCLAW_STATE}/npm/projects/openclaw-feishu-dc69f44688/node_modules/@openclaw/feishu/dist/monitor.account-Dr7do33p.js
BUNDLE_GENERATION=${OPENCLAW_STATE}/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-c74b020f77637f52/node_modules/@openclaw/feishu/dist/monitor.account-Dr7do33p.js

for required in \
  apply-vcodex-feishu-stream-coalescing-patch.mjs \
  apply-vcodex-feishu-meaningful-progress-patch.mjs \
  apply-feishu-runtime-footer-patch.mjs \
  apply-vcodex-task-room-config.mjs \
  openclaw-gateway-vcodex-streaming-v0.1.4.conf; do
  test -f "${STAGED_RELEASE_DIR}/${required}"
done

status_json=$(sudo -u openclaw env \
  HOME=/home/openclaw \
  OPENCLAW_CONFIG_PATH=${OPENCLAW_CONFIG} \
  "${NODE_BIN}" "${OPENCLAW_CLI}" gateway call vlab.workers.status --json --timeout 10000)
pending=$(jq -r '.pending' <<<"${status_json}")
active=$(jq '[.workers[].activeCount] | add // 0' <<<"${status_json}")
queued=$(jq '[.workers[].queued] | add // 0' <<<"${status_json}")
if [[ ${pending} != 0 || ${active} != 0 || ${queued} != 0 ]]; then
  echo "Unsafe deployment window: pending=${pending} active=${active} queued=${queued}" >&2
  exit 20
fi

install -d -o openclaw -g openclaw -m 0700 "${BACKUP_ROOT}" "${BACKUP_ROOT}/systemd-dropins"
install -o openclaw -g openclaw -m 0600 "${OPENCLAW_CONFIG}" "${BACKUP_ROOT}/openclaw.json.before"
install -o openclaw -g openclaw -m 0600 "${WORKER_CONFIG}" "${BACKUP_ROOT}/worker-openclaw.json.before"
install -o openclaw -g openclaw -m 0600 "${BUNDLE_PRIMARY}" "${BACKUP_ROOT}/monitor.account.primary.before.js"
install -o openclaw -g openclaw -m 0600 "${BUNDLE_GENERATION}" "${BACKUP_ROOT}/monitor.account.generation.before.js"
cp -a /etc/systemd/system/openclaw-gateway.service.d/. "${BACKUP_ROOT}/systemd-dropins/"
sha256sum \
  "${BACKUP_ROOT}/openclaw.json.before" \
  "${BACKUP_ROOT}/worker-openclaw.json.before" \
  "${BACKUP_ROOT}/monitor.account.primary.before.js" \
  "${BACKUP_ROOT}/monitor.account.generation.before.js" \
  >"${BACKUP_ROOT}/SHA256SUMS"
chown openclaw:openclaw "${BACKUP_ROOT}/SHA256SUMS"
chmod 0600 "${BACKUP_ROOT}/SHA256SUMS"

install -d -o root -g openclaw -m 0750 "${RELEASE_ROOT}"
for file in \
  apply-vcodex-feishu-stream-coalescing-patch.mjs \
  apply-vcodex-feishu-meaningful-progress-patch.mjs \
  apply-feishu-runtime-footer-patch.mjs \
  apply-vcodex-task-room-config.mjs; do
  install -o root -g openclaw -m 0750 "${STAGED_RELEASE_DIR}/${file}" "${RELEASE_ROOT}/${file}"
done

"${NODE_BIN}" "${RELEASE_ROOT}/apply-vcodex-task-room-config.mjs" \
  "--config=${OPENCLAW_CONFIG}" \
  "--backup-dir=${BACKUP_ROOT}"

sudo -u openclaw env \
  HOME=/home/openclaw \
  OPENCLAW_CONFIG_PATH=${OPENCLAW_CONFIG} \
  "${NODE_BIN}" "${OPENCLAW_CLI}" config validate

install -o root -g root -m 0644 \
  "${STAGED_RELEASE_DIR}/openclaw-gateway-vcodex-streaming-v0.1.4.conf" \
  "${DROPIN}"
systemctl daemon-reload
systemctl restart openclaw-gateway.service

echo "BACKUP=${BACKUP_ROOT}"
echo "RELEASE=${RELEASE_ROOT}"
