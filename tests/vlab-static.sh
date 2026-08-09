#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash -n "${REPO_ROOT}/scripts/bootstrap-vlab.sh"
bash -n "${REPO_ROOT}/scripts/deploy-vlab-bootstrap.sh"
bash -n "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
bash -n "${REPO_ROOT}/scripts/rollback-agent-worker-experiment.sh"
bash -n "${REPO_ROOT}/scripts/activate-agent-worker-production.sh"
bash -n "${REPO_ROOT}/scripts/rollback-agent-worker-production.sh"
bash -n "${REPO_ROOT}/scripts/deploy-agent-worker-experiment.sh"
bash -n "${REPO_ROOT}/scripts/apply-vlab-production-parity.sh"
bash -n "${REPO_ROOT}/scripts/rollback-vlab-production-parity.sh"
bash -n "${REPO_ROOT}/tests/vlab-production-parity.sh"
node --test "${REPO_ROOT}/tests/patch-feishu-latest-snapshot-streaming.test.mjs"
jq empty "${REPO_ROOT}/config/vlab-production-parity-v1.json"
"${REPO_ROOT}/tests/vlab-agent-worker-static.sh"

grep -q 'User=vlab' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'OPENCLAW_STATE_DIR=/srv/vlab/state' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'OPENCLAW_GATEWAY_PORT=23793' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'ProtectHome=true' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'NoNewPrivileges=true' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'CPUQuota=400%' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'MemoryHigh=5G' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'MemoryMax=6G' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'Restart=always' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q -- '--max-old-space-size=4096' \
  "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q '"sessionsVisibility": "all"' \
  "${REPO_ROOT}/config/vlab-production-parity-v1.json"
grep -q '"workerRelease": "8d3b75e' \
  "${REPO_ROOT}/config/vlab-production-parity-v1.json"

if rg -n \
  '(gho_|github_pat_|AKID|secret(id|key)?[[:space:]]*[:=]|app_secret[[:space:]]*[:=])' \
  "$REPO_ROOT" \
  -g '!.git' \
  -g '!tests/vlab-static.sh'; then
  echo "possible secret material detected" >&2
  exit 1
fi

echo "vLab static checks passed"
