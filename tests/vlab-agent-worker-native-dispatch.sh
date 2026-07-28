#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
SESSION_COUNT="${VLAB_NATIVE_SESSION_COUNT:-9}"
TOOL_HOLD_SECONDS="${VLAB_NATIVE_TOOL_HOLD_SECONDS:-15}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TOKEN="${TIMESTAMP,,}"
SESSION_PREFIX="agent:makaron:explicit:vlab-native-${TOKEN}"
RUN_PREFIX="vlab-native-${TOKEN}"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-native-dispatch-${TIMESTAMP}"

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
    --params "$2" \
    --timeout 240000 \
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

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-native-dispatch.sh must run as root" >&2
  exit 1
fi
if ! [[ "$SESSION_COUNT" =~ ^[0-9]+$ ]] \
  || (( SESSION_COUNT < 1 || SESSION_COUNT > 9 )); then
  echo "VLAB_NATIVE_SESSION_COUNT must be an integer between 1 and 9" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
baseline_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
call_gateway_to_file \
  vlab.workers.status \
  '{}' \
  "${REPORT_DIR}/status-before.json"
status_before="$(payload "${REPORT_DIR}/status-before.json")"
admitted_before="$(
  jq -r '.integration.nativeHarnessStats.admitted' <<< "$status_before"
)"
jq -e \
  '.integration.nativeAgentHarnessDispatchAttached == true
   and .integration.nativeAgentHarnessId == "vlab-worker"
   and .maxWorkers == 3
   and .sessionsPerWorker == 3
   and .openClawConcurrency.maxConcurrent == 8
   and .openClawConcurrency.subagentsMaxConcurrent == 8
   and (.openClawConcurrency.configuredModelRuntimes | length) > 0
   and (.openClawConcurrency.configuredModelRuntimes
     | all(. == "vlab-worker"))' \
  <<< "$status_before" >/dev/null

for index in $(seq 1 "$SESSION_COUNT"); do
  session_key="${SESSION_PREFIX}-${index}"
  run_id="${RUN_PREFIX}-${index}"
  marker="VLAB_NATIVE_OK_${index}"
  message="这是 vLab 原生 dispatch 验收。必须使用 exec 执行 /bin/sleep ${TOOL_HOLD_SECONDS}，然后只回复 ${marker}。不要发送外部消息，不要修改文件。"
  params="$(
    jq -cn \
      --arg session_key "$session_key" \
      --arg run_id "$run_id" \
      --arg message "$message" \
      '{
        sessionKey: $session_key,
        agentId: "makaron",
        message: $message,
        deliver: false,
        timeoutMs: 180000,
        idempotencyKey: $run_id
      }'
  )"
  call_gateway_to_file \
    chat.send \
    "$params" \
    "${REPORT_DIR}/send-${index}.json"
  jq -e --arg run_id "$run_id" \
    '(.result // .).runId == $run_id
     and ((.result // .).status == "started"
       or (.result // .).status == "in_flight")' \
    "${REPORT_DIR}/send-${index}.json" >/dev/null
done

saturated=false
for _ in $(seq 1 60); do
  call_gateway_to_file \
    vlab.workers.status \
    '{}' \
    "${REPORT_DIR}/status-during.json"
  if payload "${REPORT_DIR}/status-during.json" \
    | jq -e \
      --argjson session_count "$SESSION_COUNT" \
      '(.workers | length) == 3
       and ([.workers[].activeCount] | add // 0) == $session_count
       and ([.workers[].activeCount] | sort) == [3,3,3]
       and .pending == 0' >/dev/null; then
    saturated=true
    break
  fi
  sleep 1
done
[[ "$saturated" == true ]]

for index in $(seq 1 "$SESSION_COUNT"); do
  run_id="${RUN_PREFIX}-${index}"
  call_gateway_to_file \
    agent.wait \
    "$(jq -cn --arg run_id "$run_id" '{runId: $run_id, timeoutMs: 180000}')" \
    "${REPORT_DIR}/wait-${index}.json"
  jq -e \
    '(.result // .).status == "ok"
     or (.result // .).status == "succeeded"' \
    "${REPORT_DIR}/wait-${index}.json" >/dev/null

  session_key="${SESSION_PREFIX}-${index}"
  marker="VLAB_NATIVE_OK_${index}"
  call_gateway_to_file \
    chat.history \
    "$(jq -cn --arg session_key "$session_key" '{sessionKey: $session_key, limit: 30}')" \
    "${REPORT_DIR}/history-${index}.json"
  jq -e --arg marker "$marker" \
    '[(.result // .).messages[]?
      | select(.role == "assistant")
      | .content[]?
      | select(.type == "text")
      | .text]
     | any(contains($marker))' \
    "${REPORT_DIR}/history-${index}.json" >/dev/null
done

# Repeating chat.send with the same idempotency key must not enter the Harness
# or execute the model a second time.
call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session_key "${SESSION_PREFIX}-1" \
    --arg run_id "${RUN_PREFIX}-1" \
    '{
      sessionKey: $session_key,
      agentId: "makaron",
      message: "THIS_MUST_NOT_EXECUTE",
      deliver: false,
      timeoutMs: 180000,
      idempotencyKey: $run_id
    }')" \
  "${REPORT_DIR}/idempotent-retry.json"

call_gateway_to_file \
  vlab.workers.status \
  '{}' \
  "${REPORT_DIR}/status-after.json"
status_after="$(payload "${REPORT_DIR}/status-after.json")"
admitted_after="$(
  jq -r '.integration.nativeHarnessStats.admitted' <<< "$status_after"
)"
completed_after="$(
  jq -r '.integration.nativeHarnessStats.completed' <<< "$status_after"
)"
[[ "$((admitted_after - admitted_before))" == "$SESSION_COUNT" ]]
(( completed_after >= SESSION_COUNT ))
[[ "$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)" == "$baseline_restarts" ]]

jq -n \
  --arg reportDir "$REPORT_DIR" \
  --argjson sessionCount "$SESSION_COUNT" \
  --argjson admittedDelta "$((admitted_after - admitted_before))" \
  --argjson completed "$completed_after" \
  '{
    ok: true,
    entry: "chat.send -> native AgentHarness -> elastic worker",
    topology: "3 workers x 3 sessions",
    sessionCount: $sessionCount,
    nativeHarnessAdmittedDelta: $admittedDelta,
    nativeHarnessCompleted: $completed,
    idempotentRetryReexecuted: false,
    gatewayRestarted: false,
    reportDir: $reportDir
  }' \
  | tee "${REPORT_DIR}/summary.json"
