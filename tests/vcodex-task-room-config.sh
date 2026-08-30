#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "${TEST_ROOT}"' EXIT

CONFIG_PATH="${TEST_ROOT}/openclaw.json"
BACKUP_DIR="${TEST_ROOT}/backups"
cp "${REPO_ROOT}/tests/fixtures/openclaw-vcodex-task-room-config.json" "${CONFIG_PATH}"

node "${REPO_ROOT}/scripts/apply-vcodex-task-room-config.mjs" \
  "--config=${CONFIG_PATH}" \
  --chat-id=oc_runtime_task_room \
  "--backup-dir=${BACKUP_DIR}" >/dev/null

jq -e '.agents.list[] | select(.id == "makaron") | .models["openai/gpt-5.6-sol"] == {alias:"vcodex",params:{thinking:"medium"},agentRuntime:{id:"codex"}}' "${CONFIG_PATH}" >/dev/null
jq -e '.agents.defaults.models["openai/gpt-5.6-sol"].agentRuntime.id == "vlab-worker"' "${CONFIG_PATH}" >/dev/null
jq -e '.agents.list[] | select(.id == "v-codex") | .models["openai/gpt-5.6-sol"].agentRuntime.id == "codex"' "${CONFIG_PATH}" >/dev/null
jq -e '[.bindings[] | select(.agentId == "makaron" and .match.peer.id == "oc_runtime_task_room")] | length == 1' "${CONFIG_PATH}" >/dev/null
jq -e '[.bindings[] | select(.agentId == "v-codex" and .match.peer.id == "oc_existing_vcodex")] | length == 1' "${CONFIG_PATH}" >/dev/null

first_sha=$(sha256sum "${CONFIG_PATH}" | awk '{print $1}')
node "${REPO_ROOT}/scripts/apply-vcodex-task-room-config.mjs" \
  "--config=${CONFIG_PATH}" \
  --chat-id=oc_runtime_task_room \
  "--backup-dir=${BACKUP_DIR}" | grep -q '"status":"already-configured"'
second_sha=$(sha256sum "${CONFIG_PATH}" | awk '{print $1}')
test "${first_sha}" = "${second_sha}"
test "$(find "${BACKUP_DIR}" -maxdepth 1 -type f | wc -l | tr -d ' ')" = "1"

echo "VCodex Task Room config patch checks passed"
