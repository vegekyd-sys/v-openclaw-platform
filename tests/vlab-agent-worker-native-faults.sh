#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TOKEN="${TIMESTAMP,,}"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-native-faults-${TIMESTAMP}"

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
    --params "$2" \
    --timeout 180000 \
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

wait_for_active_slot() {
  local session_key="$1"
  local output_path="$2"
  for _ in $(seq 1 120); do
    call_gateway_to_file vlab.workers.status '{}' "$output_path"
    local slot
    slot="$(
      payload "$output_path" \
        | jq -r --arg session_key "$session_key" \
          '.workers[]
           | select(any(.active[]; .sessionKey == $session_key))
           | .slot' \
        | head -n 1
    )"
    if [[ -n "$slot" ]]; then
      printf '%s\n' "$slot"
      return 0
    fi
    sleep 0.25
  done
  return 1
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-agent-worker-native-faults.sh must run as root" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
baseline_restarts="$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)"
call_gateway_to_file vlab.workers.status '{}' "${REPORT_DIR}/status-before.json"
stats_before="$(payload "${REPORT_DIR}/status-before.json")"
admitted_before="$(
  jq -r '.integration.nativeHarnessStats.admitted' <<< "$stats_before"
)"
cancelled_before="$(
  jq -r '.integration.nativeHarnessStats.cancelled' <<< "$stats_before"
)"
failed_before="$(
  jq -r '.integration.nativeHarnessStats.failed' <<< "$stats_before"
)"

cancel_session="agent:makaron:explicit:vlab-native-cancel-${TOKEN}"
cancel_run="vlab-native-cancel-${TOKEN}"
call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session "$cancel_session" \
    --arg run "$cancel_run" \
    '{
      sessionKey: $session,
      agentId: "makaron",
      message: "必须使用 exec 执行 /bin/sleep 30，然后只回复 SHOULD_NOT_COMPLETE。",
      deliver: false,
      timeoutMs: 120000,
      idempotencyKey: $run
    }')" \
  "${REPORT_DIR}/cancel-send.json"
wait_for_active_slot \
  "$cancel_session" \
  "${REPORT_DIR}/cancel-status-active.json" >/dev/null
call_gateway_to_file \
  vlab.workers.native.cancel \
  "$(jq -cn \
    --arg run "$cancel_run" \
    '{runId: $run}')" \
  "${REPORT_DIR}/cancel-abort.json"
jq -e \
  '(.result // .).cancelled == true
   and (.result // .).state == "active"' \
  "${REPORT_DIR}/cancel-abort.json" >/dev/null
call_gateway_to_file \
  agent.wait \
  "$(jq -cn --arg run "$cancel_run" '{runId: $run, timeoutMs: 120000}')" \
  "${REPORT_DIR}/cancel-wait.json"
jq -e \
  '(.result // .).status == "cancelled"
   or (.result // .).status == "aborted"
   or (.result // .).status == "ok"' \
  "${REPORT_DIR}/cancel-wait.json" >/dev/null

crash_session="agent:makaron:explicit:vlab-native-crash-${TOKEN}"
crash_run="vlab-native-crash-${TOKEN}"
call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session "$crash_session" \
    --arg run "$crash_run" \
    '{
      sessionKey: $session,
      agentId: "makaron",
      message: "必须使用 exec 执行 /bin/sleep 30，然后只回复 SHOULD_NOT_COMPLETE。",
      deliver: false,
      timeoutMs: 120000,
      idempotencyKey: $run
    }')" \
  "${REPORT_DIR}/crash-send.json"
crash_slot="$(
  wait_for_active_slot \
    "$crash_session" \
    "${REPORT_DIR}/crash-status-active.json"
)"
call_gateway_to_file \
  vlab.workers.kill \
  "$(jq -cn --argjson slot "$crash_slot" '{slot: $slot}')" \
  "${REPORT_DIR}/crash-kill.json"
call_gateway_to_file \
  agent.wait \
  "$(jq -cn --arg run "$crash_run" '{runId: $run, timeoutMs: 120000}')" \
  "${REPORT_DIR}/crash-wait.json"
jq -e \
  '(.result // .).status == "failed"
   or (.result // .).status == "error"' \
  "${REPORT_DIR}/crash-wait.json" >/dev/null

call_gateway_to_file \
  vlab.workers.status \
  '{}' \
  "${REPORT_DIR}/status-after-crash.json"
admitted_after_crash="$(
  payload "${REPORT_DIR}/status-after-crash.json" \
    | jq -r '.integration.nativeHarnessStats.admitted'
)"
call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session "$crash_session" \
    --arg run "$crash_run" \
    '{
      sessionKey: $session,
      agentId: "makaron",
      message: "THIS_MUST_NOT_REEXECUTE",
      deliver: false,
      timeoutMs: 120000,
      idempotencyKey: $run
    }')" \
  "${REPORT_DIR}/crash-idempotent-retry.json"
call_gateway_to_file \
  vlab.workers.status \
  '{}' \
  "${REPORT_DIR}/status-after-idempotent-retry.json"
admitted_after_retry="$(
  payload "${REPORT_DIR}/status-after-idempotent-retry.json" \
    | jq -r '.integration.nativeHarnessStats.admitted'
)"
[[ "$admitted_after_retry" == "$admitted_after_crash" ]]

recovery_run="vlab-native-recovery-${TOKEN}"
recovery_marker="VLAB_NATIVE_RECOVERY_OK"
call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session "$crash_session" \
    --arg run "$recovery_run" \
    --arg marker "$recovery_marker" \
    '{
      sessionKey: $session,
      agentId: "makaron",
      message: ("只回复 " + $marker),
      deliver: false,
      timeoutMs: 120000,
      idempotencyKey: $run
    }')" \
  "${REPORT_DIR}/recovery-send.json"
call_gateway_to_file \
  agent.wait \
  "$(jq -cn --arg run "$recovery_run" '{runId: $run, timeoutMs: 120000}')" \
  "${REPORT_DIR}/recovery-wait.json"
jq -e \
  '(.result // .).status == "ok"
   or (.result // .).status == "succeeded"' \
  "${REPORT_DIR}/recovery-wait.json" >/dev/null
call_gateway_to_file \
  chat.history \
  "$(jq -cn --arg session "$crash_session" '{sessionKey: $session, limit: 30}')" \
  "${REPORT_DIR}/recovery-history.json"
jq -e --arg marker "$recovery_marker" \
  '[(.result // .).messages[]?
    | select(.role == "assistant")
    | .content[]?
    | select(.type == "text")
    | .text]
   | any(contains($marker))' \
  "${REPORT_DIR}/recovery-history.json" >/dev/null

call_gateway_to_file vlab.workers.status '{}' "${REPORT_DIR}/status-after.json"
stats_after="$(payload "${REPORT_DIR}/status-after.json")"
admitted_after="$(
  jq -r '.integration.nativeHarnessStats.admitted' <<< "$stats_after"
)"
cancelled_after="$(
  jq -r '.integration.nativeHarnessStats.cancelled' <<< "$stats_after"
)"
failed_after="$(
  jq -r '.integration.nativeHarnessStats.failed' <<< "$stats_after"
)"
[[ "$((admitted_after - admitted_before))" == "3" ]]
[[ "$((cancelled_after - cancelled_before))" == "1" ]]
[[ "$((failed_after - failed_before))" == "1" ]]
[[ "$(
  systemctl show openclaw-vlab-gateway.service -p NRestarts --value
)" == "$baseline_restarts" ]]

jq -n \
  --arg reportDir "$REPORT_DIR" \
  '{
    ok: true,
    nativeCancellation: true,
    activeWorkerCrashRejected: true,
    failedIdempotentRetryReexecuted: false,
    sameSessionRecoveredOnNextRun: true,
    gatewayRestarted: false,
    reportDir: $reportDir
  }' \
  | tee "${REPORT_DIR}/summary.json"
