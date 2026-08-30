#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "${TMP_ROOT}"' EXIT

DIST_DIR="${TMP_ROOT}/dist"
BACKUP_DIR="${TMP_ROOT}/backup"
mkdir -p "${DIST_DIR}"
cp "${REPO_ROOT}/tests/fixtures/monitor.account-vcodex-meaningful-progress-fixture.js" \
  "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"

node "${REPO_ROOT}/scripts/apply-vcodex-feishu-meaningful-progress-patch.mjs" \
  "--dist=${DIST_DIR}" \
  "--backup-dir=${BACKUP_DIR}"

node "${REPO_ROOT}/scripts/apply-vcodex-feishu-meaningful-progress-patch.mjs" \
  "--dist=${DIST_DIR}" \
  "--backup-dir=${BACKUP_DIR}"

node --check "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"
grep -q 'allowToolLifecycleWhenProgressHidden: vcodexMeaningfulProgressEnabled' "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"
grep -q 'onItemEvent: vcodexMeaningfulProgressEnabled' "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"
grep -q '已收到任务，正在分析并准备执行' "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"

probe=$(VLAB_VCODEX_ACCEPTANCE_CHAT_ID='oc_vcodex' \
  node "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js" probe)
grep -q '正在执行项目检查与代码验证' <<<"${probe}"
grep -q '代码修改已写入' <<<"${probe}"
grep -q '相关文件' <<<"${probe}"
grep -q '"scoped":true' <<<"${probe}"
grep -q '"unlisted":false' <<<"${probe}"
