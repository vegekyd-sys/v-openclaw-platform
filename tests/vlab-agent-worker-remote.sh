#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-elastic-acceptance-${TIMESTAMP}"
HOLD_DURATION_MS="${VLAB_ELASTIC_HOLD_DURATION_MS:-5000}"

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
    --params "$2" \
    --json
}

payload() {
  jq -c '.result // .' "$1"
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-remote.sh must run as root" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
baseline_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
call_gateway vlab.workers.status '{}' > "${REPORT_DIR}/status-before.json"
min_workers="$(
  payload "${REPORT_DIR}/status-before.json" | jq -r '.minWorkers'
)"
max_workers="$(
  payload "${REPORT_DIR}/status-before.json" | jq -r '.maxWorkers'
)"
idle_timeout_ms="$(
  payload "${REPORT_DIR}/status-before.json" | jq -r '.idleTimeoutMs'
)"
initial_workers="$(
  payload "${REPORT_DIR}/status-before.json" | jq -r '.workers | length'
)"
[[ "$initial_workers" == "$min_workers" ]]

declare -a request_pids=()
for index in $(seq 1 "$max_workers"); do
  session_key="agent:makaron:explicit:vlab-worker-elastic-${index}"
  call_gateway \
    vlab.workers.hold \
    "{\"sessionKey\":\"${session_key}\",\"durationMs\":${HOLD_DURATION_MS}}" \
    > "${REPORT_DIR}/hold-${index}.json" &
  request_pids+=("$!")
done

scaled_workers=0
for _ in $(seq 1 100); do
  if ! call_gateway vlab.workers.status '{}' \
    > "${REPORT_DIR}/status-during.json.tmp"; then
    rm -f "${REPORT_DIR}/status-during.json.tmp"
    sleep 0.1
    continue
  fi
  mv \
    "${REPORT_DIR}/status-during.json.tmp" \
    "${REPORT_DIR}/status-during.json"
  scaled_workers="$(
    payload "${REPORT_DIR}/status-during.json" | jq -r '.workers | length'
  )"
  if [[ "$scaled_workers" == "$max_workers" ]]; then
    break
  fi
  sleep 0.1
done
[[ "$scaled_workers" == "$max_workers" ]]
call_gateway health '{}' > "${REPORT_DIR}/health-during.json"

for request_pid in "${request_pids[@]}"; do
  wait "$request_pid"
done

worker_pids="$(
  for index in $(seq 1 "$max_workers"); do
    payload "${REPORT_DIR}/hold-${index}.json" | jq -r '.workerPid'
  done | sort -u
)"
unique_worker_count="$(printf '%s\n' "$worker_pids" | sed '/^$/d' | wc -l | tr -d ' ')"
[[ "$unique_worker_count" == "$max_workers" ]]

sticky_session="agent:makaron:explicit:vlab-worker-elastic-sticky"
call_gateway \
  vlab.workers.hold \
  "{\"sessionKey\":\"${sticky_session}\",\"durationMs\":1000}" \
  > "${REPORT_DIR}/sticky-hold.json" &
sticky_hold_pid=$!
sleep 0.1
call_gateway \
  vlab.workers.ping \
  "{\"sessionKey\":\"${sticky_session}\"}" \
  > "${REPORT_DIR}/sticky-ping.json" &
sticky_ping_pid=$!
wait "$sticky_hold_pid"
wait "$sticky_ping_pid"
sticky_hold_worker="$(
  payload "${REPORT_DIR}/sticky-hold.json" | jq -r '.workerPid'
)"
sticky_ping_worker="$(
  payload "${REPORT_DIR}/sticky-ping.json" | jq -r '.workerPid'
)"
[[ "$sticky_hold_worker" == "$sticky_ping_worker" ]]

scale_down_timeout_seconds="$((idle_timeout_ms / 1000 + 45))"
scale_down_deadline="$((SECONDS + scale_down_timeout_seconds))"
final_workers="$max_workers"
while (( SECONDS < scale_down_deadline )); do
  if ! call_gateway vlab.workers.status '{}' \
    > "${REPORT_DIR}/status-after.json.tmp"; then
    rm -f "${REPORT_DIR}/status-after.json.tmp"
    sleep 1
    continue
  fi
  mv \
    "${REPORT_DIR}/status-after.json.tmp" \
    "${REPORT_DIR}/status-after.json"
  final_workers="$(
    payload "${REPORT_DIR}/status-after.json" | jq -r '.workers | length'
  )"
  if [[ "$final_workers" == "$min_workers" ]]; then
    break
  fi
  sleep 1
done
[[ "$final_workers" == "$min_workers" ]]

final_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
[[ "$baseline_restarts" == "$final_restarts" ]]
jq -e '(.result // .).eventLoop.degraded == false' \
  "${REPORT_DIR}/health-during.json" >/dev/null

jq -n \
  --arg timestamp "$TIMESTAMP" \
  --argjson min_workers "$min_workers" \
  --argjson max_workers "$max_workers" \
  --argjson scaled_workers "$scaled_workers" \
  --argjson final_workers "$final_workers" \
  --argjson idle_timeout_ms "$idle_timeout_ms" \
  --argjson unique_worker_count "$unique_worker_count" \
  --arg sticky_session "$sticky_session" \
  --arg sticky_worker "$sticky_hold_worker" \
  --arg baseline_restarts "$baseline_restarts" \
  --arg final_restarts "$final_restarts" \
  '{
    ok: true,
    timestamp: $timestamp,
    workers: {
      min: $min_workers,
      max: $max_workers,
      scaled: $scaled_workers,
      final: $final_workers,
      uniquePids: $unique_worker_count,
      idleTimeoutMs: $idle_timeout_ms
    },
    stickySession: {
      sessionKey: $sticky_session,
      workerPid: $sticky_worker
    },
    gatewayRestarts: {
      before: $baseline_restarts,
      after: $final_restarts
    }
  }' \
  > "${REPORT_DIR}/summary.json"
chown vlab:vlab "${REPORT_DIR}/summary.json"
chmod 0600 "${REPORT_DIR}/summary.json"

cat "${REPORT_DIR}/summary.json"
