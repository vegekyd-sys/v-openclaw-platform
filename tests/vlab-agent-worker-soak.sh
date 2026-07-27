#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
SESSION_COUNT="${VLAB_SOAK_SESSION_COUNT:-8}"
ROUNDS="${VLAB_SOAK_ROUNDS:-4}"
TOOL_HOLD_SECONDS="${VLAB_SOAK_TOOL_HOLD_SECONDS:-40}"
GATEWAY_TIMEOUT_MS="${VLAB_SOAK_GATEWAY_TIMEOUT_MS:-240000}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_PREFIX="agent:makaron:explicit:vlab-worker-soak-${TIMESTAMP}"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-soak-${TIMESTAMP}"

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
    --params "$2" \
    --timeout "$GATEWAY_TIMEOUT_MS" \
    --json
}

call_gateway_to_file() {
  local method="$1"
  local params="$2"
  local output_path="$3"
  local temp_path="${output_path}.tmp"
  local call_exit

  set +e
  call_gateway "$method" "$params" > "$temp_path"
  call_exit=$?
  set -e
  if jq -e '.' "$temp_path" >/dev/null 2>&1; then
    mv "$temp_path" "$output_path"
    return 0
  fi
  rm -f "$temp_path"
  return "$call_exit"
}

payload() {
  jq -c '.result // .' "$1"
}

record_service_sample() {
  local output_path="$1"
  systemctl show openclaw-vlab-gateway.service \
    -p MainPID \
    -p NRestarts \
    -p MemoryCurrent \
    -p MemoryPeak \
    -p CPUUsageNSec \
    --value > "$output_path"
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-soak.sh must run as root" >&2
  exit 1
fi
if ! [[ "$SESSION_COUNT" =~ ^[0-9]+$ ]] \
  || (( SESSION_COUNT < 2 || SESSION_COUNT > 16 )); then
  echo "VLAB_SOAK_SESSION_COUNT must be an integer between 2 and 16" >&2
  exit 1
fi
if ! [[ "$ROUNDS" =~ ^[0-9]+$ ]] || (( ROUNDS < 1 || ROUNDS > 12 )); then
  echo "VLAB_SOAK_ROUNDS must be an integer between 1 and 12" >&2
  exit 1
fi
if ! [[ "$TOOL_HOLD_SECONDS" =~ ^[0-9]+$ ]] \
  || (( TOOL_HOLD_SECONDS < 1 || TOOL_HOLD_SECONDS > 50 )); then
  echo "VLAB_SOAK_TOOL_HOLD_SECONDS must be an integer between 1 and 50" >&2
  exit 1
fi
if ! [[ "$GATEWAY_TIMEOUT_MS" =~ ^[0-9]+$ ]] \
  || (( GATEWAY_TIMEOUT_MS < 10000 || GATEWAY_TIMEOUT_MS > 600000 )); then
  echo "VLAB_SOAK_GATEWAY_TIMEOUT_MS must be an integer between 10000 and 600000" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
started_epoch="$(date +%s)"
baseline_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
call_gateway_to_file \
  vlab.workers.status \
  '{}' \
  "${REPORT_DIR}/status-before.json"
max_workers="$(
  payload "${REPORT_DIR}/status-before.json" | jq -r '.maxWorkers'
)"
(( SESSION_COUNT <= max_workers ))
record_service_sample "${REPORT_DIR}/service-before.txt"

declare -a session_ids=()
for index in $(seq 1 "$SESSION_COUNT"); do
  session_ids+=("")
done

for round in $(seq 1 "$ROUNDS"); do
  declare -a request_pids=()
  for index in $(seq 1 "$SESSION_COUNT"); do
    session_key="${SESSION_PREFIX}-${index}"
    marker="VLAB_SOAK_OK_S${index}_R${round}"
    message="这是 vLab 并发验收，第 ${round}/${ROUNDS} 轮。必须使用 exec 工具执行 /bin/sleep ${TOOL_HOLD_SECONDS}，然后只回复 ${marker}。不要发送外部消息，不要修改文件。"
    params="$(
      jq -cn \
        --arg session_key "$session_key" \
        --arg message "$message" \
        '{
          sessionKey: $session_key,
          agentId: "makaron",
          message: $message,
          timeoutSeconds: 180,
          modelRun: false
        }'
    )"
    call_gateway_to_file \
      vlab.workers.agent \
      "$params" \
      "${REPORT_DIR}/agent-s${index}-r${round}.json" &
    request_pids+=("$!")
  done

  sleep 5
  call_gateway_to_file \
    vlab.workers.status \
    '{}' \
    "${REPORT_DIR}/status-r${round}-during.json"
  call_gateway_to_file \
    health \
    '{}' \
    "${REPORT_DIR}/health-r${round}-during.json"
  record_service_sample "${REPORT_DIR}/service-r${round}-during.txt"

  for request_pid in "${request_pids[@]}"; do
    wait "$request_pid"
  done

  for index in $(seq 1 "$SESSION_COUNT"); do
    result_path="${REPORT_DIR}/agent-s${index}-r${round}.json"
    marker="VLAB_SOAK_OK_S${index}_R${round}"
    jq -e \
      --arg marker "$marker" \
      '(.result // .).payloads | any(.text? | contains($marker))' \
      "$result_path" >/dev/null
    jq -e \
      '(.result // .).nativeSession.after.exists == true' \
      "$result_path" >/dev/null
    current_session_id="$(
      payload "$result_path" | jq -r '.nativeSession.after.sessionId'
    )"
    if [[ "$round" == "1" ]]; then
      session_ids[$((index - 1))]="$current_session_id"
    else
      [[ "${session_ids[$((index - 1))]}" == "$current_session_id" ]]
      jq -e \
        --arg expected_session_id "$current_session_id" \
        '(.result // .).nativeSession.before.sessionId == $expected_session_id' \
        "$result_path" >/dev/null
    fi
  done

  jq -e \
    --argjson expected "$SESSION_COUNT" \
    '(.result // .).workers | length == $expected' \
    "${REPORT_DIR}/status-r${round}-during.json" >/dev/null
  jq -e \
    '(.result // .).pending == 0' \
    "${REPORT_DIR}/status-r${round}-during.json" >/dev/null
  jq -e \
    '(.result // .).eventLoop.degraded == false' \
    "${REPORT_DIR}/health-r${round}-during.json" >/dev/null
done

for index in $(seq 1 "$SESSION_COUNT"); do
  session_key="${SESSION_PREFIX}-${index}"
  call_gateway_to_file \
    chat.history \
    "$(jq -cn --arg session_key "$session_key" '{sessionKey: $session_key, limit: 100}')" \
    "${REPORT_DIR}/history-s${index}.json"
  jq -e \
    --argjson rounds "$ROUNDS" \
    '[.messages[] | select(.role == "assistant")
      | .content[]?
      | select(.type == "toolCall" and .name == "exec")]
     | length >= $rounds' \
    "${REPORT_DIR}/history-s${index}.json" >/dev/null
  jq -e \
    '[.messages[] | select(.role == "toolResult" and .isError == true)]
     | length == 0' \
    "${REPORT_DIR}/history-s${index}.json" >/dev/null
done

call_gateway_to_file \
  sessions.list \
  "$(jq -cn --arg search "${SESSION_PREFIX#agent:makaron:explicit:}" --argjson limit "$SESSION_COUNT" '{search: $search, limit: $limit}')" \
  "${REPORT_DIR}/sessions.json"
native_session_count="$(
  payload "${REPORT_DIR}/sessions.json" | jq -r '.sessions | length'
)"
[[ "$native_session_count" == "$SESSION_COUNT" ]]

call_gateway_to_file health '{}' "${REPORT_DIR}/health-after.json"
call_gateway_to_file \
  vlab.workers.status \
  '{}' \
  "${REPORT_DIR}/status-after.json"
record_service_sample "${REPORT_DIR}/service-after.txt"
final_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
[[ "$baseline_restarts" == "$final_restarts" ]]
jq -e \
  '(.result // .).eventLoop.degraded == false' \
  "${REPORT_DIR}/health-after.json" >/dev/null

ended_epoch="$(date +%s)"
duration_seconds="$((ended_epoch - started_epoch))"
(( duration_seconds >= 180 ))
(( duration_seconds <= 360 ))

peak_worker_count="$(
  jq -s \
    '[.[] | (.result // .).workers | length] | max' \
    "${REPORT_DIR}"/status-r*-during.json
)"
unique_worker_pids="$(
  jq -s \
    '[.[] | (.result // .).workerPid] | unique | length' \
    "${REPORT_DIR}"/agent-s*-r*.json
)"

jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg session_prefix "$SESSION_PREFIX" \
  --argjson duration_seconds "$duration_seconds" \
  --argjson session_count "$SESSION_COUNT" \
  --argjson rounds "$ROUNDS" \
  --argjson tool_hold_seconds "$TOOL_HOLD_SECONDS" \
  --argjson native_session_count "$native_session_count" \
  --argjson peak_worker_count "$peak_worker_count" \
  --argjson unique_worker_pids "$unique_worker_pids" \
  --arg baseline_restarts "$baseline_restarts" \
  --arg final_restarts "$final_restarts" \
  '{
    ok: true,
    timestamp: $timestamp,
    durationSeconds: $duration_seconds,
    workload: {
      sessionCount: $session_count,
      rounds: $rounds,
      realAgentTurns: ($session_count * $rounds),
      toolHoldSecondsPerTurn: $tool_hold_seconds
    },
    nativeSessions: {
      prefix: $session_prefix,
      visibleCount: $native_session_count,
      sessionIdsStableAcrossRounds: true,
      execToolCallsVerified: true
    },
    workers: {
      peak: $peak_worker_count,
      uniquePidsAcrossRun: $unique_worker_pids,
      pendingDuringSamples: 0
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
