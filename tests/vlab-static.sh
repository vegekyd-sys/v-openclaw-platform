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
node --test "${REPO_ROOT}/tests/patch-feishu-inter-session-bridge.test.mjs"
node --test "${REPO_ROOT}/tests/v-memory-indexer.test.mjs"
python3 "${REPO_ROOT}/tests/v-memory-indexer-run.test.py"
python3 "${REPO_ROOT}/tests/v-memory-vector-warm.test.py"
bash -n "${REPO_ROOT}/scripts/install-v-memory-vector-warm.sh"
node --test "${REPO_ROOT}/apps/v-browser-fill/plugin/tests/fill.test.mjs"
python3 "${REPO_ROOT}/tests/v-release-drift.test.py"
bash -n "${REPO_ROOT}/scripts/install-v-release-drift.sh"
python3 "${REPO_ROOT}/tests/v-nightshift-check.test.py"
bash -n "${REPO_ROOT}/scripts/install-v-nightshift-check.sh"
python3 "${REPO_ROOT}/tests/v-daily-image.test.py"
python3 "${REPO_ROOT}/tests/v-codex-orphan-cleanup.test.py"
bash -n "${REPO_ROOT}/scripts/install-v-codex-orphan-cleanup.sh"
bash -n "${REPO_ROOT}/scripts/install-v-daily-image.sh"
python3 "${REPO_ROOT}/tests/v-self-restart.test.py"
python3 "${REPO_ROOT}/tests/v-sentinel-cutoff.test.py"
python3 "${REPO_ROOT}/tests/v-sentinel-config.test.py"
python3 "${REPO_ROOT}/tests/v-sentinel-user-impact.test.py"
bash -n "${REPO_ROOT}/scripts/install-v-self-restart.sh"
node --check "${REPO_ROOT}/scripts/v-self-restart-gateway.mjs"
bash -n "${REPO_ROOT}/scripts/install-secret-entry-host.sh"
grep -q '^NoNewPrivileges=true' "${REPO_ROOT}/systemd/v-secret-entry.service"
grep -q '^Environment=V_SECRET_ENTRY_ADMIN_TOKEN_FILE=' "${REPO_ROOT}/systemd/openclaw-gateway.service.d/secret-entry.conf"
# Capture suffixes of every captured component (scripts/lib/runtime-components.mjs):
# .worker .feishu .codex .dingtalk .wecom ...
SUFFIXES=$(node --input-type=module -e "const m=await import(process.argv[1]);console.log(m.captureSuffixes().join(' '))" \
  "${REPO_ROOT}/scripts/lib/runtime-components.mjs")
[ -n "$SUFFIXES" ] || { echo "no capture suffixes from the component table" >&2; exit 1; }
# The release production V runs now. Core, worker and Feishu are always
# captured; a component added to the table later only once a release has it.
CURRENT_V=v2026.9.1-db91.6-media-relay-20260925
for component in "" $SUFFIXES; do
  manifest="${REPO_ROOT}/release/captured/${CURRENT_V}${component}/manifest.json"
  case "$component" in ""|.worker|.feishu) ;; *) [ -f "$manifest" ] || continue;; esac
  node "${REPO_ROOT}/scripts/verify-release-reproducible.mjs" --manifest "$manifest" --quiet
done
# The first capture of the Codex plugin (captures before 2026-10-14 have none).
node "${REPO_ROOT}/scripts/verify-release-reproducible.mjs" --quiet \
  --manifest "${REPO_ROOT}/release/captured/v2026.9.1-db91.6-codex-ds-window-20261013.codex/manifest.json"
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
  suffix=".${name##*.}"
  case " $SUFFIXES " in *" $suffix "*) continue;; esac
  grep -qxF "## ${name}" "${REPO_ROOT}/CHANGELOG.md" || {
    echo "CHANGELOG.md has no section for ${name}: node scripts/release-notes.mjs --from <previous> --to ${name}" >&2
    exit 1
  }
done
"${REPO_ROOT}/scripts/scan-secrets.sh"

echo "vLab static checks passed"
