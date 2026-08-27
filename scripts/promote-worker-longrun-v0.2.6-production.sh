#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-/tmp/v-worker-longrun-v0.2.6-2a9cc57.tgz}"
EXPECTED_SHA256="${2:-c80088e2dd4c313d567fbdbc1230272c60b36ab0a0439db93c2a12b49607bd18}"
RELEASE_ID="2a9cc5722e3ea094b46faeae4407b723b5156040"
RELEASE_ROOT="/opt/openclaw-experiments/agent-worker-isolation-v1/releases"
RELEASE_DIR="${RELEASE_ROOT}/${RELEASE_ID}"
STATE_DIR="/home/openclaw/.openclaw"
CONFIG_PATH="${STATE_DIR}/openclaw.json"
WORKER_CONFIG_PATH="${STATE_DIR}/experiments/agent-worker-isolation-v1/worker-openclaw.json"
SERVICE="openclaw-gateway.service"
OPENCLAW_BIN="/opt/openclaw-2026.7.1/node_modules/.bin/openclaw"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${STATE_DIR}/backups/worker-longrun-v0.2.6/${TIMESTAMP}"
STATUS_FILE="/tmp/v-worker-longrun-status-${TIMESTAMP}.json"

run_openclaw() {
  local token
  token="$(jq -r '.gateway.auth.token' "${CONFIG_PATH}")"
  sudo -u openclaw env \
    HOME=/home/openclaw \
    OPENCLAW_HOME=/home/openclaw \
    OPENCLAW_STATE_DIR="${STATE_DIR}" \
    OPENCLAW_CONFIG_PATH="${CONFIG_PATH}" \
    OPENCLAW_GATEWAY_PORT=22793 \
    OPENCLAW_GATEWAY_TOKEN="${token}" \
    TMPDIR=/tmp \
    PATH=/opt/node-v22.23.1/bin:/opt/openclaw-2026.7.1/node_modules/.bin:/usr/bin:/bin \
    "${OPENCLAW_BIN}" "$@"
}

wait_for_gateway() {
  for _ in $(seq 1 45); do
    if systemctl is-active --quiet "${SERVICE}" \
      && run_openclaw gateway call health --json >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ -f "${BACKUP_DIR}/openclaw.json.before" ]]; then
    install -o openclaw -g openclaw -m 0600 \
      "${BACKUP_DIR}/openclaw.json.before" "${CONFIG_PATH}"
  fi
  if [[ -f "${BACKUP_DIR}/worker-openclaw.json.before" ]]; then
    install -o openclaw -g openclaw -m 0600 \
      "${BACKUP_DIR}/worker-openclaw.json.before" "${WORKER_CONFIG_PATH}"
  fi
  systemctl restart "${SERVICE}" || true
  wait_for_gateway || true
  echo "production promotion failed; restored exact predeploy configs from ${BACKUP_DIR}" >&2
  exit "${exit_code}"
}

[[ "$(id -u)" == "0" ]] || {
  echo "run as root" >&2
  exit 1
}

actual_sha256="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"
[[ "${actual_sha256}" == "${EXPECTED_SHA256}" ]] || {
  echo "candidate archive SHA-256 mismatch" >&2
  exit 1
}

run_openclaw gateway call vlab.workers.status --json > "${STATUS_FILE}"
pending="$(jq -r '.pending' "${STATUS_FILE}")"
active="$(jq -r '[.workers[].activeCount] | add // 0' "${STATUS_FILE}")"
[[ "${pending}" == "0" && "${active}" == "0" ]] || {
  echo "unsafe production window: pending=${pending}, active=${active}" >&2
  exit 75
}
baseline_min_workers="$(jq -r '.minWorkers' "${STATUS_FILE}")"
baseline_max_workers="$(jq -r '.maxWorkers' "${STATUS_FILE}")"
baseline_sessions_per_worker="$(jq -r '.sessionsPerWorker' "${STATUS_FILE}")"
baseline_max_active_sessions="$(jq -r '.maxActiveSessions' "${STATUS_FILE}")"

install -d -o openclaw -g openclaw -m 0700 "${BACKUP_DIR}"
install -o openclaw -g openclaw -m 0600 \
  "${CONFIG_PATH}" "${BACKUP_DIR}/openclaw.json.before"
install -o openclaw -g openclaw -m 0600 \
  "${WORKER_CONFIG_PATH}" "${BACKUP_DIR}/worker-openclaw.json.before"
systemctl cat "${SERVICE}" > "${BACKUP_DIR}/systemd-unit.before.txt"
jq '.plugins.load.paths' "${CONFIG_PATH}" \
  > "${BACKUP_DIR}/plugin-load-paths.before.json"
sha256sum \
  "${BACKUP_DIR}/openclaw.json.before" \
  "${BACKUP_DIR}/worker-openclaw.json.before" \
  > "${BACKUP_DIR}/manifest.sha256"

trap rollback ERR

release_tmp="${RELEASE_DIR}.tmp-${TIMESTAMP}"
rm -rf "${release_tmp}"
install -d -o root -g root -m 0755 "${release_tmp}"
tar -xzf "${ARCHIVE_PATH}" --strip-components=2 -C "${release_tmp}"
chown -R root:root "${release_tmp}"
find "${release_tmp}" -type d -exec chmod 0755 {} +
find "${release_tmp}" -type f -exec chmod 0644 {} +
if [[ -e "${RELEASE_DIR}" ]]; then
  rm -rf "${release_tmp}"
else
  mv "${release_tmp}" "${RELEASE_DIR}"
fi

patch_config() {
  local source_path=$1
  local destination_path=$2
  local candidate
  candidate="$(mktemp)"
  jq --arg release_dir "${RELEASE_DIR}" --arg release_root "${RELEASE_ROOT}/" '
    .plugins.load.paths = (
      ((.plugins.load.paths // [])
        | map(select((startswith($release_root)) | not)))
      + [$release_dir]
      | unique
    )
    | .plugins.entries["vlab-agent-worker-isolation"].config.nativeRequestTimeoutMs = 21600000
  ' "${source_path}" > "${candidate}"
  install -o openclaw -g openclaw -m 0600 "${candidate}" "${destination_path}"
  rm -f "${candidate}"
}

patch_config "${CONFIG_PATH}" "${CONFIG_PATH}"
patch_config "${WORKER_CONFIG_PATH}" "${WORKER_CONFIG_PATH}"

sudo -u openclaw env \
  HOME=/home/openclaw \
  OPENCLAW_HOME=/home/openclaw \
  OPENCLAW_STATE_DIR="${STATE_DIR}" \
  OPENCLAW_CONFIG_PATH="${CONFIG_PATH}" \
  TMPDIR=/tmp \
  PATH=/opt/node-v22.23.1/bin:/opt/openclaw-2026.7.1/node_modules/.bin:/usr/bin:/bin \
  "${OPENCLAW_BIN}" config validate >/dev/null

systemctl restart "${SERVICE}"
wait_for_gateway

run_openclaw gateway call vlab.workers.status --json > "${STATUS_FILE}.after"
jq -e \
  --argjson min_workers "${baseline_min_workers}" \
  --argjson max_workers "${baseline_max_workers}" \
  --argjson sessions_per_worker "${baseline_sessions_per_worker}" \
  --argjson max_active_sessions "${baseline_max_active_sessions}" '
    .integration.workerIsolationVersion == "0.2.6"
    and .integration.nativeRequestTimeoutFloorMs == 21600000
    and .integration.upstreamDefaultDoesNotCapNativeRun == true
    and .minWorkers == $min_workers
    and .maxWorkers == $max_workers
    and .sessionsPerWorker == $sessions_per_worker
    and .maxActiveSessions == $max_active_sessions
    and .pending == 0
    and ([.workers[] | select(.ready == true)] | length) >= $min_workers
  ' "${STATUS_FILE}.after" >/dev/null

trap - ERR
echo "production Worker 0.2.6 promoted"
echo "backup=${BACKUP_DIR}"
echo "release=${RELEASE_DIR}"
echo "topology=${baseline_max_workers}x${baseline_sessions_per_worker}; maxActive=${baseline_max_active_sessions}"
