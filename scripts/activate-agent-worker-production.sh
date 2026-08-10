#!/usr/bin/env bash
set -Eeuo pipefail

PLATFORM_COMMIT="${PLATFORM_COMMIT:?PLATFORM_COMMIT is required}"
ARTIFACT_SHA256="${ARTIFACT_SHA256:?ARTIFACT_SHA256 is required}"
ARCHIVE_PATH="${ARCHIVE_PATH:-/tmp/v-agent-worker-isolation-v1.tar.gz}"
SERVICE="openclaw-gateway.service"
SERVICE_USER="openclaw"
SERVICE_GROUP="openclaw"
OPENCLAW_HOME_DIR="/home/openclaw"
STATE_ROOT="${OPENCLAW_HOME_DIR}/.openclaw"
CONFIG_PATH="${STATE_ROOT}/openclaw.json"
WORKSPACE_DIR="${STATE_ROOT}/workspace"
PLUGIN_ID="vlab-agent-worker-isolation"
EXPERIMENT_ROOT="/opt/openclaw-experiments/agent-worker-isolation-v1"
RELEASE_DIR="${EXPERIMENT_ROOT}/releases/${PLATFORM_COMMIT}"
STATE_DIR="${STATE_ROOT}/experiments/agent-worker-isolation-v1"
WORKER_CONFIG_PATH="${STATE_DIR}/worker-openclaw.json"
ACTIVE_MANIFEST="${STATE_DIR}/active.json"
NODE="/opt/node-v22.23.1/bin/node"
OPENCLAW="/opt/openclaw-2026.7.1/node_modules/openclaw/openclaw.mjs"
OPENCLAW_PACKAGE="/opt/openclaw-2026.7.1/node_modules/openclaw"
AGENT_RUNTIME="/opt/openclaw-2026.7.1/node_modules/openclaw/dist/plugin-sdk/agent-runtime.js"
SESSION_HOTSET_TTL_MS="${V_SESSION_HOTSET_TTL_MS:-180000}"
SESSION_HOTSET_PATCHER_SOURCE="${V_SESSION_HOTSET_PATCHER_SOURCE:-/tmp/patch-openclaw-session-hotset.mjs}"
SESSION_HOTSET_PATCHER="${STATE_DIR}/patch-openclaw-session-hotset.mjs"
SESSION_HOTSET_PRUNER_SOURCE="${V_SESSION_HOTSET_PRUNER_SOURCE:-/tmp/prune-openclaw-session-hotset.mjs}"
SESSION_HOTSET_PRUNER="${STATE_DIR}/prune-openclaw-session-hotset.mjs"
MEDIA_COMPLETION_PATCHER_SOURCE="${V_MEDIA_COMPLETION_PATCHER_SOURCE:-/tmp/patch-openclaw-media-completion-relay.mjs}"
MEDIA_COMPLETION_PATCHER="${STATE_DIR}/patch-openclaw-media-completion-relay.mjs"
SESSION_HOTSET_REPORT="${STATE_DIR}/last-prune.json"
SESSION_HOTSET_DROPIN_DIR="/etc/systemd/system/${SERVICE}.d"
SESSION_HOTSET_DROPIN="${SESSION_HOTSET_DROPIN_DIR}/session-hotset-v0.2.0.conf"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SHORT_COMMIT="${PLATFORM_COMMIT:0:7}"
BACKUP_DIR="${STATE_ROOT}/backups/agent-worker-isolation-v1/${TIMESTAMP}-${SHORT_COMMIT}"
BACKUP_CONFIG="${BACKUP_DIR}/openclaw.json"
BACKUP_WORKER_CONFIG="${BACKUP_DIR}/worker-openclaw.json"
PREVIOUS_ACTIVE_MANIFEST="${BACKUP_DIR}/active.json"
PREVIOUS_HOTSET_DROPIN="${BACKUP_DIR}/session-hotset-v0.2.0.conf"
HEALTH_FILE="${BACKUP_DIR}/candidate-health.json"
STATUS_FILE="${BACKUP_DIR}/candidate-worker-status.json"
rollback_armed=false
hotset_patch_armed=false
media_completion_patch_armed=false
tool_proxy_patch_armed=false
media_completion_preexisting=false
tool_proxy_preexisting=false
hotset_was_present=false
previous_hotset_module=""
candidate_config=""
worker_candidate_config=""
manifest_candidate=""
session_hotset_dropin_candidate=""
existing_worker_compaction='{}'

run_openclaw() {
  sudo -u "$SERVICE_USER" env \
    HOME="$OPENCLAW_HOME_DIR" \
    OPENCLAW_HOME="$OPENCLAW_HOME_DIR" \
    OPENCLAW_STATE_DIR="$STATE_ROOT" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" \
    "$NODE" "$OPENCLAW" "$@"
}

cleanup() {
  [[ -z "$candidate_config" ]] || rm -f "$candidate_config"
  [[ -z "$worker_candidate_config" ]] || rm -f "$worker_candidate_config"
  [[ -z "$manifest_candidate" ]] || rm -f "$manifest_candidate"
  [[ -z "$session_hotset_dropin_candidate" ]] \
    || rm -f "$session_hotset_dropin_candidate"
}

restore_on_error() {
  local exit_code=$?
  cleanup
  if [[ "$rollback_armed" == true ]]; then
    install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
      "$BACKUP_CONFIG" "$CONFIG_PATH"
    install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
      "$BACKUP_WORKER_CONFIG" "$WORKER_CONFIG_PATH"
    install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
      "$PREVIOUS_ACTIVE_MANIFEST" "$ACTIVE_MANIFEST"
    if [[ "$tool_proxy_patch_armed" == true ]]; then
      "$NODE" "${RELEASE_DIR}/patch-openclaw-skill-workshop-worker-proxy.mjs" \
        --restore "$OPENCLAW_PACKAGE" || true
    fi
    if [[ "$media_completion_patch_armed" == true ]]; then
      "$NODE" "$MEDIA_COMPLETION_PATCHER" --restore "$OPENCLAW_PACKAGE" \
        || true
    fi
    if [[ "$hotset_patch_armed" == true ]]; then
      if [[ "$hotset_was_present" == true && -n "$previous_hotset_module" ]]; then
        "$NODE" "$SESSION_HOTSET_PATCHER" \
          "$OPENCLAW_PACKAGE" "$previous_hotset_module" || true
        install -o root -g root -m 0644 \
          "$PREVIOUS_HOTSET_DROPIN" "$SESSION_HOTSET_DROPIN" || true
      else
        "$NODE" "$SESSION_HOTSET_PATCHER" --restore "$OPENCLAW_PACKAGE" \
          || true
        rm -f "$SESSION_HOTSET_DROPIN"
      fi
    fi
    systemctl daemon-reload || true
    systemctl restart "$SERVICE" || true
  fi
  exit "$exit_code"
}
trap restore_on_error ERR
trap cleanup EXIT

if [[ "$(id -u)" -ne 0 ]]; then
  echo "activate-agent-worker-production.sh must run as root" >&2
  exit 1
fi
[[ "$PLATFORM_COMMIT" =~ ^[0-9a-f]{40}$ ]] || {
  echo "PLATFORM_COMMIT must be a full Git commit" >&2
  exit 1
}
[[ "$ARTIFACT_SHA256" =~ ^[0-9a-f]{64}$ ]] || {
  echo "ARTIFACT_SHA256 must be a SHA-256 digest" >&2
  exit 1
}
[[ -f "$ARCHIVE_PATH" && -f "$CONFIG_PATH" && -f "$WORKER_CONFIG_PATH" ]] || {
  echo "production artifact or current configuration is missing" >&2
  exit 1
}
[[ -f "$ACTIVE_MANIFEST" && -x "$NODE" && -f "$OPENCLAW" ]] || {
  echo "production OpenClaw runtime or active manifest is incomplete" >&2
  exit 1
}
[[ -f "$AGENT_RUNTIME" ]] || {
  echo "production Agent runtime is missing" >&2
  exit 1
}
[[ -f "$SESSION_HOTSET_PATCHER_SOURCE" ]] || {
  echo "missing Session Hotset patcher" >&2
  exit 1
}
[[ -f "$SESSION_HOTSET_PRUNER_SOURCE" ]] || {
  echo "missing Session Hotset pruner" >&2
  exit 1
}
[[ -f "$MEDIA_COMPLETION_PATCHER_SOURCE" ]] || {
  echo "missing media completion relay patcher" >&2
  exit 1
}
if ! [[ "$SESSION_HOTSET_TTL_MS" =~ ^[0-9]+$ ]] \
  || (( SESSION_HOTSET_TTL_MS < 100 || SESSION_HOTSET_TTL_MS > 3600000 )); then
  echo "V_SESSION_HOTSET_TTL_MS must be between 100 and 3600000" >&2
  exit 1
fi
[[ "$(systemctl show "$SERVICE" -p User --value)" == "$SERVICE_USER" ]] || {
  echo "unexpected production Gateway service owner" >&2
  exit 1
}
actual_sha256="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
[[ "$actual_sha256" == "$ARTIFACT_SHA256" ]] || {
  echo "artifact checksum mismatch" >&2
  exit 1
}
existing_worker_compaction="$(
  jq -c '.agents.defaults.compaction // {}' "$WORKER_CONFIG_PATH"
)"

install -d -m 0755 "$EXPERIMENT_ROOT" "${EXPERIMENT_ROOT}/releases"
if [[ ! -d "$RELEASE_DIR" ]]; then
  install -d -m 0755 "$RELEASE_DIR"
  tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR"
  find "$RELEASE_DIR" -type d -exec chmod 0755 {} +
  find "$RELEASE_DIR" -type f -exec chmod 0644 {} +
  chown -R root:root "$RELEASE_DIR"
fi
for required in \
  package.json \
  openclaw.plugin.json \
  index.mjs \
  worker-pool.mjs \
  worker.mjs \
  harness-event-contract.mjs \
  exec-env.mjs \
  harness-result.mjs \
  harness-failure.mjs \
  session-rollover-retry.mjs \
  fast-compaction-provider.mjs \
  worker-gateway-events.mjs \
  session-hotset.mjs \
  gateway-owned-tool-proxy.mjs \
  skill-workshop-subprocess-runner.mjs \
  patch-openclaw-skill-workshop-worker-proxy.mjs \
  self-test.mjs; do
  [[ -f "${RELEASE_DIR}/${required}" ]] || {
    echo "release is missing ${required}" >&2
    exit 1
  }
done
[[ "$(jq -r '.version' "${RELEASE_DIR}/package.json")" == "0.2.2" ]] || {
  echo "unexpected Worker isolation version" >&2
  exit 1
}

sudo -u "$SERVICE_USER" env \
  HOME="$OPENCLAW_HOME_DIR" \
  VLAB_OPENCLAW_AGENT_RUNTIME="$AGENT_RUNTIME" \
  "$NODE" "${RELEASE_DIR}/self-test.mjs" \
  > "/tmp/v-agent-worker-self-test-${TIMESTAMP}.json"

install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0700 \
  "$BACKUP_DIR" "$STATE_DIR"
install -o root -g root -m 0755 \
  "$SESSION_HOTSET_PATCHER_SOURCE" "$SESSION_HOTSET_PATCHER"
install -o root -g root -m 0755 \
  "$SESSION_HOTSET_PRUNER_SOURCE" "$SESSION_HOTSET_PRUNER"
install -o root -g root -m 0755 \
  "$MEDIA_COMPLETION_PATCHER_SOURCE" "$MEDIA_COMPLETION_PATCHER"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$CONFIG_PATH" "$BACKUP_CONFIG"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$WORKER_CONFIG_PATH" "$BACKUP_WORKER_CONFIG"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$ACTIVE_MANIFEST" "$PREVIOUS_ACTIVE_MANIFEST"
if [[ -f "$SESSION_HOTSET_DROPIN" ]]; then
  hotset_was_present=true
  install -o root -g root -m 0644 \
    "$SESSION_HOTSET_DROPIN" "$PREVIOUS_HOTSET_DROPIN"
  previous_hotset_module="$(
    awk '{ for (i = 1; i <= NF; i += 1) if ($i ~ /\/session-hotset\.mjs$/) print $i }' \
      "$PREVIOUS_HOTSET_DROPIN" | head -n 1
  )"
  [[ -n "$previous_hotset_module" ]] || {
    echo "could not resolve existing Session Hotset module" >&2
    exit 1
  }
fi
rollback_armed=true

hotset_patch_result="$(
  "$NODE" "$SESSION_HOTSET_PATCHER" \
    "$OPENCLAW_PACKAGE" \
    "${RELEASE_DIR}/session-hotset.mjs"
)"
hotset_patch_armed=true
media_completion_patch_result="$(
  "$NODE" "$MEDIA_COMPLETION_PATCHER" "$OPENCLAW_PACKAGE"
)"
if [[ "$media_completion_patch_result" == patched\ * ]]; then
  media_completion_patch_armed=true
else
  media_completion_preexisting=true
fi
tool_proxy_patch_result="$(
  "$NODE" "${RELEASE_DIR}/patch-openclaw-skill-workshop-worker-proxy.mjs" \
    "$OPENCLAW_PACKAGE"
)"
if [[ "$tool_proxy_patch_result" == patched\ * ]]; then
  tool_proxy_patch_armed=true
else
  tool_proxy_preexisting=true
fi
install -d -o root -g root -m 0755 "$SESSION_HOTSET_DROPIN_DIR"
session_hotset_dropin_candidate="$(mktemp)"
printf '%s\n' \
  '[Service]' \
  'Environment=OPENCLAW_SESSION_HOTSET_ENABLED=1' \
  "Environment=OPENCLAW_SESSION_HOTSET_TTL_MS=${SESSION_HOTSET_TTL_MS}" \
  "Environment=OPENCLAW_SESSION_HOTSET_REPORT=${SESSION_HOTSET_REPORT}" \
  "ExecStartPre=${NODE} ${SESSION_HOTSET_PRUNER} ${STATE_ROOT}/agents ${RELEASE_DIR}/session-hotset.mjs ${SESSION_HOTSET_TTL_MS}" \
  > "$session_hotset_dropin_candidate"
install -o root -g root -m 0644 \
  "$session_hotset_dropin_candidate" "$SESSION_HOTSET_DROPIN"
rm -f "$session_hotset_dropin_candidate"
session_hotset_dropin_candidate=""
systemctl daemon-reload

candidate_config="$(mktemp)"
jq \
  --arg plugin_id "$PLUGIN_ID" \
  --arg release_dir "$RELEASE_DIR" \
  --arg experiment_root "$EXPERIMENT_ROOT" \
  --arg worker_config_path "$WORKER_CONFIG_PATH" \
  --arg gateway_config_path "$CONFIG_PATH" \
  --argjson existing_worker_compaction "$existing_worker_compaction" \
  '
    .agents = (.agents // {})
    | .agents.defaults = (.agents.defaults // {})
    | .agents.defaults.compaction = (
        (.agents.defaults.compaction // {}) * $existing_worker_compaction
      )
    | .agents.defaults.compaction.provider = "versa-fast-quality-v1"
    | .agents.defaults.compaction.qualityGuard = (
        (.agents.defaults.compaction.qualityGuard // {})
        | .enabled = true
        | .maxRetries = 1
      )
    | .plugins = (.plugins // {})
    | .plugins.load = (.plugins.load // {})
    | .agents.defaults.maxConcurrent = 10
    | .plugins.load.paths = (
        (
          (.plugins.load.paths // [])
          | map(select((startswith($experiment_root + "/")) | not))
        )
        + [$release_dir]
        | unique
      )
    | .plugins.entries = (.plugins.entries // {})
    | .plugins.entries[$plugin_id] = {
        enabled: true,
        llm: {
          allowModelOverride: true,
          allowedModels: [
            (
              $existing_worker_compaction.model
              // .agents.defaults.compaction.model
            )
          ]
        },
        config: {
          minWorkers: 1,
          maxWorkers: 3,
          sessionsPerWorker: 3,
          idleTimeoutMs: 180000,
          requestTimeoutMs: 600000,
          requestStallTimeoutMs: 120000,
          gatewayOwnedToolTimeoutMs: 310000,
          fastCompactionModel: (
            $existing_worker_compaction.model
            // .agents.defaults.compaction.model
          ),
          fastCompactionMaxInputChars: 420000,
          fastCompactionMaxOutputTokens: 12000,
          fastCompactionMaxQualityRetries: 1,
          workerConfigPath: $worker_config_path,
          gatewayConfigPath: $gateway_config_path
        }
      }
  ' "$CONFIG_PATH" > "$candidate_config"

jq -e \
  '.agents.defaults.maxConcurrent == 10
   and .agents.defaults.subagents.maxConcurrent == 8' \
  "$candidate_config" >/dev/null

worker_candidate_config="$(mktemp)"
jq \
  '
    .agents.defaults.models = (
      (.agents.defaults.models // {})
      | with_entries(
          .value = ((.value // {}) + {
            agentRuntime: (((.value // {}).agentRuntime // {}) + {
              id: "openclaw"
            })
          })
        )
    )
    | .models.providers = (
        (.models.providers // {})
        | with_entries(
            .value = ((.value // {}) + {
              agentRuntime: (((.value // {}).agentRuntime // {}) + {
                id: "openclaw"
              })
            })
          )
      )
  ' "$candidate_config" > "$worker_candidate_config"
chown "$SERVICE_USER:$SERVICE_GROUP" \
  "$candidate_config" "$worker_candidate_config"
chmod 0600 "$candidate_config" "$worker_candidate_config"

sudo -u "$SERVICE_USER" env \
  HOME="$OPENCLAW_HOME_DIR" \
  OPENCLAW_HOME="$OPENCLAW_HOME_DIR" \
  OPENCLAW_STATE_DIR="$STATE_ROOT" \
  OPENCLAW_CONFIG_PATH="$candidate_config" \
  OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" \
  "$NODE" "$OPENCLAW" config validate >/dev/null

install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$candidate_config" "$CONFIG_PATH"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$worker_candidate_config" "$WORKER_CONFIG_PATH"

manifest_candidate="$(mktemp)"
jq -n \
  --arg commit "$PLATFORM_COMMIT" \
  --arg version "0.2.2" \
  --arg prepared_at "$TIMESTAMP" \
  --arg artifact_sha256 "$ARTIFACT_SHA256" \
  --arg release_dir "$RELEASE_DIR" \
  --arg backup_config "$BACKUP_CONFIG" \
  --arg backup_worker_config "$BACKUP_WORKER_CONFIG" \
  --arg previous_active_manifest "$PREVIOUS_ACTIVE_MANIFEST" \
  --arg backup_dir "$BACKUP_DIR" \
  --arg rollback_command \
    "sudo ${STATE_DIR}/rollback-latest.sh" \
  --argjson session_hotset_ttl_ms "$SESSION_HOTSET_TTL_MS" \
  --arg session_hotset_dropin "$SESSION_HOTSET_DROPIN" \
  --arg session_hotset_report "$SESSION_HOTSET_REPORT" \
  --arg backup_hotset_dropin "$PREVIOUS_HOTSET_DROPIN" \
  --arg previous_hotset_module "$previous_hotset_module" \
  --arg media_completion_patcher "$MEDIA_COMPLETION_PATCHER" \
  --arg tool_proxy_patcher "${RELEASE_DIR}/patch-openclaw-skill-workshop-worker-proxy.mjs" \
  --argjson media_completion_preexisting "$media_completion_preexisting" \
  --argjson tool_proxy_preexisting "$tool_proxy_preexisting" \
  '{
    commit: $commit,
    version: $version,
    preparedAt: $prepared_at,
    artifactSha256: $artifact_sha256,
    releaseDir: $release_dir,
    backupConfig: $backup_config,
    backupWorkerConfig: $backup_worker_config,
    previousActiveManifest: $previous_active_manifest,
    backupDir: $backup_dir,
    rollbackCommand: $rollback_command,
    status: "activating",
    sessionHotset: {
      enabled: true,
      strategy: "central-directory-cold-derived-state-v1",
      ttlMs: $session_hotset_ttl_ms,
      dropIn: $session_hotset_dropin,
      lastPruneReport: $session_hotset_report
    },
    previousSessionHotset: {
      existed: (($previous_hotset_module | length) > 0),
      module: $previous_hotset_module,
      dropInBackup: $backup_hotset_dropin
    },
    mediaCompletionRelay: {
      enabled: true,
      version: "0.2.1",
      patcher: $media_completion_patcher,
      preExisting: $media_completion_preexisting
    },
    gatewayOwnedToolIsolation: {
      subprocessTools: ["skill_workshop"],
      patcher: $tool_proxy_patcher,
      preExisting: $tool_proxy_preexisting
    }
  }' > "$manifest_candidate"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$manifest_candidate" "$ACTIVE_MANIFEST"
install -o root -g root -m 0700 \
  /tmp/rollback-agent-worker-production.sh \
  "${STATE_DIR}/rollback-latest.sh"

systemctl restart "$SERVICE"
for _ in $(seq 1 60); do
  if systemctl is-active --quiet "$SERVICE" \
    && run_openclaw gateway call health --params '{}' --json \
      > "$HEALTH_FILE" 2>/dev/null; then
    break
  fi
  sleep 1
done
systemctl is-active --quiet "$SERVICE"
run_openclaw gateway call health --params '{}' --json > "$HEALTH_FILE"
run_openclaw gateway call vlab.workers.status --params '{}' --json \
  > "$STATUS_FILE"

jq -e \
  '.integration.workerIsolationVersion == "0.2.2"
   and .integration.mediaCompletionRelay.gatewayOwned == true
   and .integration.mediaCompletionRelay.ackRetry == true
   and .integration.mediaCompletionRelay.idempotent == true
   and .integration.mediaCompletionRelay.failed == 0
   and .integration.gatewayOwnedToolIsolation.enabled == true
   and (.integration.gatewayOwnedToolIsolation.subprocessTools == ["skill_workshop"])
   and .integration.sessionHotset.gateway.enabled == true
   and (.workers | all(.sessionHotset.enabled == true))
   and .integration.nativeAgentHarnessDispatchAttached == true
   and .integration.nativeHarnessEventParity.contractVersion
     == "openclaw-2026.7.1-v3"
   and .integration.nativeHarnessEventParity.orderedBackpressure == true
   and .integration.nativeHarnessEventParity.eventRelayFailures == 0
   and (.integration.nativeHarnessEventParity.unclassifiedOptions | length) == 0
   and .integration.upstreamAttemptTimeoutPropagation == true
   and .integration.workerRequestTimeoutIsFallbackOnly == true
   and .integration.workerStallTimeoutMs == 120000
   and .integration.sessionRolloverRebindRetry == true
   and .integration.fastCompaction.provider == "versa-fast-quality-v1"
   and .integration.fastCompaction.model == "azure-openai/gpt-5.5"
   and .integration.configDomainIsolation.execUsesGatewayConfig == true
   and .integration.configDomainIsolation.workerExecConfigPath
     == "/home/openclaw/.openclaw/openclaw.json"
   and .minWorkers == 1
   and .maxWorkers == 3
   and .sessionsPerWorker == 3' \
  "$STATUS_FILE" >/dev/null

jq \
  --arg activated_at "$(date -u +%Y%m%dT%H%M%SZ)" \
  '.status = "active" | .activatedAt = $activated_at' \
  "$ACTIVE_MANIFEST" > "${ACTIVE_MANIFEST}.new"
chown "$SERVICE_USER:$SERVICE_GROUP" "${ACTIVE_MANIFEST}.new"
chmod 0600 "${ACTIVE_MANIFEST}.new"
mv "${ACTIVE_MANIFEST}.new" "$ACTIVE_MANIFEST"
rollback_armed=false

jq -n \
  --arg commit "$PLATFORM_COMMIT" \
  --arg version "0.2.2" \
  --arg artifact_sha256 "$ARTIFACT_SHA256" \
  --arg backup_dir "$BACKUP_DIR" \
  --arg rollback_command "sudo ${STATE_DIR}/rollback-latest.sh" \
  --argjson worker_status "$(cat "$STATUS_FILE")" \
  '{
    ok: true,
    commit: $commit,
    version: $version,
    artifactSha256: $artifact_sha256,
    backupDir: $backup_dir,
    rollbackCommand: $rollback_command,
    workerStatus: {
      minWorkers: $worker_status.minWorkers,
      maxWorkers: $worker_status.maxWorkers,
      sessionsPerWorker: $worker_status.sessionsPerWorker,
      configDomainIsolation: $worker_status.integration.configDomainIsolation,
      gatewayOwnedToolIsolation: $worker_status.integration.gatewayOwnedToolIsolation
    }
  }'
