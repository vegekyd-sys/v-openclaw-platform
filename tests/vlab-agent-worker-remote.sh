#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-acceptance-${TIMESTAMP}"
SESSION_A="agent:makaron:explicit:vlab-worker-acceptance-a"
SESSION_B="agent:makaron:explicit:vlab-worker-acceptance-b"

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

call_gateway \
  vlab.workers.ping \
  "{\"sessionKey\":\"${SESSION_A}\"}" \
  > "${REPORT_DIR}/slot-a.json"
slot_a="$(payload "${REPORT_DIR}/slot-a.json" | jq -r '.slot')"
for suffix in b b-alt b-alt-2 b-alt-3; do
  SESSION_B="agent:makaron:explicit:vlab-worker-acceptance-${suffix}"
  call_gateway \
    vlab.workers.ping \
    "{\"sessionKey\":\"${SESSION_B}\"}" \
    > "${REPORT_DIR}/slot-b.json"
  slot_b="$(payload "${REPORT_DIR}/slot-b.json" | jq -r '.slot')"
  if [[ "$slot_a" != "$slot_b" ]]; then
    break
  fi
done
[[ "$slot_a" != "$slot_b" ]]

parallel_started_ns="$(date +%s%N)"
call_gateway \
  vlab.workers.cpu \
  "{\"sessionKey\":\"${SESSION_A}\",\"durationMs\":5000}" \
  > "${REPORT_DIR}/cpu-a.json" &
pid_a=$!
call_gateway \
  vlab.workers.cpu \
  "{\"sessionKey\":\"${SESSION_B}\",\"durationMs\":5000}" \
  > "${REPORT_DIR}/cpu-b.json" &
pid_b=$!

sleep 0.25
call_gateway health '{}' > "${REPORT_DIR}/health-during-parallel.json"
wait "$pid_a"
wait "$pid_b"
parallel_finished_ns="$(date +%s%N)"
parallel_wall_ms="$(( (parallel_finished_ns - parallel_started_ns) / 1000000 ))"

jq -e '.ok == true' "${REPORT_DIR}/cpu-a.json" >/dev/null
jq -e '.ok == true' "${REPORT_DIR}/cpu-b.json" >/dev/null
worker_a="$(payload "${REPORT_DIR}/cpu-a.json" | jq -r '.workerPid')"
worker_b="$(payload "${REPORT_DIR}/cpu-b.json" | jq -r '.workerPid')"
[[ "$worker_a" != "$worker_b" ]]
(( parallel_wall_ms < 8000 ))

call_gateway \
  vlab.workers.cpu \
  "{\"sessionKey\":\"${SESSION_A}\",\"durationMs\":5000}" \
  > "${REPORT_DIR}/isolation-busy.json" &
busy_pid=$!
sleep 0.25
ping_started_ns="$(date +%s%N)"
call_gateway \
  vlab.workers.ping \
  "{\"sessionKey\":\"${SESSION_B}\"}" \
  > "${REPORT_DIR}/isolation-ping.json"
ping_finished_ns="$(date +%s%N)"
cross_worker_ping_ms="$(( (ping_finished_ns - ping_started_ns) / 1000000 ))"
wait "$busy_pid"
(( cross_worker_ping_ms < 1000 ))

call_gateway vlab.workers.status '{}' > "${REPORT_DIR}/status-after.json"
final_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
[[ "$baseline_restarts" == "$final_restarts" ]]
jq -e '(.result // .).eventLoop.degraded == false' \
  "${REPORT_DIR}/health-during-parallel.json" >/dev/null

jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg session_a "$SESSION_A" \
  --arg session_b "$SESSION_B" \
  --arg worker_a "$worker_a" \
  --arg worker_b "$worker_b" \
  --argjson parallel_wall_ms "$parallel_wall_ms" \
  --argjson cross_worker_ping_ms "$cross_worker_ping_ms" \
  --arg baseline_restarts "$baseline_restarts" \
  --arg final_restarts "$final_restarts" \
  '{
    ok: true,
    timestamp: $timestamp,
    sessions: [$session_a, $session_b],
    workerPids: [$worker_a, $worker_b],
    parallelWallMs: $parallel_wall_ms,
    crossWorkerPingMs: $cross_worker_ping_ms,
    gatewayRestarts: {
      before: $baseline_restarts,
      after: $final_restarts
    }
  }' \
  > "${REPORT_DIR}/summary.json"
chown vlab:vlab "${REPORT_DIR}/summary.json"
chmod 0600 "${REPORT_DIR}/summary.json"

cat "${REPORT_DIR}/summary.json"
