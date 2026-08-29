#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "${TEST_ROOT}"' EXIT

DIST_DIR="${TEST_ROOT}/dist"
BACKUP_DIR="${TEST_ROOT}/backups"
mkdir -p "${DIST_DIR}"
cp "${REPO_ROOT}/tests/fixtures/monitor.account-vcodex-scoped-stream-fixture.js" \
  "${DIST_DIR}/monitor.account-vcodex-scoped-fixture.js"

node "${REPO_ROOT}/scripts/apply-vcodex-feishu-scoped-streaming-patch.mjs" \
  --dist="${DIST_DIR}" \
  --backup-dir="${BACKUP_DIR}" >/dev/null

node "${REPO_ROOT}/scripts/apply-vcodex-feishu-scoped-streaming-patch.mjs" \
  --dist="${DIST_DIR}" \
  --backup-dir="${BACKUP_DIR}" | grep -q '"status":"already-patched"'

node --check "${DIST_DIR}/monitor.account-vcodex-scoped-fixture.js"

probe=$(V_FEISHU_VCODEX_STREAM_CHAT_IDS='*,oc_vcodex,invalid' \
  node "${DIST_DIR}/monitor.account-vcodex-scoped-fixture.js" probe)
test "${probe}" = '["card","raw","auto"]'

probe=$(VLAB_VCODEX_ACCEPTANCE_CHAT_ID='oc_vcodex' \
  node "${DIST_DIR}/monitor.account-vcodex-scoped-fixture.js" probe)
test "${probe}" = '["card","raw","auto"]'

test "$(find "${BACKUP_DIR}" -maxdepth 1 -type f | wc -l | tr -d ' ')" = "1"

echo "VCodex scoped Feishu streaming patch checks passed"
