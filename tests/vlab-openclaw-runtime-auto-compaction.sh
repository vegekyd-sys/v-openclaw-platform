#!/usr/bin/env bash
set -Eeuo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
NODE="${VLAB_NODE:-/opt/vlab/node/bin/node}"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
WORKER_CONFIG_PATH="${LAB_ROOT}/experiments/agent-worker-isolation-v1/worker-openclaw.json"
SETTER="${VLAB_COMPACTION_THRESHOLD_SETTER:-/tmp/set-compaction-transcript-threshold.mjs}"
SERVICE="${VLAB_GATEWAY_SERVICE:-openclaw-vlab-gateway.service}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TOKEN="${TIMESTAMP,,}"
REPORT_DIR="${LAB_ROOT}/logs/openclaw-runtime-auto-compaction-${TIMESTAMP}"
BACKUP_DIR="$(mktemp -d)"
restored=false

call_gateway() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    TMPDIR="${LAB_ROOT}/tmp" \
    "$NODE" "$OPENCLAW" gateway call "$1" \
      --params "$2" --timeout 360000 --json
}

wait_ready() {
  for _ in $(seq 1 40); do
    if systemctl is-active --quiet "$SERVICE" \
      && call_gateway health '{}' >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  echo "Gateway did not become ready" >&2
  return 1
}

restore_configs() {
  if [[ "$restored" == true ]]; then
    return
  fi
  restored=true
  install -o vlab -g vlab -m 0600 "$BACKUP_DIR/openclaw.json" "$CONFIG_PATH"
  install -o vlab -g vlab -m 0600 "$BACKUP_DIR/worker-openclaw.json" "$WORKER_CONFIG_PATH"
  systemctl restart "$SERVICE"
  wait_ready
}

cleanup() {
  restore_configs || true
}
trap cleanup EXIT

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-openclaw-runtime-auto-compaction.sh must run as root" >&2
  exit 1
fi
[[ -f "$SETTER" ]] || {
  echo "missing threshold setter: $SETTER" >&2
  exit 1
}

install -d -o vlab -g vlab -m 0700 "$REPORT_DIR"
install -m 0600 "$CONFIG_PATH" "$BACKUP_DIR/openclaw.json"
install -m 0600 "$WORKER_CONFIG_PATH" "$BACKUP_DIR/worker-openclaw.json"

"$NODE" "$SETTER" --config "$CONFIG_PATH" --value 40kb >/dev/null
"$NODE" "$SETTER" --config "$WORKER_CONFIG_PATH" --value 40kb >/dev/null
systemctl restart "$SERVICE"
wait_ready

baseline_restarts="$(systemctl show "$SERVICE" -p NRestarts --value)"
call_gateway vlab.workers.status '{}' >"$REPORT_DIR/status-before.json"
before="$(jq -c '.result // .' "$REPORT_DIR/status-before.json")"

session_key="agent:makaron:explicit:openclaw81-auto-compact-${TOKEN}"
seed_run="openclaw81-auto-compact-seed-${TOKEN}"
continue_run="openclaw81-auto-compact-continue-${TOKEN}"
identifier="oc_auto_compact_${TOKEN}"
final_marker="OPENCLAW_RUNTIME_AUTO_COMPACTION_OK_${TOKEN}"
seed_body="$(head -c 70000 /dev/zero | tr '\0' 'C')"

call_gateway chat.send "$(jq -cn \
  --arg session "$session_key" \
  --arg run "$seed_run" \
  --arg identifier "$identifier" \
  --arg body "$seed_body" \
  '{
    sessionKey: $session,
    agentId: "makaron",
    message: ("必须记住精确标识 " + $identifier + "。只回复 SEED_ACCEPTED。\n" + $body),
    deliver: false,
    timeoutMs: 300000,
    idempotencyKey: $run
  }')" >"$REPORT_DIR/seed-send.json"
call_gateway agent.wait "$(jq -cn --arg run "$seed_run" '{runId:$run,timeoutMs:300000}')" \
  >"$REPORT_DIR/seed-wait.json"

call_gateway chat.send "$(jq -cn \
  --arg session "$session_key" \
  --arg run "$continue_run" \
  --arg identifier "$identifier" \
  --arg marker "$final_marker" \
  '{
    sessionKey: $session,
    agentId: "makaron",
    message: ("继续本会话。请确认你记得精确标识 " + $identifier + "，然后只回复 " + $marker),
    deliver: false,
    timeoutMs: 300000,
    idempotencyKey: $run
  }')" >"$REPORT_DIR/continue-send.json"
call_gateway agent.wait "$(jq -cn --arg run "$continue_run" '{runId:$run,timeoutMs:300000}')" \
  >"$REPORT_DIR/continue-wait.json"
call_gateway chat.history "$(jq -cn --arg session "$session_key" '{sessionKey:$session,limit:120}')" \
  >"$REPORT_DIR/history.json"
call_gateway vlab.workers.status '{}' >"$REPORT_DIR/status-after.json"
call_gateway health '{}' >"$REPORT_DIR/health-after.json"

after="$(jq -c '.result // .' "$REPORT_DIR/status-after.json")"
calls_before="$(jq -r '.integration.fastCompaction.aggregateWorkerStats.calls // .integration.fastCompaction.stats.calls // 0' <<<"$before")"
calls_after="$(jq -r '.integration.fastCompaction.aggregateWorkerStats.calls // .integration.fastCompaction.stats.calls // 0' <<<"$after")"
model_calls_before="$(jq -r '.integration.fastCompaction.aggregateWorkerStats.modelCalls // .integration.fastCompaction.stats.modelCalls // 0' <<<"$before")"
model_calls_after="$(jq -r '.integration.fastCompaction.aggregateWorkerStats.modelCalls // .integration.fastCompaction.stats.modelCalls // 0' <<<"$after")"
failures_before="$(jq -r '.integration.fastCompaction.aggregateWorkerStats.failures // .integration.fastCompaction.stats.failures // 0' <<<"$before")"
failures_after="$(jq -r '.integration.fastCompaction.aggregateWorkerStats.failures // .integration.fastCompaction.stats.failures // 0' <<<"$after")"
attempts_before="$(jq -r '.integration.nativeHarnessStats.workerAttempts // 0' <<<"$before")"
attempts_after="$(jq -r '.integration.nativeHarnessStats.workerAttempts // 0' <<<"$after")"

[[ "$((calls_after - calls_before))" -ge 1 ]]
[[ "$((model_calls_after - model_calls_before))" -ge 1 ]]
[[ "$((failures_after - failures_before))" == 0 ]]
[[ "$((attempts_after - attempts_before))" -ge 2 ]]
jq -e --arg marker "$final_marker" '
  (.result // .).messages
  | any(.role == "assistant" and ((.content // []) | tostring | contains($marker)))
' "$REPORT_DIR/history.json" >/dev/null
jq -e '(.result // .).eventLoop.degraded == false' "$REPORT_DIR/health-after.json" >/dev/null
[[ "$(systemctl show "$SERVICE" -p NRestarts --value)" == "$baseline_restarts" ]]

restore_configs
trap - EXIT

jq -n \
  --arg sessionKey "$session_key" \
  --arg identifier "$identifier" \
  --arg finalMarker "$final_marker" \
  --arg provider "$(jq -r '.integration.fastCompaction.provider' <<<"$after")" \
  --arg model "$(jq -r '.integration.fastCompaction.model' <<<"$after")" \
  --argjson compactionCalls "$((calls_after - calls_before))" \
  --argjson modelCalls "$((model_calls_after - model_calls_before))" \
  --argjson workerAttempts "$((attempts_after - attempts_before))" \
  --arg reportDir "$REPORT_DIR" \
  '{
    ok: true,
    runtime: "openclaw",
    trigger: "automatic-preflight-byte-threshold",
    explicitSessionsCompactCalled: false,
    sessionKey: $sessionKey,
    exactIdentifierPreserved: $identifier,
    finalMarker: $finalMarker,
    compactionProvider: $provider,
    compactionModel: $model,
    compactionCalls: $compactionCalls,
    providerModelCalls: $modelCalls,
    workerAttempts: $workerAttempts,
    continuationCompleted: true,
    gatewayRestartedDuringRun: false,
    temporaryThresholdRestored: true,
    reportDir: $reportDir
  }' | tee "$REPORT_DIR/summary.json"
