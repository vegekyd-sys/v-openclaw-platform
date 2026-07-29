#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TOKEN="${TIMESTAMP,,}"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-compaction-${TIMESTAMP}"
SESSION_STORE="${LAB_ROOT}/state/agents/makaron/sessions/sessions.json"

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
    --params "$2" \
    --timeout 300000 \
    --json
}

call_gateway_to_file() {
  local method="$1"
  local params="$2"
  local output_path="$3"
  local temporary="${output_path}.tmp"
  call_gateway "$method" "$params" > "$temporary"
  jq -e '.' "$temporary" >/dev/null
  mv "$temporary" "$output_path"
}

payload() {
  jq -c '.result // .' "$1"
}

session_entry() {
  local session_key="$1"
  jq -c --arg session_key "$session_key" '.[$session_key]' "$SESSION_STORE"
}

wait_for_run() {
  local run_id="$1"
  local output_path="$2"
  call_gateway_to_file \
    agent.wait \
    "$(jq -cn --arg run "$run_id" '{runId: $run, timeoutMs: 300000}')" \
    "$output_path"
  jq -e \
    '(.result // .).status == "ok"
     or (.result // .).status == "succeeded"' \
    "$output_path" >/dev/null
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-compaction.sh must run as root" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
session_key="agent:makaron:explicit:vlab-compaction-${TOKEN}"
seed_run="vlab-compaction-seed-${TOKEN}"
race_run="vlab-compaction-race-${TOKEN}"
seed_identifier="oc_vlabcompact${TOKEN//[^a-z0-9]/}"
race_user_marker="VLAB_COMPACTION_RACE_USER_${TOKEN}"
race_reply_marker="VLAB_COMPACTION_RACE_REPLY_${TOKEN}"
seed_body="$(
  dd if=/dev/zero bs=1000 count=140 2>/dev/null \
    | tr '\0' 'S'
)"

baseline_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
call_gateway_to_file vlab.workers.status '{}' "${REPORT_DIR}/status-before.json"
call_gateway_to_file health '{}' "${REPORT_DIR}/health-before.json"
status_before="$(payload "${REPORT_DIR}/status-before.json")"
rollover_retries_before="$(
  jq -r '.integration.nativeHarnessStats.sessionRolloverRetries // 0' \
    <<< "$status_before"
)"
provider_calls_before="$(
  jq -r '.integration.fastCompaction.aggregateWorkerStats.calls // 0' \
    <<< "$status_before"
)"
provider_model_calls_before="$(
  jq -r '.integration.fastCompaction.aggregateWorkerStats.modelCalls // 0' \
    <<< "$status_before"
)"
quality_retries_before="$(
  jq -r '.integration.fastCompaction.aggregateWorkerStats.qualityRetries // 0' \
    <<< "$status_before"
)"

call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session "$session_key" \
    --arg run "$seed_run" \
    --arg identifier "$seed_identifier" \
    --arg body "$seed_body" \
    '{
      sessionKey: $session,
      agentId: "makaron",
      message: (
        "记住以下测试标识并只回复 SEED_ACCEPTED：" + $identifier
        + "\n<synthetic_history>" + $body + "</synthetic_history>"
      ),
      deliver: false,
      timeoutMs: 300000,
      idempotencyKey: $run
    }')" \
  "${REPORT_DIR}/seed-send.json"
wait_for_run "$seed_run" "${REPORT_DIR}/seed-wait.json"

entry_before="$(session_entry "$session_key")"
session_id_before="$(jq -r '.sessionId' <<< "$entry_before")"
[[ -n "$session_id_before" && "$session_id_before" != "null" ]]

compact_started_ms="$(date +%s%3N)"
call_gateway_to_file \
  sessions.compact \
  "$(jq -cn --arg key "$session_key" '{key: $key}')" \
  "${REPORT_DIR}/compact.json" &
compact_pid=$!

sleep 0.25
call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session "$session_key" \
    --arg run "$race_run" \
    --arg user_marker "$race_user_marker" \
    --arg reply_marker "$race_reply_marker" \
    '{
      sessionKey: $session,
      agentId: "makaron",
      message: (
        $user_marker + "。Compaction 完成后只回复 " + $reply_marker
      ),
      deliver: false,
      timeoutMs: 300000,
      idempotencyKey: $run
    }')" \
  "${REPORT_DIR}/race-send.json"

wait "$compact_pid"
compact_finished_ms="$(date +%s%3N)"
compact_duration_ms="$((compact_finished_ms - compact_started_ms))"
jq -e '(.result // .).ok == true and (.result // .).compacted == true' \
  "${REPORT_DIR}/compact.json" >/dev/null
wait_for_run "$race_run" "${REPORT_DIR}/race-wait.json"

call_gateway_to_file \
  chat.history \
  "$(jq -cn --arg session "$session_key" '{sessionKey: $session, limit: 80}')" \
  "${REPORT_DIR}/history.json"
call_gateway_to_file vlab.workers.status '{}' "${REPORT_DIR}/status-after.json"
call_gateway_to_file health '{}' "${REPORT_DIR}/health-after.json"

entry_after="$(session_entry "$session_key")"
session_id_after="$(jq -r '.sessionId' <<< "$entry_after")"
session_file_after="$(jq -r '.sessionFile' <<< "$entry_after")"
[[ -n "$session_id_after" && "$session_id_after" != "$session_id_before" ]]
[[ -f "$session_file_after" ]]

summary="$(
  jq -r \
    'select(.type == "compaction")
     | (.summary // .content // "")' \
    "$session_file_after" \
    | tail -n 1
)"
for heading in \
  "## Decisions" \
  "## Open TODOs" \
  "## Constraints/Rules" \
  "## Pending user asks" \
  "## Exact identifiers"; do
  grep -Fq "$heading" <<< "$summary"
done
grep -Fq "$seed_identifier" <<< "$summary"

user_marker_count="$(
  jq -r \
    'select(.type == "message" and .message.role == "user")
     | .message.content
     | tostring' \
    "$session_file_after" \
    | grep -F -c "$race_user_marker" \
    || true
)"
[[ "$user_marker_count" == "1" ]]

reply_marker_count="$(
  jq -r \
    'select(.type == "message" and .message.role == "assistant")
     | .message.content
     | tostring' \
    "$session_file_after" \
    | grep -F -c "$race_reply_marker" \
    || true
)"
[[ "$reply_marker_count" == "1" ]]

status_after="$(payload "${REPORT_DIR}/status-after.json")"
rollover_retries_after="$(
  jq -r '.integration.nativeHarnessStats.sessionRolloverRetries // 0' \
    <<< "$status_after"
)"
provider_calls_after="$(
  jq -r '.integration.fastCompaction.aggregateWorkerStats.calls // 0' \
    <<< "$status_after"
)"
provider_model_calls_after="$(
  jq -r '.integration.fastCompaction.aggregateWorkerStats.modelCalls // 0' \
    <<< "$status_after"
)"
quality_retries_after="$(
  jq -r '.integration.fastCompaction.aggregateWorkerStats.qualityRetries // 0' \
    <<< "$status_after"
)"

[[ "$((rollover_retries_after - rollover_retries_before))" -ge 1 ]]
[[ "$((provider_calls_after - provider_calls_before))" == "1" ]]
model_call_delta="$((provider_model_calls_after - provider_model_calls_before))"
[[ "$model_call_delta" -ge 1 && "$model_call_delta" -le 2 ]]
[[ "$((quality_retries_after - quality_retries_before))" -le 1 ]]
[[ "$compact_duration_ms" -lt 90000 ]]
[[ "$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)" == "$baseline_restarts" ]]

memory_current="$(
  systemctl show openclaw-vlab-gateway.service -p MemoryCurrent --value
)"
memory_peak="$(
  systemctl show openclaw-vlab-gateway.service -p MemoryPeak --value
)"

jq -n \
  --arg sessionKey "$session_key" \
  --arg sessionIdBefore "$session_id_before" \
  --arg sessionIdAfter "$session_id_after" \
  --arg seedIdentifier "$seed_identifier" \
  --argjson compactDurationMs "$compact_duration_ms" \
  --argjson modelCalls "$model_call_delta" \
  --argjson rolloverRetries "$((rollover_retries_after - rollover_retries_before))" \
  --argjson memoryCurrent "$memory_current" \
  --argjson memoryPeak "$memory_peak" \
  --arg reportDir "$REPORT_DIR" \
  '{
    ok: true,
    sessionKey: $sessionKey,
    sessionRotated: ($sessionIdBefore != $sessionIdAfter),
    sessionIdBefore: $sessionIdBefore,
    sessionIdAfter: $sessionIdAfter,
    compactDurationMs: $compactDurationMs,
    providerModelCalls: $modelCalls,
    rolloverRetries: $rolloverRetries,
    userMessagePreservedExactlyOnce: true,
    visibleReplyPreservedExactlyOnce: true,
    requiredSummarySectionsPresent: true,
    exactIdentifierPreserved: $seedIdentifier,
    gatewayRestarted: false,
    memoryCurrent: $memoryCurrent,
    memoryPeak: $memoryPeak,
    reportDir: $reportDir
  }' \
  | tee "${REPORT_DIR}/summary.json"
