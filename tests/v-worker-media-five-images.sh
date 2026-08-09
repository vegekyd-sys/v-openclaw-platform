#!/usr/bin/env bash
set -Eeuo pipefail

STATE_ROOT="${OPENCLAW_STATE_DIR:-/home/openclaw/.openclaw}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${STATE_ROOT}/openclaw.json}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${STATE_ROOT}/workspace}"
NODE="${OPENCLAW_NODE:-/opt/node-v22.23.1/bin/node}"
OPENCLAW="${OPENCLAW_CLI:-/opt/openclaw-2026.7.1/node_modules/openclaw/openclaw.mjs}"
SERVICE="${OPENCLAW_SERVICE:-openclaw-gateway.service}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_PREFIX="agent:makaron:explicit:v-worker-media-021-comic-${TIMESTAMP,,}"
REPORT_DIR="${STATE_ROOT}/experiments/agent-worker-isolation-v1/acceptance/five-images-${TIMESTAMP}"
METRICS_PATH="${REPORT_DIR}/metrics.jsonl"
MONITOR_STOP="${REPORT_DIR}/monitor.stop"

run_openclaw() {
  sudo -u openclaw env \
    HOME=/home/openclaw \
    OPENCLAW_HOME=/home/openclaw \
    OPENCLAW_STATE_DIR="$STATE_ROOT" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" \
    "$NODE" "$OPENCLAW" "$@"
}

call_gateway() {
  run_openclaw gateway call "$1" \
    --params "$2" \
    --timeout 240000 \
    --json
}

payload() {
  jq -c '.result // .' "$1"
}

sample_metrics() {
  local status_file health_file
  status_file="${REPORT_DIR}/.status.json"
  health_file="${REPORT_DIR}/.health.json"
  if call_gateway vlab.workers.status '{}' > "$status_file" 2>/dev/null \
    && call_gateway health '{}' > "$health_file" 2>/dev/null; then
    jq -cn \
      --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --argjson status "$(payload "$status_file")" \
      --argjson health "$(payload "$health_file")" \
      --argjson memory_current "$(systemctl show "$SERVICE" -p MemoryCurrent --value)" \
      --argjson memory_peak "$(systemctl show "$SERVICE" -p MemoryPeak --value)" \
      --argjson restarts "$(systemctl show "$SERVICE" -p NRestarts --value)" \
      '{
        at: $at,
        workers: ($status.workers | length),
        active: ([$status.workers[].activeCount] | add // 0),
        detached: ([$status.workers[].detachedTaskCount] | add // 0),
        pending: $status.pending,
        media: $status.integration.mediaCompletionRelay,
        eventLoop: $health.eventLoop,
        memoryCurrent: $memory_current,
        memoryPeak: $memory_peak,
        nRestarts: $restarts
      }' >> "$METRICS_PATH"
  fi
}

monitor() {
  while [[ ! -f "$MONITOR_STOP" ]]; do
    sample_metrics
    sleep 2
  done
  sample_metrics
}

install -d -o openclaw -g openclaw -m 0700 "$REPORT_DIR"
call_gateway vlab.workers.status '{}' > "${REPORT_DIR}/status-before.json"
call_gateway health '{}' > "${REPORT_DIR}/health-before.json"
systemctl show "$SERVICE" \
  -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak \
  > "${REPORT_DIR}/service-before.txt"

monitor &
MONITOR_PID=$!
started_epoch="$(date +%s)"

declare -a request_pids=()
for index in $(seq 1 5); do
  session_key="${SESSION_PREFIX}-${index}"
  message="这是生产 V Worker 0.2.1 的真实并发验收，第 ${index}/5 张。请你以 V - Makaron 自己为主角，从你自己的身份、记忆和上周真实工作中，自由选择一个有趣且不同于其他测试图的片段，创作一张完整的四格漫画。四格要有连续剧情、中文对白和最后一格的小反转；画面应体现你自己的形象与性格。你必须只调用一次 image_generate；工具提示后台任务已启动后不要重复调用，只简短回复已启动，等待完成事件自动回到当前 Session。"
  params="$(
    jq -cn \
      --arg session_key "$session_key" \
      --arg message "$message" \
      '{
        sessionKey: $session_key,
        agentId: "makaron",
        message: $message,
        timeoutSeconds: 180,
        modelRun: false,
        toolsAllow: ["image_generate"]
      }'
  )"
  call_gateway vlab.workers.agent "$params" \
    > "${REPORT_DIR}/agent-${index}.json" 2>&1 &
  request_pids+=("$!")
done

request_failures=0
for request_pid in "${request_pids[@]}"; do
  if ! wait "$request_pid"; then
    request_failures=$((request_failures + 1))
  fi
done
[[ "$request_failures" == 0 ]]

declare -a session_files=()
for index in $(seq 1 5); do
  session_file="$(payload "${REPORT_DIR}/agent-${index}.json" | jq -r '.meta.sessionFile')"
  [[ -f "$session_file" ]]
  session_files+=("$session_file")
done

completed=0
for _ in $(seq 1 72); do
  completed=0
  for session_file in "${session_files[@]}"; do
    if grep -q 'A background task completed' "$session_file" \
      && grep -q 'MEDIA:' "$session_file"; then
      completed=$((completed + 1))
    fi
  done
  if [[ "$completed" == 5 ]]; then
    status_now="${REPORT_DIR}/status-completed.json"
    call_gateway vlab.workers.status '{}' > "$status_now"
    detached_now="$(payload "$status_now" | jq '[.workers[].detachedTaskCount] | add // 0')"
    [[ "$detached_now" == 0 ]] && break
  fi
  sleep 5
done

touch "$MONITOR_STOP"
wait "$MONITOR_PID"
[[ "$completed" == 5 ]]

images_path="${REPORT_DIR}/images.txt"
for index in $(seq 1 5); do
  session_file="${session_files[$((index - 1))]}"
  image_path="$(
    jq -r '
      select(.type == "message")
      | .message.content?
      | if type == "string" then .
        elif type == "array" then map(select(.type == "text") | .text) | join("\n")
        else ""
        end
    ' "$session_file" \
      | sed -n 's#.*MEDIA:\([^[:space:]]*\).*#\1#p' \
      | tail -n 1
  )"
  [[ -n "$image_path" && -f "$image_path" ]]
  printf '%s\n' "$image_path" >> "$images_path"
done

call_gateway vlab.workers.status '{}' > "${REPORT_DIR}/status-after.json"
call_gateway health '{}' > "${REPORT_DIR}/health-after.json"
systemctl show "$SERVICE" \
  -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak \
  > "${REPORT_DIR}/service-after.txt"

jq -s '
  {
    samples: length,
    maxWorkers: (map(.workers) | max),
    maxActive: (map(.active) | max),
    maxDetached: (map(.detached) | max),
    maxPending: (map(.pending) | max),
    eventLoopP99MaxMs: (map(.eventLoop.delayP99Ms // 0) | max),
    eventLoopUtilizationMax: (map(.eventLoop.utilization // 0) | max),
    memoryCurrentMax: (map(.memoryCurrent) | max),
    memoryPeakMax: (map(.memoryPeak) | max),
    nRestartsMax: (map(.nRestarts) | max)
  }
' "$METRICS_PATH" > "${REPORT_DIR}/metrics-summary.json"

ended_epoch="$(date +%s)"
jq -n \
  --arg report_dir "$REPORT_DIR" \
  --arg session_prefix "$SESSION_PREFIX" \
  --argjson duration_seconds "$((ended_epoch - started_epoch))" \
  --argjson metrics "$(cat "${REPORT_DIR}/metrics-summary.json")" \
  --argjson status_before "$(payload "${REPORT_DIR}/status-before.json")" \
  --argjson status_after "$(payload "${REPORT_DIR}/status-after.json")" \
  --argjson images "$(jq -Rsc 'split("\n") | map(select(length > 0))' "$images_path")" \
  '{
    ok: true,
    reportDir: $report_dir,
    sessionPrefix: $session_prefix,
    durationSeconds: $duration_seconds,
    images: $images,
    metrics: $metrics,
    mediaBefore: $status_before.integration.mediaCompletionRelay,
    mediaAfter: $status_after.integration.mediaCompletionRelay,
    finalPending: $status_after.pending,
    finalDetached: ([$status_after.workers[].detachedTaskCount] | add // 0),
    productionPromotionBlocked: $status_after.integration.productionPromotionBlocked
  }'
