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
grep -q 'suppressToolErrorWarnings: vcodexMeaningfulProgressEnabled' "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"
grep -q 'onItemEvent: vcodexMeaningfulProgressEnabled' "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"
grep -q 'const VCODEX_COMMENTARY_STREAM_V1 = true' "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"
grep -q 'vcodexDisplayPhase = "final"' "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js"

probe=$(VLAB_VCODEX_ACCEPTANCE_CHAT_ID='oc_vcodex' \
  node "${DIST_DIR}/monitor.account-vcodex-meaningful-progress-fixture.js" probe)
grep -q '"scoped":true' <<<"${probe}"
grep -q '"unlisted":false' <<<"${probe}"
grep -q '"afterStart":0' <<<"${probe}"
grep -q '"afterTool":0' <<<"${probe}"
grep -q '我先检查当前实现如何传递 Codex 的文字' <<<"${probe}"
grep -q '问题已经定位，我正在调整事件路由' <<<"${probe}"
grep -q '最终结果：文字流式已经完成' <<<"${probe}"
if grep -q 'RAW_COMMAND_SENTINEL' <<<"${probe}"; then
  echo "raw command leaked into the visible stream" >&2
  exit 1
fi
if grep -q 'LATE_COMMENTARY_SENTINEL' <<<"${probe}"; then
  echo "late commentary overwrote the final answer" >&2
  exit 1
fi
node -e '
const result = JSON.parse(process.argv[1]);
if (result.rendered.length !== 4) throw new Error(`expected 4 visible snapshots, got ${result.rendered.length}`);
if (result.rendered[1].text !== "我先检查当前实现如何传递 Codex 的文字。") throw new Error("same-item commentary snapshot was appended instead of replaced");
if (!result.rendered[2].text.includes(result.rendered[1].text)) throw new Error("separate commentary items did not accumulate");
if (result.rendered.at(-1).text !== "最终结果：文字流式已经完成。") throw new Error("final answer did not replace commentary");
' "${probe}"
