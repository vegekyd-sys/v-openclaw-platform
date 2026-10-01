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
node --test "${REPO_ROOT}/tests/patch-feishu-progress-stream.test.mjs"
node --test "${REPO_ROOT}/tests/patch-feishu-task-status.test.mjs"
python3 "${REPO_ROOT}/tests/v-release-drift.test.py"
bash -n "${REPO_ROOT}/scripts/install-v-release-drift.sh"
python3 "${REPO_ROOT}/tests/v-nightshift-check.test.py"
bash -n "${REPO_ROOT}/scripts/install-v-nightshift-check.sh"
python3 "${REPO_ROOT}/tests/v-daily-image.test.py"
bash -n "${REPO_ROOT}/scripts/install-v-daily-image.sh"
# The release production V runs now: core dist, worker plugin, Feishu plugin.
for component in "" .worker .feishu; do
  node "${REPO_ROOT}/scripts/verify-release-reproducible.mjs" \
    --manifest "${REPO_ROOT}/release/captured/v2026.9.1-db91.6-media-relay-20260925${component}/manifest.json" --quiet
done
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

# Every production release captured in git has a CHANGELOG.md section.
for dir in "${REPO_ROOT}"/release/captured/v*/; do
  name=$(basename "$dir")
  case "$name" in *.worker|*.feishu) continue;; esac
  grep -qxF "## ${name}" "${REPO_ROOT}/CHANGELOG.md" || {
    echo "CHANGELOG.md has no section for ${name}: node scripts/release-notes.mjs --from <previous> --to ${name}" >&2
    exit 1
  }
done
"${REPO_ROOT}/scripts/scan-secrets.sh"

echo "vLab static checks passed"
