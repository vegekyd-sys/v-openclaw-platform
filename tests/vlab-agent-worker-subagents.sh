#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_TOKEN="$(printf '%s' "$TIMESTAMP" | tr '[:upper:]' '[:lower:]')"
PARENT_SESSION="agent:makaron:explicit:vlab-worker-subagent-${SESSION_TOKEN}"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-subagent-acceptance-${TIMESTAMP}"

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

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-subagents.sh must run as root" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
baseline_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
call_gateway_to_file vlab.workers.status '{}' "${REPORT_DIR}/status-before.json"
jq -e \
  '.openClawConcurrency.maxConcurrent == 9
   and .openClawConcurrency.subagentsMaxConcurrent == 8' \
  "${REPORT_DIR}/status-before.json" >/dev/null

message='这是 vLab subagent 并发验收。必须使用 sessions_spawn 工具启动恰好 8 个 subagent。每个 child 必须先使用 exec 执行 /bin/sleep 10，再只回复其对应的 VLAB_CHILD_1_OK 到 VLAB_CHILD_8_OK。全部启动后立即使用 subagents list 检查并确认 8 个都处于 running，然后使用 subagents wait 等待。不要发送外部消息，不要修改文件，不能用文字假装调用工具。'
call_gateway_to_file \
  vlab.workers.agent \
  "$(jq -cn \
    --arg session_key "$PARENT_SESSION" \
    --arg message "$message" \
    '{
      sessionKey: $session_key,
      agentId: "makaron",
      message: $message,
      timeoutSeconds: 240,
      modelRun: false
    }')" \
  "${REPORT_DIR}/parent-agent.json"

call_gateway_to_file \
  chat.history \
  "$(jq -cn --arg session_key "$PARENT_SESSION" \
    '{sessionKey: $session_key, limit: 200}')" \
  "${REPORT_DIR}/parent-history.json"

jq \
  '[.messages[]
    | select(.role == "toolResult")
    | .content[]?.text
    | fromjson?
    | select(.childSessionKey)]' \
  "${REPORT_DIR}/parent-history.json" \
  > "${REPORT_DIR}/spawn-results.json"
jq \
  '[.messages[]
    | select(.role == "toolResult")
    | .content[]?.text
    | fromjson?
    | select(.action == "list" and .total == 8 and (.active | length) == 8)
  ][0]' \
  "${REPORT_DIR}/parent-history.json" \
  > "${REPORT_DIR}/active-list.json"

jq -e \
  'length == 8
   and all(.status == "accepted")
   and ([.[].childSessionKey] | unique | length) == 8' \
  "${REPORT_DIR}/spawn-results.json" >/dev/null
jq -e \
  '.total == 8
   and (.active | length) == 8
   and all(.active[]; .status == "running")' \
  "${REPORT_DIR}/active-list.json" >/dev/null

sleep 15
completed=0
while IFS=$'\t' read -r child_session marker; do
  child_path="${REPORT_DIR}/child-$((completed + 1)).json"
  found=false
  for _ in $(seq 1 20); do
    call_gateway_to_file \
      chat.history \
      "$(jq -cn --arg session_key "$child_session" \
        '{sessionKey: $session_key, limit: 100}')" \
      "$child_path"
    if jq -e \
      --arg marker "$marker" \
      '[.messages[] | .content[]?.text? // empty]
       | any(contains($marker))' \
      "$child_path" >/dev/null; then
      found=true
      break
    fi
    sleep 1
  done
  [[ "$found" == true ]]
  completed=$((completed + 1))
done < <(
  jq -r \
    '.active[]
     | [.sessionKey, (.task | capture("(?<marker>VLAB_CHILD_[0-9]+_OK)").marker)]
     | @tsv' \
    "${REPORT_DIR}/active-list.json"
)
[[ "$completed" == "8" ]]

call_gateway_to_file health '{}' "${REPORT_DIR}/health-after.json"
call_gateway_to_file vlab.workers.status '{}' "${REPORT_DIR}/status-after.json"
final_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
memory_current="$(
  systemctl show openclaw-vlab-gateway.service -p MemoryCurrent --value
)"
memory_peak="$(
  systemctl show openclaw-vlab-gateway.service -p MemoryPeak --value
)"
[[ "$baseline_restarts" == "$final_restarts" ]]
jq -e '.eventLoop.degraded == false' \
  "${REPORT_DIR}/health-after.json" >/dev/null

jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg parent_session "$PARENT_SESSION" \
  --argjson completed "$completed" \
  --argjson memory_current "$memory_current" \
  --argjson memory_peak "$memory_peak" \
  --arg baseline_restarts "$baseline_restarts" \
  --arg final_restarts "$final_restarts" \
  --slurpfile health "${REPORT_DIR}/health-after.json" \
  '{
    ok: true,
    timestamp: $timestamp,
    parentSession: $parent_session,
    configured: {
      maxConcurrent: 9,
      subagentsMaxConcurrent: 8
    },
    subagents: {
      accepted: 8,
      simultaneouslyRunning: 8,
      completedMarkers: $completed
    },
    gateway: {
      eventLoop: $health[0].eventLoop,
      memoryCurrentBytes: $memory_current,
      memoryPeakBytes: $memory_peak,
      restartsBefore: $baseline_restarts,
      restartsAfter: $final_restarts
    }
  }' > "${REPORT_DIR}/summary.json"
chown vlab:vlab "${REPORT_DIR}/summary.json"
chmod 0600 "${REPORT_DIR}/summary.json"
cat "${REPORT_DIR}/summary.json"
