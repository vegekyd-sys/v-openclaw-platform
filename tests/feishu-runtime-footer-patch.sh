#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "${TMP_ROOT}"' EXIT

DIST_DIR="${TMP_ROOT}/dist"
BACKUP_DIR="${TMP_ROOT}/backup"
mkdir -p "${DIST_DIR}"
cp "${REPO_ROOT}/tests/fixtures/monitor.account-runtime-footer-fixture.js" \
  "${DIST_DIR}/monitor.account-runtime-footer-fixture.js"

node "${REPO_ROOT}/scripts/apply-feishu-runtime-footer-patch.mjs" \
  "--dist=${DIST_DIR}" \
  "--backup-dir=${BACKUP_DIR}"

node "${REPO_ROOT}/scripts/apply-feishu-runtime-footer-patch.mjs" \
  "--dist=${DIST_DIR}" \
  "--backup-dir=${BACKUP_DIR}" | grep -q '"status":"already-patched"'

node --check "${DIST_DIR}/monitor.account-runtime-footer-fixture.js"

probe=$(node "${DIST_DIR}/monitor.account-runtime-footer-fixture.js" probe)
grep -q '"codex":"Agent: makaron | Model: gpt-5.6-sol | Provider: openai | Runtime: codex"' <<<"${probe}"
grep -q '"worker":"Agent: makaron | Model: deepseek-v4-pro | Provider: deepseek | Runtime: vlab-worker"' <<<"${probe}"
grep -q '"agentOverride":"Agent: special | Model: deepseek-v4-pro | Provider: deepseek | Runtime: deepseek-harness"' <<<"${probe}"
grep -q '"fallback":"Agent: makaron | Model: claude-sonnet-4-6 | Provider: anthropic | Runtime: openclaw"' <<<"${probe}"

test "$(find "${BACKUP_DIR}" -maxdepth 1 -type f | wc -l | tr -d ' ')" = "1"

echo "Feishu runtime footer patch tests passed"
