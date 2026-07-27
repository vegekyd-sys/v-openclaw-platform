#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-fault-acceptance-${TIMESTAMP}"

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
    --params "$2" \
    --timeout 30000 \
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
  jq -c 'if has("ok") and has("result") then .result else . end' "$1"
}

wait_for_operation() {
  local operation_id="$1"
  local expected_state="$2"
  local output_path="$3"
  for _ in $(seq 1 300); do
    call_gateway_to_file \
      vlab.workers.operation \
      "$(jq -cn --arg operation_id "$operation_id" '{operationId: $operation_id}')" \
      "$output_path"
    if [[ "$(payload "$output_path" | jq -r '.state')" == "$expected_state" ]]; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

wait_for_active_slot() {
  local request_id="$1"
  local output_path="$2"
  for _ in $(seq 1 100); do
    call_gateway_to_file vlab.workers.status '{}' "$output_path"
    local slot
    slot="$(
      payload "$output_path" \
        | jq -r --arg request_id "$request_id" \
          '.workers[]
           | select(any(.active[]; .requestId == $request_id))
           | .slot' \
        | head -n 1
    )"
    if [[ -n "$slot" ]]; then
      printf '%s\n' "$slot"
      return 0
    fi
    sleep 0.1
  done
  return 1
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-faults.sh must run as root" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
baseline_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"

crash_key="agent-crash-${TIMESTAMP}"
crash_session="agent:makaron:explicit:vlab-worker-agent-crash-${TIMESTAMP,,}"
call_gateway_to_file \
  vlab.workers.start \
  "$(jq -cn \
    --arg key "$crash_key" \
    --arg session_key "$crash_session" \
    '{
      idempotencyKey: $key,
      kind: "agent",
      sessionKey: $session_key,
      agentId: "makaron",
      message: "这是 vLab 故障验收。必须使用 exec 执行 /bin/sleep 30，然后只回复 SHOULD_NOT_COMPLETE。",
      timeoutSeconds: 120,
      modelRun: false
    }')" \
  "${REPORT_DIR}/crash-start.json"
crash_operation="$(
  payload "${REPORT_DIR}/crash-start.json" | jq -r '.operation.operationId'
)"
crash_request="$(
  payload "${REPORT_DIR}/crash-start.json" | jq -r '.operation.requestId'
)"
crash_slot="$(
  wait_for_active_slot \
    "$crash_request" \
    "${REPORT_DIR}/status-before-crash.json"
)"
sleep 3
call_gateway_to_file \
  vlab.workers.kill \
  "$(jq -cn --argjson slot "$crash_slot" '{slot: $slot}')" \
  "${REPORT_DIR}/crash-kill.json"
wait_for_operation \
  "$crash_operation" \
  failed \
  "${REPORT_DIR}/crash-operation.json"
call_gateway_to_file \
  vlab.workers.start \
  "$(jq -cn \
    --arg key "$crash_key" \
    --arg session_key "$crash_session" \
    '{
      idempotencyKey: $key,
      kind: "agent",
      sessionKey: $session_key,
      agentId: "makaron",
      message: "这条消息绝不能重新执行。",
      timeoutSeconds: 120,
      modelRun: false
    }')" \
  "${REPORT_DIR}/crash-deduplicated.json"
jq -e \
  --arg operation_id "$crash_operation" \
  '(.result // .).deduplicated == true
   and (.result // .).operation.operationId == $operation_id
   and (.result // .).operation.state == "failed"' \
  "${REPORT_DIR}/crash-deduplicated.json" >/dev/null

cancel_key="agent-cancel-${TIMESTAMP}"
cancel_session="agent:makaron:explicit:vlab-worker-agent-cancel-${TIMESTAMP,,}"
call_gateway_to_file \
  vlab.workers.start \
  "$(jq -cn \
    --arg key "$cancel_key" \
    --arg session_key "$cancel_session" \
    '{
      idempotencyKey: $key,
      kind: "agent",
      sessionKey: $session_key,
      agentId: "makaron",
      message: "这是 vLab 取消验收。必须使用 exec 执行 /bin/sleep 30，然后只回复 SHOULD_BE_CANCELLED。",
      timeoutSeconds: 120,
      modelRun: false
    }')" \
  "${REPORT_DIR}/cancel-start.json"
cancel_operation="$(
  payload "${REPORT_DIR}/cancel-start.json" | jq -r '.operation.operationId'
)"
cancel_request="$(
  payload "${REPORT_DIR}/cancel-start.json" | jq -r '.operation.requestId'
)"
wait_for_active_slot \
  "$cancel_request" \
  "${REPORT_DIR}/status-before-cancel.json" >/dev/null
sleep 3
call_gateway_to_file \
  vlab.workers.cancel \
  "$(jq -cn --arg operation_id "$cancel_operation" '{operationId: $operation_id}')" \
  "${REPORT_DIR}/cancel-request.json"
jq -e '(.result // .).cancelled == true' \
  "${REPORT_DIR}/cancel-request.json" >/dev/null
wait_for_operation \
  "$cancel_operation" \
  cancelled \
  "${REPORT_DIR}/cancel-operation.json"

recovery_key="agent-recovery-${TIMESTAMP}"
recovery_session="agent:makaron:explicit:vlab-worker-agent-recovery-${TIMESTAMP,,}"
call_gateway_to_file \
  vlab.workers.start \
  "$(jq -cn \
    --arg key "$recovery_key" \
    --arg session_key "$recovery_session" \
    '{
      idempotencyKey: $key,
      kind: "agent",
      sessionKey: $session_key,
      agentId: "makaron",
      message: "只回复 VLAB_AGENT_RECOVERY_OK，不要调用工具。",
      timeoutSeconds: 120,
      modelRun: false
    }')" \
  "${REPORT_DIR}/recovery-start.json"
recovery_operation="$(
  payload "${REPORT_DIR}/recovery-start.json" | jq -r '.operation.operationId'
)"
wait_for_operation \
  "$recovery_operation" \
  succeeded \
  "${REPORT_DIR}/recovery-operation.json"
jq -e \
  '(if has("ok") and has("result") then .result else . end).result.payloads
   | any(.text? | contains("VLAB_AGENT_RECOVERY_OK"))' \
  "${REPORT_DIR}/recovery-operation.json" >/dev/null

call_gateway_to_file health '{}' "${REPORT_DIR}/health-after.json"
final_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
[[ "$baseline_restarts" == "$final_restarts" ]]
jq -e '(.result // .).eventLoop.degraded == false' \
  "${REPORT_DIR}/health-after.json" >/dev/null

jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg crash_operation "$crash_operation" \
  --arg cancel_operation "$cancel_operation" \
  --arg recovery_operation "$recovery_operation" \
  --arg baseline_restarts "$baseline_restarts" \
  --arg final_restarts "$final_restarts" \
  '{
    ok: true,
    timestamp: $timestamp,
    activeAgentCrash: {
      operationId: $crash_operation,
      failedWithoutAutomaticReplay: true,
      sameIdempotencyKeyReturnedTerminalFailure: true
    },
    activeAgentCancellation: {
      operationId: $cancel_operation,
      abortSignalReachedAgentCommand: true,
      terminalState: "cancelled"
    },
    recovery: {
      operationId: $recovery_operation,
      explicitNewIdempotencyKeyRequired: true,
      nativeAgentTurnSucceeded: true
    },
    gateway: {
      eventLoopDegraded: false,
      restartsBefore: $baseline_restarts,
      restartsAfter: $final_restarts
    }
  }' > "${REPORT_DIR}/summary.json"
chown vlab:vlab "${REPORT_DIR}/summary.json"
chmod 0600 "${REPORT_DIR}/summary.json"
cat "${REPORT_DIR}/summary.json"
