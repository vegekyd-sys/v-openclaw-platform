#!/usr/bin/env bash
set -Eeuo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
MIN_WORKERS="${VLAB_WORKER_MIN_COUNT:-1}"
WORKER_COUNT="${VLAB_WORKER_COUNT:-3}"
SESSIONS_PER_WORKER="${VLAB_WORKER_SESSIONS_PER_WORKER:-3}"
AGENT_MAX_CONCURRENT="${VLAB_AGENT_MAX_CONCURRENT:-8}"
SUBAGENT_MAX_CONCURRENT="${VLAB_SUBAGENT_MAX_CONCURRENT:-8}"
IDLE_TIMEOUT_MS="${VLAB_WORKER_IDLE_TIMEOUT_MS:-180000}"
ARCHIVE_PATH="${ARCHIVE_PATH:-/tmp/vlab-agent-worker-isolation-v1.tar.gz}"
PLATFORM_COMMIT="${PLATFORM_COMMIT:?PLATFORM_COMMIT is required}"
PLUGIN_ID="vlab-agent-worker-isolation"
EXPERIMENT_ROOT="/opt/vlab/experiments/agent-worker-isolation-v1"
RELEASE_DIR="${EXPERIMENT_ROOT}/releases/${PLATFORM_COMMIT}"
STATE_DIR="${LAB_ROOT}/experiments/agent-worker-isolation-v1"
WORKER_CONFIG_PATH="${STATE_DIR}/worker-openclaw.json"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${LAB_ROOT}/backups/agent-worker-isolation-v1/${TIMESTAMP}"
ACTIVE_MANIFEST="${STATE_DIR}/active.json"
PRE_DEPLOY_CONFIG="${BACKUP_DIR}/openclaw.json"
ROLLBACK_CONFIG="$PRE_DEPLOY_CONFIG"
rollback_armed=false

run_openclaw() {
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    OPENCLAW_HOME="$LAB_ROOT" \
    OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
    OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
    OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
    "$NODE" "$OPENCLAW" "$@"
}

restore_on_error() {
  local exit_code=$?
  if [[ "$rollback_armed" == true ]] && [[ -f "$PRE_DEPLOY_CONFIG" ]]; then
    install -o vlab -g vlab -m 0600 "$PRE_DEPLOY_CONFIG" "$CONFIG_PATH"
    systemctl restart openclaw-vlab-gateway.service || true
  fi
  exit "$exit_code"
}
trap restore_on_error ERR

if [[ "$(id -u)" -ne 0 ]]; then
  echo "activate-agent-worker-experiment.sh must run as root" >&2
  exit 1
fi
if ! [[ "$MIN_WORKERS" =~ ^[0-9]+$ ]] \
  || (( MIN_WORKERS < 1 || MIN_WORKERS > 16 )); then
  echo "VLAB_WORKER_MIN_COUNT must be an integer between 1 and 16" >&2
  exit 1
fi
if ! [[ "$WORKER_COUNT" =~ ^[0-9]+$ ]] \
  || (( WORKER_COUNT < MIN_WORKERS || WORKER_COUNT > 3 )); then
  echo "VLAB_WORKER_COUNT must be an integer between VLAB_WORKER_MIN_COUNT and 3" >&2
  exit 1
fi
if ! [[ "$SESSIONS_PER_WORKER" =~ ^[0-9]+$ ]] \
  || (( SESSIONS_PER_WORKER < 1 || SESSIONS_PER_WORKER > 3 )); then
  echo "VLAB_WORKER_SESSIONS_PER_WORKER must be an integer between 1 and 3" >&2
  exit 1
fi
if ! [[ "$AGENT_MAX_CONCURRENT" =~ ^[0-9]+$ ]] \
  || (( AGENT_MAX_CONCURRENT < SESSIONS_PER_WORKER || AGENT_MAX_CONCURRENT > 64 )); then
  echo "VLAB_AGENT_MAX_CONCURRENT must be an integer between VLAB_WORKER_SESSIONS_PER_WORKER and 64" >&2
  exit 1
fi
if ! [[ "$SUBAGENT_MAX_CONCURRENT" =~ ^[0-9]+$ ]] \
  || (( SUBAGENT_MAX_CONCURRENT < 1 || SUBAGENT_MAX_CONCURRENT > 64 )); then
  echo "VLAB_SUBAGENT_MAX_CONCURRENT must be an integer between 1 and 64" >&2
  exit 1
fi
if ! [[ "$IDLE_TIMEOUT_MS" =~ ^[0-9]+$ ]] \
  || (( IDLE_TIMEOUT_MS < 100 || IDLE_TIMEOUT_MS > 3600000 )); then
  echo "VLAB_WORKER_IDLE_TIMEOUT_MS must be an integer between 100 and 3600000" >&2
  exit 1
fi
[[ -f "$ARCHIVE_PATH" ]] || {
  echo "missing experiment archive: $ARCHIVE_PATH" >&2
  exit 1
}
[[ -f "$CONFIG_PATH" ]] || {
  echo "missing vLab config: $CONFIG_PATH" >&2
  exit 1
}
[[ -x "$NODE" && -f "$OPENCLAW" ]] || {
  echo "vLab OpenClaw runtime is incomplete" >&2
  exit 1
}
systemctl is-active --quiet openclaw-vlab-gateway.service

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
  harness-result.mjs \
  stubborn-worker.mjs \
  self-test.mjs; do
  [[ -f "${RELEASE_DIR}/${required}" ]] || {
    echo "release is missing ${required}" >&2
    exit 1
  }
done

sudo -u vlab env \
  HOME="$LAB_ROOT" \
  VLAB_OPENCLAW_AGENT_RUNTIME="/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/agent-runtime.js" \
  "$NODE" "${RELEASE_DIR}/self-test.mjs" \
  > "${LAB_ROOT}/logs/agent-worker-self-test-${TIMESTAMP}.json"

install -d -o vlab -g vlab -m 0700 "$BACKUP_DIR" "$STATE_DIR"
install -o vlab -g vlab -m 0600 "$CONFIG_PATH" "$PRE_DEPLOY_CONFIG"
if jq -e \
  '.plugins.entries["vlab-agent-worker-isolation"].enabled == true' \
  "$CONFIG_PATH" >/dev/null 2>&1; then
  while IFS= read -r candidate; do
    if ! jq -e \
      '.plugins.entries["vlab-agent-worker-isolation"].enabled == true' \
      "$candidate" >/dev/null 2>&1; then
      ROLLBACK_CONFIG="$candidate"
      break
    fi
  done < <(
    find "${LAB_ROOT}/backups/agent-worker-isolation-v1" \
      -mindepth 2 \
      -maxdepth 2 \
      -name openclaw.json \
      -type f \
      -print \
      | sort -r
  )
fi
rollback_armed=true

candidate_config="$(mktemp)"
jq \
  --arg plugin_id "$PLUGIN_ID" \
  --arg release_dir "$RELEASE_DIR" \
  --arg experiment_root "$EXPERIMENT_ROOT" \
  --arg worker_config_path "$WORKER_CONFIG_PATH" \
  --argjson min_workers "$MIN_WORKERS" \
  --argjson worker_count "$WORKER_COUNT" \
  --argjson sessions_per_worker "$SESSIONS_PER_WORKER" \
  --argjson agent_max_concurrent "$AGENT_MAX_CONCURRENT" \
  --argjson subagent_max_concurrent "$SUBAGENT_MAX_CONCURRENT" \
  --argjson idle_timeout_ms "$IDLE_TIMEOUT_MS" \
  '
    .tools = (.tools // {})
    | .tools.sessions = (.tools.sessions // {})
    | .tools.sessions.visibility = "agent"
    | .agents = (.agents // {})
    | .agents.defaults = (.agents.defaults // {})
    | .agents.defaults.maxConcurrent = $agent_max_concurrent
    | .agents.defaults.models = (
        (.agents.defaults.models // {})
        | with_entries(
            .value = ((.value // {}) + {
              agentRuntime: (((.value // {}).agentRuntime // {}) + {
                id: "vlab-worker"
              })
            })
          )
      )
    | .models = (.models // {})
    | .models.providers = (
        (.models.providers // {})
        | with_entries(
            .value = ((.value // {}) + {
              agentRuntime: (((.value // {}).agentRuntime // {}) + {
                id: "vlab-worker"
              })
            })
          )
      )
    | .agents.defaults.subagents = (.agents.defaults.subagents // {})
    | .agents.defaults.subagents.maxConcurrent = $subagent_max_concurrent
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
        config: {
          minWorkers: $min_workers,
          maxWorkers: $worker_count,
          sessionsPerWorker: $sessions_per_worker,
          idleTimeoutMs: $idle_timeout_ms,
          requestTimeoutMs: 600000,
          workerConfigPath: $worker_config_path
        }
      }
  ' \
  "$CONFIG_PATH" > "$candidate_config"
install -o vlab -g vlab -m 0600 "$candidate_config" "$CONFIG_PATH"

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
  ' \
  "$candidate_config" > "$worker_candidate_config"
install -o vlab -g vlab -m 0600 \
  "$worker_candidate_config" \
  "$WORKER_CONFIG_PATH"
rm -f "$worker_candidate_config"
rm -f "$candidate_config"

run_openclaw config validate >/dev/null
systemctl restart openclaw-vlab-gateway.service

for _ in $(seq 1 30); do
  if systemctl is-active --quiet openclaw-vlab-gateway.service \
    && run_openclaw gateway call health --params '{}' --json >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

run_openclaw gateway call health --params '{}' --json \
  > "${LAB_ROOT}/logs/agent-worker-health-${TIMESTAMP}.json"
run_openclaw gateway call vlab.workers.status --params '{}' --json \
  > "${LAB_ROOT}/logs/agent-worker-status-${TIMESTAMP}.json"

ready_worker_count="$(
  jq -r '(.result // .).workers | length' \
    "${LAB_ROOT}/logs/agent-worker-status-${TIMESTAMP}.json"
)"
[[ "$ready_worker_count" == "$MIN_WORKERS" ]] || {
  echo "expected ${MIN_WORKERS} warm workers, got ${ready_worker_count}" >&2
  false
}

jq -n \
  --arg experiment "agent-worker-isolation-v1" \
  --arg platform_commit "$PLATFORM_COMMIT" \
  --arg release_dir "$RELEASE_DIR" \
  --arg config_backup "$ROLLBACK_CONFIG" \
  --arg pre_deploy_config "$PRE_DEPLOY_CONFIG" \
  --arg activated_at "$TIMESTAMP" \
  '{
    experiment: $experiment,
    platformCommit: $platform_commit,
    releaseDir: $release_dir,
    configBackup: $config_backup,
    preDeployConfig: $pre_deploy_config,
    activatedAt: $activated_at,
    status: "active"
  }' \
  > "${ACTIVE_MANIFEST}.new"
chown vlab:vlab "${ACTIVE_MANIFEST}.new"
chmod 0600 "${ACTIVE_MANIFEST}.new"
mv "${ACTIVE_MANIFEST}.new" "$ACTIVE_MANIFEST"

rollback_armed=false
trap - ERR

echo "vLab Agent Worker Isolation activated"
jq '{ok, result: ((.result // .) | {started, minWorkers, maxWorkers, sessionsPerWorker, maxActiveSessions, idleTimeoutMs, pending, workers})}' \
  "${LAB_ROOT}/logs/agent-worker-status-${TIMESTAMP}.json"
