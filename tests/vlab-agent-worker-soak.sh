#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
SESSION_COUNT="${VLAB_SOAK_SESSION_COUNT:-9}"
ROUNDS="${VLAB_SOAK_ROUNDS:-2}"
TOOL_HOLD_SECONDS="${VLAB_SOAK_TOOL_HOLD_SECONDS:-30}"
GATEWAY_TIMEOUT_MS="${VLAB_SOAK_GATEWAY_TIMEOUT_MS:-240000}"
MIN_DURATION_SECONDS="${VLAB_SOAK_MIN_DURATION_SECONDS:-180}"
MAX_DURATION_SECONDS="${VLAB_SOAK_MAX_DURATION_SECONDS:-360}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_TOKEN="$(printf '%s' "$TIMESTAMP" | tr '[:upper:]' '[:lower:]')"
SESSION_PREFIX="agent:makaron:explicit:vlab-worker-soak-${SESSION_TOKEN}"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-soak-${TIMESTAMP}"
METRICS_PATH="${REPORT_DIR}/metrics.jsonl"
MONITOR_STOP="${REPORT_DIR}/monitor.stop"
MONITOR_INTERVAL_SECONDS="${VLAB_SOAK_MONITOR_INTERVAL_SECONDS:-5}"
MAX_DEGRADED_RATIO="${VLAB_SOAK_MAX_DEGRADED_RATIO:-0.20}"
MAX_EVENT_LOOP_P99_MS="${VLAB_SOAK_MAX_EVENT_LOOP_P99_MS:-2000}"
MONITOR_PID=""

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

monitor_metrics() {
  local sample_index=0
  while [[ ! -f "$MONITOR_STOP" ]]; do
    sample_index=$((sample_index + 1))
    local health_path="${REPORT_DIR}/.monitor-health-${sample_index}.json"
    local status_path="${REPORT_DIR}/.monitor-status-${sample_index}.json"
    if call_gateway_to_file health '{}' "$health_path" \
      && call_gateway_to_file vlab.workers.status '{}' "$status_path"; then
      local memory_current
      local memory_peak
      local cpu_usage_nsec
      local restarts
      local worker_pids
      local worker_rss_kb=0
      local worker_cpu_percent=0
      memory_current="$(
        systemctl show openclaw-vlab-gateway.service -p MemoryCurrent --value
      )"
      memory_peak="$(
        systemctl show openclaw-vlab-gateway.service -p MemoryPeak --value
      )"
      cpu_usage_nsec="$(
        systemctl show openclaw-vlab-gateway.service -p CPUUsageNSec --value
      )"
      restarts="$(
        systemctl show openclaw-vlab-gateway.service -p NRestarts --value
      )"
      worker_pids="$(
        payload "$status_path" | jq -r '[.workers[].pid] | join(",")'
      )"
      if [[ -n "$worker_pids" ]]; then
        worker_rss_kb="$(
          ps -o rss= -p "$worker_pids" 2>/dev/null \
            | awk '{sum += $1} END {print sum + 0}'
        )"
        worker_cpu_percent="$(
          ps -o %cpu= -p "$worker_pids" 2>/dev/null \
            | awk '{sum += $1} END {printf "%.3f", sum + 0}'
        )"
      fi
      jq -cn \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --slurpfile health "$health_path" \
        --slurpfile status "$status_path" \
        --argjson memory_current "${memory_current:-0}" \
        --argjson memory_peak "${memory_peak:-0}" \
        --argjson cpu_usage_nsec "${cpu_usage_nsec:-0}" \
        --argjson restarts "${restarts:-0}" \
        --argjson worker_rss_kb "$worker_rss_kb" \
        --argjson worker_cpu_percent "$worker_cpu_percent" \
        '{
          timestamp: $timestamp,
          gateway: {
            eventLoop: (($health[0].result // $health[0]).eventLoop),
            memoryCurrentBytes: $memory_current,
            memoryPeakBytes: $memory_peak,
            cpuUsageNSec: $cpu_usage_nsec,
            restarts: $restarts
          },
          pool: (
            ($status[0].result // $status[0])
            | {
                workers: (.workers | length),
                activeSessions: ([.workers[].activeCount] | add // 0),
                pending,
                capacity: .maxActiveSessions
              }
          ),
          workers: {
            rssKb: $worker_rss_kb,
            cpuPercent: $worker_cpu_percent
          }
        }' >> "$METRICS_PATH"
    fi
    rm -f "$health_path" "$status_path"
    sleep "$MONITOR_INTERVAL_SECONDS"
  done
}

stop_monitor() {
  if [[ -n "$MONITOR_PID" ]]; then
    touch "$MONITOR_STOP"
    wait "$MONITOR_PID" || true
    MONITOR_PID=""
  fi
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
if ! [[ "$MIN_DURATION_SECONDS" =~ ^[0-9]+$ ]] \
  || ! [[ "$MAX_DURATION_SECONDS" =~ ^[0-9]+$ ]] \
  || (( MIN_DURATION_SECONDS > MAX_DURATION_SECONDS )); then
  echo "vLab soak duration bounds must be non-negative integers with min <= max" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
trap stop_monitor EXIT
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
sessions_per_worker="$(
  payload "${REPORT_DIR}/status-before.json" | jq -r '.sessionsPerWorker'
)"
max_active_sessions="$(
  payload "${REPORT_DIR}/status-before.json" | jq -r '.maxActiveSessions'
)"
[[ "$max_workers" == "3" ]]
[[ "$sessions_per_worker" == "3" ]]
[[ "$max_active_sessions" == "9" ]]
(( SESSION_COUNT <= max_active_sessions ))
expected_workers="$(
  jq -nr \
    --argjson sessions "$SESSION_COUNT" \
    --argjson per_worker "$sessions_per_worker" \
    --argjson min_workers "$(payload "${REPORT_DIR}/status-before.json" | jq -r '.minWorkers')" \
    --argjson max_workers "$max_workers" \
    '[
      $max_workers,
      ([
        $min_workers,
        (($sessions / $per_worker) | ceil)
      ] | max)
    ] | min'
)"
record_service_sample "${REPORT_DIR}/service-before.txt"
monitor_metrics &
MONITOR_PID=$!

declare -a session_ids=()
for index in $(seq 1 "$SESSION_COUNT"); do
  session_ids+=("")
done

workload_started_epoch="$(date +%s)"
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

  scaled_workers=0
  pending_requests="$SESSION_COUNT"
  for _ in $(seq 1 12); do
    call_gateway_to_file \
      vlab.workers.status \
      '{}' \
      "${REPORT_DIR}/status-r${round}-during.json"
    scaled_workers="$(
      payload "${REPORT_DIR}/status-r${round}-during.json" \
        | jq -r '.workers | length'
    )"
    pending_requests="$(
      payload "${REPORT_DIR}/status-r${round}-during.json" \
        | jq -r '.pending'
    )"
    active_requests="$(
      payload "${REPORT_DIR}/status-r${round}-during.json" \
        | jq -r '[.workers[].activeCount] | add // 0'
    )"
    if [[ "$scaled_workers" == "$expected_workers" ]] \
      && [[ "$active_requests" == "$SESSION_COUNT" ]] \
      && [[ "$pending_requests" == "0" ]]; then
      break
    fi
    sleep 1
  done
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
      '((.result // .).meta.sessionId | type) == "string"
       and ((.result // .).meta.sessionId | length) > 0' \
      "$result_path" >/dev/null
    current_session_id="$(
      payload "$result_path" | jq -r '.meta.sessionId'
    )"
    if [[ "$round" == "1" ]]; then
      session_ids[$((index - 1))]="$current_session_id"
    else
      [[ "${session_ids[$((index - 1))]}" == "$current_session_id" ]]
    fi
  done

  [[ "$scaled_workers" == "$expected_workers" ]]
  [[ "$active_requests" == "$SESSION_COUNT" ]]
  [[ "$pending_requests" == "0" ]]
  jq -e \
    '(.result // .).eventLoop.degraded == false' \
    "${REPORT_DIR}/health-r${round}-during.json" >/dev/null
done
workload_ended_epoch="$(date +%s)"

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
for index in $(seq 1 "$SESSION_COUNT"); do
  session_key="${SESSION_PREFIX}-${index}"
  expected_session_id="${session_ids[$((index - 1))]}"
  jq -e \
    --arg session_key "$session_key" \
    --arg expected_session_id "$expected_session_id" \
    '(.result // .).sessions
     | any(
         ((.key | ascii_downcase) == ($session_key | ascii_downcase))
         and .sessionId == $expected_session_id
       )' \
    "${REPORT_DIR}/sessions.json" >/dev/null
done

call_gateway_to_file health '{}' "${REPORT_DIR}/health-after.json"
call_gateway_to_file \
  vlab.workers.status \
  '{}' \
  "${REPORT_DIR}/status-after.json"
record_service_sample "${REPORT_DIR}/service-after.txt"
final_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
stop_monitor
[[ "$baseline_restarts" == "$final_restarts" ]]
jq -e \
  '(.result // .).eventLoop.degraded == false' \
  "${REPORT_DIR}/health-after.json" >/dev/null

ended_epoch="$(date +%s)"
total_duration_seconds="$((ended_epoch - started_epoch))"
workload_duration_seconds="$((workload_ended_epoch - workload_started_epoch))"
(( workload_duration_seconds >= MIN_DURATION_SECONDS ))
(( workload_duration_seconds <= MAX_DURATION_SECONDS ))

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
metrics_summary="$(
  jq -s '{
    samples: length,
    degradedSamples: ([.[] | select(.gateway.eventLoop.degraded == true)] | length),
    maxEventLoopUtilization: ([.[].gateway.eventLoop.utilization] | max // 0),
    maxEventLoopDelayP99Ms: ([.[].gateway.eventLoop.delayP99Ms] | max // 0),
    maxEventLoopDelayMaxMs: ([.[].gateway.eventLoop.delayMaxMs] | max // 0),
    maxGatewayCpuCoreRatio: ([.[].gateway.eventLoop.cpuCoreRatio] | max // 0),
    maxGatewayMemoryCurrentBytes: ([.[].gateway.memoryCurrentBytes] | max // 0),
    maxGatewayMemoryPeakBytes: ([.[].gateway.memoryPeakBytes] | max // 0),
    maxWorkerRssKb: ([.[].workers.rssKb] | max // 0),
    maxWorkerCpuPercent: ([.[].workers.cpuPercent] | max // 0),
    peakWorkers: ([.[].pool.workers] | max // 0),
    peakActiveSessions: ([.[].pool.activeSessions] | max // 0),
    maxPending: ([.[].pool.pending] | max // 0)
  }' "$METRICS_PATH"
)"
[[ "$(jq -r '.samples > 0' <<< "$metrics_summary")" == "true" ]]
[[ "$(jq -r '.peakActiveSessions' <<< "$metrics_summary")" == "$SESSION_COUNT" ]]
event_loop_stress_slo_met="$(
  jq -nr \
    --argjson metrics "$metrics_summary" \
    --argjson max_degraded_ratio "$MAX_DEGRADED_RATIO" \
    --argjson max_p99_ms "$MAX_EVENT_LOOP_P99_MS" \
    '($metrics.degradedSamples / $metrics.samples) <= $max_degraded_ratio
     and $metrics.maxEventLoopDelayP99Ms <= $max_p99_ms'
)"

jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg session_prefix "$SESSION_PREFIX" \
  --argjson workload_duration_seconds "$workload_duration_seconds" \
  --argjson total_duration_seconds "$total_duration_seconds" \
  --argjson session_count "$SESSION_COUNT" \
  --argjson rounds "$ROUNDS" \
  --argjson tool_hold_seconds "$TOOL_HOLD_SECONDS" \
  --argjson native_session_count "$native_session_count" \
  --argjson peak_worker_count "$peak_worker_count" \
  --argjson unique_worker_pids "$unique_worker_pids" \
  --argjson sessions_per_worker "$sessions_per_worker" \
  --argjson expected_workers "$expected_workers" \
  --argjson max_active_sessions "$max_active_sessions" \
  --argjson metrics "$metrics_summary" \
  --argjson event_loop_stress_slo_met "$event_loop_stress_slo_met" \
  --argjson max_degraded_ratio "$MAX_DEGRADED_RATIO" \
  --argjson max_event_loop_p99_ms "$MAX_EVENT_LOOP_P99_MS" \
  --arg baseline_restarts "$baseline_restarts" \
  --arg final_restarts "$final_restarts" \
  '{
    ok: true,
    timestamp: $timestamp,
    durationSeconds: $workload_duration_seconds,
    workloadDurationSeconds: $workload_duration_seconds,
    totalDurationSeconds: $total_duration_seconds,
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
      sessionsPerWorker: $sessions_per_worker,
      expectedForLoad: $expected_workers,
      maxActiveSessions: $max_active_sessions,
      uniquePidsAcrossRun: $unique_worker_pids,
      pendingDuringSamples: 0
    },
    gateway: {
      eventLoopRecoveredAtEnd: true,
      eventLoopZeroDegradationTargetMet: ($metrics.degradedSamples == 0),
      eventLoopStressSloMet: $event_loop_stress_slo_met,
      eventLoopStressSlo: {
        maxDegradedRatio: $max_degraded_ratio,
        maxEventLoopDelayP99Ms: $max_event_loop_p99_ms
      },
      restartsBefore: $baseline_restarts,
      restartsAfter: $final_restarts
    },
    metrics: $metrics
  }' > "${REPORT_DIR}/summary.json"
chown vlab:vlab "${REPORT_DIR}/summary.json"
chmod 0600 "${REPORT_DIR}/summary.json"

cat "${REPORT_DIR}/summary.json"
[[ "$event_loop_stress_slo_met" == "true" ]]
