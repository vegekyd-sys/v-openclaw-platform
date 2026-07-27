#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-elastic-acceptance-${TIMESTAMP}"
HOLD_DURATION_MS="${VLAB_ELASTIC_HOLD_DURATION_MS:-20000}"

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
    --params "$2" \
    --timeout 90000 \
    --json
}

call_gateway_to_file() {
  local method="$1"
  local params="$2"
  local output_path="$3"
  local temp_path="${output_path}.tmp"
  call_gateway "$method" "$params" > "$temp_path"
  jq -e '.' "$temp_path" >/dev/null
  mv "$temp_path" "$output_path"
}

payload() {
  jq -c '.result // .' "$1"
}

wait_for_operation() {
  local operation_id="$1"
  local expected_state="$2"
  local output_path="$3"
  for _ in $(seq 1 100); do
    call_gateway_to_file \
      vlab.workers.operation \
      "$(jq -cn --arg operation_id "$operation_id" '{operationId: $operation_id}')" \
      "$output_path"
    if [[ "$(payload "$output_path" | jq -r '.state')" == "$expected_state" ]]; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-remote.sh must run as root" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
baseline_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
call_gateway_to_file vlab.workers.status '{}' "${REPORT_DIR}/status-before.json"
status_before="$(payload "${REPORT_DIR}/status-before.json")"
min_workers="$(jq -r '.minWorkers' <<< "$status_before")"
max_workers="$(jq -r '.maxWorkers' <<< "$status_before")"
sessions_per_worker="$(jq -r '.sessionsPerWorker' <<< "$status_before")"
max_active_sessions="$(jq -r '.maxActiveSessions' <<< "$status_before")"
idle_timeout_ms="$(jq -r '.idleTimeoutMs' <<< "$status_before")"
[[ "$max_workers" == "3" ]]
[[ "$sessions_per_worker" == "3" ]]
[[ "$max_active_sessions" == "9" ]]
jq -e \
  '.openClawConcurrency.maxConcurrent == 3
   and .openClawConcurrency.subagentsMaxConcurrent == 1
   and .integration.nativeAgentHarnessDispatchAttached == false
   and .integration.productionPromotionBlocked == true' \
  <<< "$status_before" >/dev/null

if [[ "$(jq -r '.workers | length' <<< "$status_before")" != "$min_workers" ]]; then
  sleep "$((idle_timeout_ms / 1000 + 35))"
fi

declare -a request_pids=()
for index in $(seq 1 "$max_active_sessions"); do
  call_gateway_to_file \
    vlab.workers.hold \
    "{\"sessionKey\":\"agent:makaron:explicit:vlab-worker-elastic-${index}\",\"durationMs\":${HOLD_DURATION_MS}}" \
    "${REPORT_DIR}/hold-${index}.json" &
  request_pids+=("$!")
done

for _ in $(seq 1 100); do
  call_gateway_to_file \
    vlab.workers.status \
    '{}' \
    "${REPORT_DIR}/status-saturated.json"
  saturated="$(
    payload "${REPORT_DIR}/status-saturated.json" \
      | jq -r '(.workers | length) == 3
        and ([.workers[].activeCount] | add) == 9
        and ([.workers[].activeCount] | sort) == [3,3,3]
        and .pending == 0'
  )"
  [[ "$saturated" == "true" ]] && break
  sleep 0.1
done
[[ "$saturated" == "true" ]]
call_gateway_to_file health '{}' "${REPORT_DIR}/health-saturated.json"

for request_pid in "${request_pids[@]}"; do
  wait "$request_pid"
done

worker_distribution="$(
  for index in $(seq 1 "$max_active_sessions"); do
    payload "${REPORT_DIR}/hold-${index}.json" | jq -r '.workerPid'
  done | sort | uniq -c | awk '{print $1}' | sort -n | tr '\n' ' '
)"
[[ "$worker_distribution" == "3 3 3 " ]]

declare -a capped_pids=()
for index in $(seq 1 10); do
  call_gateway_to_file \
    vlab.workers.hold \
    "{\"sessionKey\":\"agent:makaron:explicit:vlab-worker-capped-${index}\",\"durationMs\":${HOLD_DURATION_MS}}" \
    "${REPORT_DIR}/capped-${index}.json" &
  capped_pids+=("$!")
done
for _ in $(seq 1 100); do
  call_gateway_to_file \
    vlab.workers.status \
    '{}' \
    "${REPORT_DIR}/status-capped.json"
  pending="$(
    payload "${REPORT_DIR}/status-capped.json" | jq -r '.pending'
  )"
  [[ "$pending" == "1" ]] && break
  sleep 0.1
done
[[ "$pending" == "1" ]]
for request_pid in "${capped_pids[@]}"; do
  wait "$request_pid"
done

crash_key="crash-${TIMESTAMP}"
call_gateway_to_file \
  vlab.workers.start \
  "$(jq -cn --arg key "$crash_key" '{
    idempotencyKey: $key,
    kind: "hold",
    sessionKey: "agent:makaron:explicit:vlab-worker-crash",
    durationMs: 10000
  }')" \
  "${REPORT_DIR}/crash-start.json"
crash_operation="$(
  payload "${REPORT_DIR}/crash-start.json" | jq -r '.operation.operationId'
)"
crash_request="$(
  payload "${REPORT_DIR}/crash-start.json" | jq -r '.operation.requestId'
)"
for _ in $(seq 1 100); do
  call_gateway_to_file \
    vlab.workers.status \
    '{}' \
    "${REPORT_DIR}/status-before-crash.json"
  crash_slot="$(
    payload "${REPORT_DIR}/status-before-crash.json" \
      | jq -r --arg request_id "$crash_request" \
        '.workers[]
         | select(any(.active[]; .requestId == $request_id))
         | .slot' \
      | head -n 1
  )"
  [[ -n "$crash_slot" ]] && break
  sleep 0.1
done
[[ -n "$crash_slot" ]]
call_gateway_to_file \
  vlab.workers.kill \
  "$(jq -cn --argjson slot "$crash_slot" '{slot: $slot}')" \
  "${REPORT_DIR}/crash-kill.json"
jq -e '(.result // .).terminated == true' \
  "${REPORT_DIR}/crash-kill.json" >/dev/null
wait_for_operation \
  "$crash_operation" \
  failed \
  "${REPORT_DIR}/crash-operation.json"

call_gateway_to_file \
  vlab.workers.start \
  "$(jq -cn --arg key "$crash_key" '{
    idempotencyKey: $key,
    kind: "hold",
    sessionKey: "agent:makaron:explicit:vlab-worker-crash",
    durationMs: 10000
  }')" \
  "${REPORT_DIR}/crash-deduplicated.json"
jq -e \
  --arg operation_id "$crash_operation" \
  '(.result // .).deduplicated == true
   and (.result // .).operation.operationId == $operation_id
   and (.result // .).operation.state == "failed"' \
  "${REPORT_DIR}/crash-deduplicated.json" >/dev/null

cancel_key="cancel-${TIMESTAMP}"
call_gateway_to_file \
  vlab.workers.start \
  "$(jq -cn --arg key "$cancel_key" '{
    idempotencyKey: $key,
    kind: "hold",
    sessionKey: "agent:makaron:explicit:vlab-worker-cancel",
    durationMs: 10000
  }')" \
  "${REPORT_DIR}/cancel-start.json"
cancel_operation="$(
  payload "${REPORT_DIR}/cancel-start.json" | jq -r '.operation.operationId'
)"
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

recovery_key="recovery-${TIMESTAMP}"
call_gateway_to_file \
  vlab.workers.start \
  "$(jq -cn --arg key "$recovery_key" '{
    idempotencyKey: $key,
    kind: "hold",
    sessionKey: "agent:makaron:explicit:vlab-worker-recovery",
    durationMs: 50
  }')" \
  "${REPORT_DIR}/recovery-start.json"
recovery_operation="$(
  payload "${REPORT_DIR}/recovery-start.json" | jq -r '.operation.operationId'
)"
wait_for_operation \
  "$recovery_operation" \
  succeeded \
  "${REPORT_DIR}/recovery-operation.json"

final_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
[[ "$baseline_restarts" == "$final_restarts" ]]
jq -e '(.result // .).eventLoop.degraded == false' \
  "${REPORT_DIR}/health-saturated.json" >/dev/null

jq -n \
  --arg timestamp "$TIMESTAMP" \
  --argjson workers "$max_workers" \
  --argjson sessions_per_worker "$sessions_per_worker" \
  --argjson capacity "$max_active_sessions" \
  --arg distribution "$worker_distribution" \
  --arg crash_operation "$crash_operation" \
  --arg cancel_operation "$cancel_operation" \
  --arg recovery_operation "$recovery_operation" \
  --arg baseline_restarts "$baseline_restarts" \
  --arg final_restarts "$final_restarts" \
  '{
    ok: true,
    timestamp: $timestamp,
    topology: {
      maxWorkers: $workers,
      sessionsPerWorker: $sessions_per_worker,
      capacity: $capacity,
      pidDistribution: $distribution,
      tenthSessionQueued: true
    },
    recovery: {
      activeWorkerCrashFailedInFlight: true,
      idempotencyReusedTerminalResult: true,
      activeCancellation: true,
      newIdempotencyKeyRecovered: true,
      crashOperation: $crash_operation,
      cancelOperation: $cancel_operation,
      recoveryOperation: $recovery_operation
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
