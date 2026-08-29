#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

DIST_DIR="${TEST_ROOT}/dist"
BACKUP_DIR="${TEST_ROOT}/backup"
mkdir -p "${DIST_DIR}"
cp "${REPO_ROOT}/tests/fixtures/monitor.account-vcodex-stream-fixture.js" \
  "${DIST_DIR}/monitor.account-vcodex-stream-fixture.js"

node "${REPO_ROOT}/scripts/apply-vcodex-feishu-stream-coalescing-patch.mjs" \
  "--dist=${DIST_DIR}" \
  --dry-run | jq -e '.status == "would-patch" and .changed == false' >/dev/null

node "${REPO_ROOT}/scripts/apply-vcodex-feishu-stream-coalescing-patch.mjs" \
  "--dist=${DIST_DIR}" \
  "--backup-dir=${BACKUP_DIR}" | jq -e '.status == "patched" and .changed == true' >/dev/null

node --check "${DIST_DIR}/monitor.account-vcodex-stream-fixture.js"
grep -q 'let streamingFlushScheduled = false;' "${DIST_DIR}/monitor.account-vcodex-stream-fixture.js"
grep -q 'while (latestStreamingCombined !== null)' "${DIST_DIR}/monitor.account-vcodex-stream-fixture.js"
grep -q 'streamText = mergeStreamingText(streamText, nextText)' "${DIST_DIR}/monitor.account-vcodex-stream-fixture.js"

node "${REPO_ROOT}/scripts/apply-vcodex-feishu-stream-coalescing-patch.mjs" \
  "--dist=${DIST_DIR}" \
  "--backup-dir=${BACKUP_DIR}" | jq -e '.status == "already-patched" and .changed == false' >/dev/null

test "$(find "${BACKUP_DIR}" -type f | wc -l | tr -d ' ')" = "1"
echo "VCodex Feishu coalescing patch tests passed"
