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
AGENT_RUNTIME="/opt/openclaw-2026.7.1/node_modules/openclaw/dist/plugin-sdk/agent-runtime.js"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SHORT_COMMIT="${PLATFORM_COMMIT:0:7}"
BACKUP_DIR="${STATE_ROOT}/backups/agent-worker-isolation-v1/${TIMESTAMP}-${SHORT_COMMIT}"
BACKUP_CONFIG="${BACKUP_DIR}/openclaw.json"
BACKUP_WORKER_CONFIG="${BACKUP_DIR}/worker-openclaw.json"
PREVIOUS_ACTIVE_MANIFEST="${BACKUP_DIR}/active.json"
HEALTH_FILE="${BACKUP_DIR}/candidate-health.json"
STATUS_FILE="${BACKUP_DIR}/candidate-worker-status.json"
rollback_armed=false
candidate_config=""
worker_candidate_config=""
manifest_candidate=""
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
  exec-env.mjs \
  harness-result.mjs \
  harness-failure.mjs \
  session-rollover-retry.mjs \
  fast-compaction-provider.mjs \
  self-test.mjs; do
  [[ -f "${RELEASE_DIR}/${required}" ]] || {
    echo "release is missing ${required}" >&2
    exit 1
  }
done
[[ "$(jq -r '.version' "${RELEASE_DIR}/package.json")" == "0.1.5-p1" ]] || {
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
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$CONFIG_PATH" "$BACKUP_CONFIG"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$WORKER_CONFIG_PATH" "$BACKUP_WORKER_CONFIG"
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
  "$ACTIVE_MANIFEST" "$PREVIOUS_ACTIVE_MANIFEST"
rollback_armed=true

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
  '.agents.defaults.maxConcurrent == 8
   and .agents.defaults.subagents.maxConcurrent == 8' \
  "$candidate_config" >/dev/null

worker_candidate_config="$(mktemp)"
jq '.' "$candidate_config" > "$worker_candidate_config"
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
  --arg version "0.1.5-p1" \
  --arg prepared_at "$TIMESTAMP" \
  --arg artifact_sha256 "$ARTIFACT_SHA256" \
  --arg release_dir "$RELEASE_DIR" \
  --arg backup_config "$BACKUP_CONFIG" \
  --arg backup_worker_config "$BACKUP_WORKER_CONFIG" \
  --arg previous_active_manifest "$PREVIOUS_ACTIVE_MANIFEST" \
  --arg backup_dir "$BACKUP_DIR" \
  --arg rollback_command \
    "sudo ${STATE_DIR}/rollback-latest.sh" \
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
    status: "activating"
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
  '.integration.workerIsolationVersion == "0.1.5-p1"
   and .integration.nativeAgentHarnessDispatchAttached == true
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
  --arg version "0.1.5-p1" \
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
      configDomainIsolation: $worker_status.integration.configDomainIsolation
    }
  }'
