#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash -n "${REPO_ROOT}/scripts/bootstrap-vlab.sh"
bash -n "${REPO_ROOT}/scripts/deploy-vlab-bootstrap.sh"

grep -q 'User=vlab' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'OPENCLAW_STATE_DIR=/srv/vlab/state' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'OPENCLAW_GATEWAY_PORT=23793' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'ProtectHome=true' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"
grep -q 'NoNewPrivileges=true' "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service"

if rg -n \
  '(gho_|github_pat_|AKID|secret(id|key)?[[:space:]]*[:=]|app_secret[[:space:]]*[:=])' \
  "$REPO_ROOT" \
  -g '!.git' \
  -g '!tests/vlab-static.sh'; then
  echo "possible secret material detected" >&2
  exit 1
fi

echo "vLab static checks passed"

