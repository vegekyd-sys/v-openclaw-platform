#!/usr/bin/env bash
set -euo pipefail

TARGET="${VLAB_SSH_TARGET:-root@100.75.190.64}"
IDENTITY_FILE="${VLAB_SSH_IDENTITY:-$HOME/.ssh/id_rsa}"
MIN_WORKERS="${VLAB_WORKER_MIN_COUNT:-1}"
WORKER_COUNT="${VLAB_WORKER_COUNT:-3}"
SESSIONS_PER_WORKER="${VLAB_WORKER_SESSIONS_PER_WORKER:-3}"
AGENT_MAX_CONCURRENT="${VLAB_AGENT_MAX_CONCURRENT:-10}"
SUBAGENT_MAX_CONCURRENT="${VLAB_SUBAGENT_MAX_CONCURRENT:-8}"
IDLE_TIMEOUT_MS="${VLAB_WORKER_IDLE_TIMEOUT_MS:-180000}"
REFRESH_PARITY="${VLAB_REFRESH_PRODUCTION_PARITY:-0}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_DIR="${REPO_ROOT}/experiments/agent-worker-isolation-v1"
PLATFORM_COMMIT="${VLAB_PLATFORM_COMMIT:-$(
  git -C "$REPO_ROOT" rev-parse HEAD
)}"
TEMP_DIR="$(mktemp -d)"
ARCHIVE="${TEMP_DIR}/vlab-agent-worker-isolation-v1.tar.gz"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "commit the experiment before deployment" >&2
  exit 1
fi
[[ "$REFRESH_PARITY" == 0 || "$REFRESH_PARITY" == 1 ]] || {
  echo "VLAB_REFRESH_PRODUCTION_PARITY must be 0 or 1" >&2
  exit 1
}

git -C "$REPO_ROOT" archive \
  --format=tar.gz \
  --output="$ARCHIVE" \
  "${PLATFORM_COMMIT}:experiments/agent-worker-isolation-v1"

scp \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$ARCHIVE" \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh" \
  "${REPO_ROOT}/scripts/apply-vlab-production-parity.sh" \
  "${REPO_ROOT}/scripts/patch-feishu-latest-snapshot-streaming.mjs" \
  "${REPO_ROOT}/scripts/patch-feishu-active-run-steering.mjs" \
  "${REPO_ROOT}/scripts/patch-openclaw-session-hotset.mjs" \
  "${REPO_ROOT}/scripts/patch-openclaw-media-completion-relay.mjs" \
  "${REPO_ROOT}/scripts/prune-openclaw-session-hotset.mjs" \
  "${REPO_ROOT}/scripts/rollback-agent-worker-experiment.sh" \
  "${REPO_ROOT}/scripts/rollback-vlab-production-parity.sh" \
  "${REPO_ROOT}/config/vlab-production-parity-v1.json" \
  "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service" \
  "${REPO_ROOT}/tests/vlab-production-parity.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-remote.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-soak.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-faults.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-subagents.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-native-dispatch.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-native-dispatch.mjs" \
  "${REPO_ROOT}/tests/vlab-agent-worker-stream-parity.mjs" \
  "${REPO_ROOT}/tests/vlab-agent-worker-native-faults.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-session-release.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-config-domain.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-config-domain.mjs" \
  "${REPO_ROOT}/tests/vlab-agent-worker-workshop-symlink.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-workshop-symlink.mjs" \
  "${REPO_ROOT}/tests/vlab-agent-worker-tool-parity.mjs" \
  "${REPO_ROOT}/tests/vlab-workshop-scale-fixture.mjs" \
  "${REPO_ROOT}/tests/vlab-agent-worker-compaction.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-harness-parity.sh" \
  "${REPO_ROOT}/tests/vlab-agent-worker-harness-parity.mjs" \
  "${REPO_ROOT}/tests/vlab-agent-worker-five-main-five-subagents.mjs" \
  "${REPO_ROOT}/tests/vlab-agent-worker-long-timeout.mjs" \
  "${REPO_ROOT}/tests/vlab-session-hotset-benchmark.mjs" \
  "${REPO_ROOT}/tests/vlab-session-hotset-cross-session.mjs" \
  "${TARGET}:/tmp/"

ssh \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$TARGET" \
  "chmod 0700 /tmp/apply-vlab-production-parity.sh /tmp/rollback-vlab-production-parity.sh /tmp/activate-agent-worker-experiment.sh /tmp/rollback-agent-worker-experiment.sh /tmp/vlab-production-parity.sh /tmp/vlab-agent-worker-remote.sh /tmp/vlab-agent-worker-soak.sh /tmp/vlab-agent-worker-faults.sh /tmp/vlab-agent-worker-subagents.sh /tmp/vlab-agent-worker-native-dispatch.sh /tmp/vlab-agent-worker-native-faults.sh /tmp/vlab-agent-worker-session-release.sh /tmp/vlab-agent-worker-config-domain.sh /tmp/vlab-agent-worker-workshop-symlink.sh /tmp/vlab-agent-worker-compaction.sh /tmp/vlab-agent-worker-harness-parity.sh && chmod 0755 /tmp/patch-feishu-latest-snapshot-streaming.mjs /tmp/patch-feishu-active-run-steering.mjs /tmp/patch-openclaw-session-hotset.mjs /tmp/patch-openclaw-media-completion-relay.mjs /tmp/prune-openclaw-session-hotset.mjs /tmp/vlab-agent-worker-native-dispatch.mjs /tmp/vlab-agent-worker-stream-parity.mjs /tmp/vlab-agent-worker-config-domain.mjs /tmp/vlab-agent-worker-workshop-symlink.mjs /tmp/vlab-agent-worker-tool-parity.mjs /tmp/vlab-workshop-scale-fixture.mjs /tmp/vlab-agent-worker-harness-parity.mjs /tmp/vlab-agent-worker-five-main-five-subagents.mjs /tmp/vlab-agent-worker-long-timeout.mjs /tmp/vlab-session-hotset-benchmark.mjs /tmp/vlab-session-hotset-cross-session.mjs && if [[ '${REFRESH_PARITY}' == 1 ]]; then VLAB_PARITY_PROFILE=/tmp/vlab-production-parity-v1.json VLAB_PARITY_UNIT_SOURCE=/tmp/openclaw-vlab-gateway.service VLAB_FEISHU_PATCHER_SOURCE=/tmp/patch-feishu-latest-snapshot-streaming.mjs /tmp/apply-vlab-production-parity.sh; fi && PLATFORM_COMMIT=${PLATFORM_COMMIT} VLAB_WORKER_MIN_COUNT=${MIN_WORKERS} VLAB_WORKER_COUNT=${WORKER_COUNT} VLAB_WORKER_SESSIONS_PER_WORKER=${SESSIONS_PER_WORKER} VLAB_AGENT_MAX_CONCURRENT=${AGENT_MAX_CONCURRENT} VLAB_SUBAGENT_MAX_CONCURRENT=${SUBAGENT_MAX_CONCURRENT} VLAB_WORKER_IDLE_TIMEOUT_MS=${IDLE_TIMEOUT_MS} VLAB_MEDIA_COMPLETION_PATCHER_SOURCE=/tmp/patch-openclaw-media-completion-relay.mjs VLAB_FEISHU_STEER_PATCHER_SOURCE=/tmp/patch-feishu-active-run-steering.mjs VLAB_FEISHU_STEER_ENABLED=1 VLAB_FEISHU_STEER_CHAT_IDS='*' /tmp/activate-agent-worker-experiment.sh && VLAB_PARITY_PROFILE=/tmp/vlab-production-parity-v1.json VLAB_EXPECTED_WORKER_RELEASE=${PLATFORM_COMMIT} /tmp/vlab-production-parity.sh && install -o vlab -g vlab -m 0755 /tmp/vlab-agent-worker-tool-parity.mjs /srv/vlab/tmp/vlab-agent-worker-tool-parity.mjs && sudo -u vlab env HOME=/srv/vlab OPENCLAW_HOME=/srv/vlab OPENCLAW_STATE_DIR=/srv/vlab/state OPENCLAW_CONFIG_PATH=/srv/vlab/state/openclaw.json OPENCLAW_WORKSPACE_DIR=/srv/vlab/workspace TMPDIR=/srv/vlab/tmp /opt/vlab/node/bin/node /srv/vlab/tmp/vlab-agent-worker-tool-parity.mjs"
