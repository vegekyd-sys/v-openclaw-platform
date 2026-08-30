#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTO_CONFIG="${REPO_ROOT}/config/vcodex-streaming/openclaw.auto.json"
CARD_CONFIG="${REPO_ROOT}/config/vcodex-streaming/openclaw.card.json"
SERVICE="${REPO_ROOT}/systemd/openclaw-vlab-vcodex-streaming.service"

bash -n "${REPO_ROOT}/scripts/bootstrap-vcodex-streaming-vlab.sh"
bash -n "${REPO_ROOT}/scripts/vcodex-streaming-env-exec.sh"
node --check "${REPO_ROOT}/scripts/inject-vcodex-feishu-event.mjs"
node --check "${REPO_ROOT}/scripts/capture-vcodex-feishu-timeline.mjs"
node --check "${REPO_ROOT}/scripts/apply-vcodex-feishu-stream-coalescing-patch.mjs"
node --check "${REPO_ROOT}/scripts/apply-vcodex-feishu-scoped-streaming-patch.mjs"
node --check "${REPO_ROOT}/scripts/apply-vcodex-feishu-meaningful-progress-patch.mjs"
"${REPO_ROOT}/tests/vcodex-feishu-coalescing-patch.sh"
"${REPO_ROOT}/tests/vcodex-feishu-meaningful-progress-patch.sh"
jq -e . "${AUTO_CONFIG}" >/dev/null
jq -e . "${CARD_CONFIG}" >/dev/null

jq -e '.gateway.port == 24993' "${CARD_CONFIG}" >/dev/null
jq -e '.channels.feishu.webhookPort == 24994' "${CARD_CONFIG}" >/dev/null
jq -e '.channels.feishu.connectionMode == "webhook"' "${CARD_CONFIG}" >/dev/null
jq -e '.channels.feishu.renderMode == "card"' "${CARD_CONFIG}" >/dev/null
jq -e '.channels.feishu.streaming == true and .channels.feishu.blockStreaming == false' "${CARD_CONFIG}" >/dev/null
jq -e '.messages.visibleReplies == "automatic" and .messages.groupChat.visibleReplies == "automatic"' "${CARD_CONFIG}" >/dev/null
jq -e '.agents.defaults.models["openai/gpt-5.6-sol"].agentRuntime.id == "codex"' "${CARD_CONFIG}" >/dev/null
jq -e '.channels.feishu.renderMode == "auto"' "${AUTO_CONFIG}" >/dev/null
jq -e '.messages == null' "${AUTO_CONFIG}" >/dev/null

grep -q '^User=vlab-vcodex$' "${SERVICE}"
grep -q '^Environment=OPENCLAW_STATE_DIR=/srv/vlab-vcodex-streaming/state$' "${SERVICE}"
grep -q '^Environment=CODEX_HOME=/srv/vlab-vcodex-streaming/codex-home$' "${SERVICE}"
grep -q '^Environment=OPENCLAW_GATEWAY_PORT=24993$' "${SERVICE}"
grep -q '^ExecStartPre=/opt/vlab/node/bin/node /srv/vlab-vcodex-streaming/bin/apply-vcodex-feishu-stream-coalescing-patch.mjs ' "${SERVICE}"
grep -q '^ExecStartPre=/opt/vlab/node/bin/node /srv/vlab-vcodex-streaming/bin/apply-vcodex-feishu-meaningful-progress-patch.mjs ' "${SERVICE}"
grep -q '^MemoryHigh=2G$' "${SERVICE}"
grep -q '^MemoryMax=3G$' "${SERVICE}"
grep -q '^CPUQuota=150%$' "${SERVICE}"

if rg -n \
  '(cli_[a-z0-9]{8,}|oc_[a-z0-9]{12,}|ou_[a-z0-9]{12,}|github_pat_|AKID|appSecret[[:space:]]*"?:[[:space:]]*"[^$]|apiKey[[:space:]]*"?:[[:space:]]*"[^$])' \
  "${REPO_ROOT}/config/vcodex-streaming" \
  "${REPO_ROOT}/systemd/openclaw-vlab-vcodex-streaming.service" \
  "${REPO_ROOT}/scripts/bootstrap-vcodex-streaming-vlab.sh"; then
  echo "possible secret or live identifier detected" >&2
  exit 1
fi

echo "VCodex streaming static checks passed"
