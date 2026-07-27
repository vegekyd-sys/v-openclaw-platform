#!/usr/bin/env bash
set -Eeuo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
ARCHIVE_PATH="${ARCHIVE_PATH:-/tmp/vlab-agent-worker-isolation-v1.tar.gz}"
PLATFORM_COMMIT="${PLATFORM_COMMIT:?PLATFORM_COMMIT is required}"
PLUGIN_ID="vlab-agent-worker-isolation"
EXPERIMENT_ROOT="/opt/vlab/experiments/agent-worker-isolation-v1"
RELEASE_DIR="${EXPERIMENT_ROOT}/releases/${PLATFORM_COMMIT}"
STATE_DIR="${LAB_ROOT}/experiments/agent-worker-isolation-v1"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${LAB_ROOT}/backups/agent-worker-isolation-v1/${TIMESTAMP}"
ACTIVE_MANIFEST="${STATE_DIR}/active.json"
CONFIG_BACKUP="${BACKUP_DIR}/openclaw.json"
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
  if [[ "$rollback_armed" == true ]] && [[ -f "$CONFIG_BACKUP" ]]; then
    install -o vlab -g vlab -m 0600 "$CONFIG_BACKUP" "$CONFIG_PATH"
    systemctl restart openclaw-vlab-gateway.service || true
  fi
  exit "$exit_code"
}
trap restore_on_error ERR

if [[ "$(id -u)" -ne 0 ]]; then
  echo "activate-agent-worker-experiment.sh must run as root" >&2
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
fi

for required in \
  package.json \
  openclaw.plugin.json \
  index.mjs \
  worker-pool.mjs \
  worker.mjs \
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
install -o vlab -g vlab -m 0600 "$CONFIG_PATH" "$CONFIG_BACKUP"
rollback_armed=true

candidate_config="$(mktemp)"
jq \
  --arg plugin_id "$PLUGIN_ID" \
  --arg release_dir "$RELEASE_DIR" \
  '
    .plugins = (.plugins // {})
    | .plugins.load = (.plugins.load // {})
    | .plugins.load.paths = (((.plugins.load.paths // []) + [$release_dir]) | unique)
    | .plugins.entries = (.plugins.entries // {})
    | .plugins.entries[$plugin_id] = {
        enabled: true,
        config: {
          maxWorkers: 2,
          requestTimeoutMs: 600000
        }
      }
  ' \
  "$CONFIG_PATH" > "$candidate_config"
install -o vlab -g vlab -m 0600 "$candidate_config" "$CONFIG_PATH"
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

worker_count="$(
  jq -r '(.result // .).workers | length' \
    "${LAB_ROOT}/logs/agent-worker-status-${TIMESTAMP}.json"
)"
[[ "$worker_count" == "2" ]] || {
  echo "expected two ready workers, got ${worker_count}" >&2
  exit 1
}

jq -n \
  --arg experiment "agent-worker-isolation-v1" \
  --arg platform_commit "$PLATFORM_COMMIT" \
  --arg release_dir "$RELEASE_DIR" \
  --arg config_backup "$CONFIG_BACKUP" \
  --arg activated_at "$TIMESTAMP" \
  '{
    experiment: $experiment,
    platformCommit: $platform_commit,
    releaseDir: $release_dir,
    configBackup: $config_backup,
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
jq '{ok, result: ((.result // .) | {started, maxWorkers, workers})}' \
  "${LAB_ROOT}/logs/agent-worker-status-${TIMESTAMP}.json"
