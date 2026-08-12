#!/usr/bin/env bash
set -euo pipefail

TARGET="${V_PRODUCTION_SSH_TARGET:-ubuntu@100.82.39.107}"
IDENTITY_FILE="${V_PRODUCTION_SSH_IDENTITY:-/Users/tianyicai/.ssh/v-zkda-20260719}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_DIR="${REPO_ROOT}/experiments/agent-worker-isolation-v1"
PLATFORM_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
FEISHU_STEER_CHAT_IDS="${V_FEISHU_STEER_CHAT_IDS:?V_FEISHU_STEER_CHAT_IDS is required for production canary}"
TEMP_DIR="$(mktemp -d)"
ARCHIVE="${TEMP_DIR}/v-agent-worker-isolation-v1.tar.gz"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "commit the release before production deployment" >&2
  exit 1
fi
IFS=',' read -r -a feishu_steer_chat_ids <<< "$FEISHU_STEER_CHAT_IDS"
(( ${#feishu_steer_chat_ids[@]} > 0 )) || {
  echo "V_FEISHU_STEER_CHAT_IDS must contain explicit Feishu oc_ chat ids" >&2
  exit 1
}
for chat_id in "${feishu_steer_chat_ids[@]}"; do
  [[ "$chat_id" =~ ^oc_[A-Za-z0-9_]+$ ]] || {
    echo "invalid Feishu Steer canary chat id: $chat_id" >&2
    exit 1
  }
done

tar -czf "$ARCHIVE" -C "$EXPERIMENT_DIR" .
ARTIFACT_SHA256="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"

scp \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$ARCHIVE" \
  "${REPO_ROOT}/scripts/activate-agent-worker-production.sh" \
  "${REPO_ROOT}/scripts/patch-openclaw-session-hotset.mjs" \
  "${REPO_ROOT}/scripts/patch-openclaw-media-completion-relay.mjs" \
  "${REPO_ROOT}/scripts/patch-feishu-active-run-steering.mjs" \
  "${REPO_ROOT}/scripts/prune-openclaw-session-hotset.mjs" \
  "${REPO_ROOT}/scripts/rollback-agent-worker-production.sh" \
  "${TARGET}:/tmp/"

ssh \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$TARGET" \
  "sudo env PLATFORM_COMMIT=${PLATFORM_COMMIT} ARTIFACT_SHA256=${ARTIFACT_SHA256} V_MEDIA_COMPLETION_PATCHER_SOURCE=/tmp/patch-openclaw-media-completion-relay.mjs V_FEISHU_STEER_ENABLED=1 V_FEISHU_STEER_CHAT_IDS='${FEISHU_STEER_CHAT_IDS}' V_FEISHU_STEER_PATCHER_SOURCE=/tmp/patch-feishu-active-run-steering.mjs /bin/bash /tmp/activate-agent-worker-production.sh"
