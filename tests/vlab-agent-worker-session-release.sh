#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TOKEN="${TIMESTAMP,,}"
REPORT_DIR="${LAB_ROOT}/logs/agent-worker-session-release-${TIMESTAMP}"

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
    --params "$2" \
    --timeout 120000 \
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
  echo "vlab-agent-worker-session-release.sh must run as root" >&2
  exit 1
fi

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
session_key="agent:makaron:explicit:vlab-native-release-${TOKEN}"
failed_run="vlab-native-release-fail-${TOKEN}"
recovery_run="vlab-native-release-recover-${TOKEN}"
recovery_marker="VLAB_SAME_SESSION_RECOVERED_${TOKEN}"

call_gateway_to_file vlab.workers.status '{}' "${REPORT_DIR}/status-before.json"
failed_before="$(
  payload "${REPORT_DIR}/status-before.json" \
    | jq -r '.integration.nativeHarnessStats.failed'
)"

started_at="$(date +%s)"
call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session "$session_key" \
    --arg run "$failed_run" \
    '{
      sessionKey: $session,
      agentId: "makaron",
      message: "必须使用 exec 执行 /bin/sleep 30，然后只回复 SHOULD_NOT_COMPLETE。",
      deliver: false,
      timeoutMs: 120000,
      idempotencyKey: $run
    }')" \
  "${REPORT_DIR}/failure-send.json"
failed_slot="$(
  wait_for_active_slot \
    "$session_key" \
    "${REPORT_DIR}/failure-status-active.json"
)"
call_gateway_to_file \
  vlab.workers.kill \
  "$(jq -cn --argjson slot "$failed_slot" '{slot: $slot}')" \
  "${REPORT_DIR}/failure-kill.json"
call_gateway_to_file \
  agent.wait \
  "$(jq -cn --arg run "$failed_run" '{runId: $run, timeoutMs: 30000}')" \
  "${REPORT_DIR}/failure-wait.json"
failure_elapsed_seconds="$(( $(date +%s) - started_at ))"
[[ "$failure_elapsed_seconds" -lt 30 ]]
jq -e \
  '(.result // .).status == "failed"
   or (.result // .).status == "error"
   or (.result // .).status == "ok"' \
  "${REPORT_DIR}/failure-wait.json" >/dev/null

for _ in $(seq 1 80); do
  call_gateway_to_file \
    vlab.workers.status \
    '{}' \
    "${REPORT_DIR}/status-after-failure.json"
  released="$(
    payload "${REPORT_DIR}/status-after-failure.json" \
      | jq -r --arg session "$session_key" \
        '([.workers[].active[]? | select(.sessionKey == $session)] | length) == 0
         and ([.workers[].sessionKeys[]? | select(. == $session)] | length) == 0'
  )"
  [[ "$released" == "true" ]] && break
  sleep 0.25
done
[[ "$released" == "true" ]]

failed_after="$(
  payload "${REPORT_DIR}/status-after-failure.json" \
    | jq -r '.integration.nativeHarnessStats.failed'
)"
[[ "$((failed_after - failed_before))" == "1" ]]

call_gateway_to_file \
  chat.send \
  "$(jq -cn \
    --arg session "$session_key" \
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
  "$(jq -cn --arg session "$session_key" '{sessionKey: $session, limit: 20}')" \
  "${REPORT_DIR}/recovery-history.json"
jq -e --arg marker "$recovery_marker" \
  '[(.result // .).messages[]?
    | select(.role == "assistant")
    | .content[]?
    | select(.type == "text")
    | .text]
   | any(contains($marker))' \
  "${REPORT_DIR}/recovery-history.json" >/dev/null

jq -n \
  --argjson failureElapsedSeconds "$failure_elapsed_seconds" \
  --arg reportDir "$REPORT_DIR" \
  '{
    ok: true,
    failedAttemptReturnedBeforeChannelEviction: true,
    sameSessionOwnerReleased: true,
    sameSessionNextRunRecovered: true,
    failureElapsedSeconds: $failureElapsedSeconds,
    reportDir: $reportDir
  }' \
  | tee "${REPORT_DIR}/summary.json"
