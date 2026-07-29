#!/usr/bin/env bash
set -Eeuo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
PROFILE_PATH="${VLAB_PARITY_PROFILE:-/tmp/vlab-production-parity-v1.json}"
UNIT_SOURCE="${VLAB_PARITY_UNIT_SOURCE:-/tmp/openclaw-vlab-gateway.service}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
WORKER_CONFIG_PATH="${LAB_ROOT}/experiments/agent-worker-isolation-v1/worker-openclaw.json"
ACTIVE_MANIFEST="${LAB_ROOT}/experiments/production-parity-v1/active.json"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${LAB_ROOT}/backups/production-parity-v1/${TIMESTAMP}"
UNIT_TARGET="/etc/systemd/system/openclaw-vlab-gateway.service"
rollback_armed=false

restore_on_error() {
  local exit_code=$?
  if [[ "$rollback_armed" == true ]]; then
    [[ ! -f "${BACKUP_DIR}/openclaw.json" ]] ||
      install -o vlab -g vlab -m 0600 "${BACKUP_DIR}/openclaw.json" "$CONFIG_PATH"
    [[ ! -f "${BACKUP_DIR}/worker-openclaw.json" ]] ||
      install -o vlab -g vlab -m 0600 "${BACKUP_DIR}/worker-openclaw.json" "$WORKER_CONFIG_PATH"
    [[ ! -f "${BACKUP_DIR}/openclaw-vlab-gateway.service" ]] ||
      install -m 0644 "${BACKUP_DIR}/openclaw-vlab-gateway.service" "$UNIT_TARGET"
    if [[ -L "${BACKUP_DIR}/node-target" ]]; then
      ln -sfn "$(readlink "${BACKUP_DIR}/node-target")" /opt/vlab/node
    fi
    systemctl daemon-reload || true
    systemctl restart openclaw-vlab-gateway.service || true
  fi
  exit "$exit_code"
}
trap restore_on_error ERR

if [[ "$(id -u)" -ne 0 ]]; then
  echo "apply-vlab-production-parity.sh must run as root" >&2
  exit 1
fi
for required in curl jq rsync sha256sum tar xz; do
  command -v "$required" >/dev/null || {
    echo "missing command: $required" >&2
    exit 1
  }
done
[[ -f "$PROFILE_PATH" ]] || {
  echo "missing parity profile: $PROFILE_PATH" >&2
  exit 1
}
[[ -f "$UNIT_SOURCE" ]] || {
  echo "missing staged systemd unit: $UNIT_SOURCE" >&2
  exit 1
}
[[ -f "$CONFIG_PATH" ]] || {
  echo "missing vLab config: $CONFIG_PATH" >&2
  exit 1
}

profile_name="$(jq -er '.profile' "$PROFILE_PATH")"
node_version="$(jq -er '.openclaw.nodeVersion' "$PROFILE_PATH")"
default_workspace="$(jq -er '.paths.defaultWorkspace' "$PROFILE_PATH")"
makaron_workspace="$(jq -er '.paths.makaronWorkspace' "$PROFILE_PATH")"
makaron_agent_dir="$(jq -er '.paths.makaronAgentDir' "$PROFILE_PATH")"
personal_skills="$(jq -er '.paths.personalSkills' "$PROFILE_PATH")"
agent_max="$(jq -er '.config.agentMaxConcurrent' "$PROFILE_PATH")"
subagent_max="$(jq -er '.config.subagentMaxConcurrent' "$PROFILE_PATH")"
sessions_visibility="$(jq -er '.config.sessionsVisibility' "$PROFILE_PATH")"
workshop_max="$(jq -er '.config.workshopMaxSkillBytes' "$PROFILE_PATH")"
allow_symlink_writes="$(jq -er '.config.workshopAllowSymlinkTargetWrites' "$PROFILE_PATH")"
min_workers="$(jq -er '.config.worker.minWorkers' "$PROFILE_PATH")"
max_workers="$(jq -er '.config.worker.maxWorkers' "$PROFILE_PATH")"
sessions_per_worker="$(jq -er '.config.worker.sessionsPerWorker' "$PROFILE_PATH")"
idle_timeout_ms="$(jq -er '.config.worker.idleTimeoutMs' "$PROFILE_PATH")"
request_timeout_ms="$(jq -er '.config.worker.requestTimeoutMs' "$PROFILE_PATH")"

install -d -o vlab -g vlab -m 0700 "$BACKUP_DIR"
install -o vlab -g vlab -m 0600 "$CONFIG_PATH" "${BACKUP_DIR}/openclaw.json"
if [[ -f "$WORKER_CONFIG_PATH" ]]; then
  install -o vlab -g vlab -m 0600 \
    "$WORKER_CONFIG_PATH" "${BACKUP_DIR}/worker-openclaw.json"
fi
if [[ -f "$UNIT_TARGET" ]]; then
  install -m 0644 "$UNIT_TARGET" "${BACKUP_DIR}/openclaw-vlab-gateway.service"
fi
if [[ -L /opt/vlab/node ]]; then
  ln -s "$(readlink /opt/vlab/node)" "${BACKUP_DIR}/node-target"
fi
rollback_armed=true

node_root="/opt/vlab/node-v${node_version}-linux-x64"
if [[ ! -x "${node_root}/bin/node" ]]; then
  archive="node-v${node_version}-linux-x64.tar.xz"
  download_dir="$(mktemp -d)"
  curl -fsSLo "${download_dir}/${archive}" \
    "https://nodejs.org/dist/v${node_version}/${archive}"
  curl -fsSLo "${download_dir}/SHASUMS256.txt" \
    "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
  (
    cd "$download_dir"
    grep "  ${archive}$" SHASUMS256.txt | sha256sum -c -
  )
  tar -xJf "${download_dir}/${archive}" -C /opt/vlab
  rm -rf "$download_dir"
fi
ln -sfn "$node_root" /opt/vlab/node

install -d -o vlab -g vlab -m 0700 \
  "$makaron_workspace" \
  "$personal_skills"
if [[ ! -e "${makaron_workspace}/.vlab-production-parity-seeded" ]]; then
  rsync -a "$default_workspace/" "$makaron_workspace/"
  touch "${makaron_workspace}/.vlab-production-parity-seeded"
fi

makaron_skill="${makaron_workspace}/skills/makaron"
personal_makaron_skill="${personal_skills}/makaron"
if [[ -d "$makaron_skill" && ! -L "$makaron_skill" ]]; then
  install -d -o vlab -g vlab -m 0700 "$personal_makaron_skill"
  rsync -a --delete "${makaron_skill}/" "${personal_makaron_skill}/"
  mv "$makaron_skill" "${BACKUP_DIR}/makaron-skill"
  ln -s "$personal_makaron_skill" "$makaron_skill"
elif [[ ! -e "$makaron_skill" && -d "$personal_makaron_skill" ]]; then
  install -d -o vlab -g vlab -m 0700 "$(dirname "$makaron_skill")"
  ln -s "$personal_makaron_skill" "$makaron_skill"
fi

candidate="$(mktemp)"
jq \
  --arg default_workspace "$default_workspace" \
  --arg makaron_workspace "$makaron_workspace" \
  --arg makaron_agent_dir "$makaron_agent_dir" \
  --arg personal_skills "$personal_skills" \
  --arg sessions_visibility "$sessions_visibility" \
  --argjson agent_max "$agent_max" \
  --argjson subagent_max "$subagent_max" \
  --argjson workshop_max "$workshop_max" \
  --argjson allow_symlink_writes "$allow_symlink_writes" \
  --argjson min_workers "$min_workers" \
  --argjson max_workers "$max_workers" \
  --argjson sessions_per_worker "$sessions_per_worker" \
  --argjson idle_timeout_ms "$idle_timeout_ms" \
  --argjson request_timeout_ms "$request_timeout_ms" \
  --arg worker_config_path "$WORKER_CONFIG_PATH" \
  --arg gateway_config_path "$CONFIG_PATH" \
  '
    .agents.defaults.workspace = $default_workspace
    | .agents.defaults.maxConcurrent = $agent_max
    | .agents.defaults.subagents = (.agents.defaults.subagents // {})
    | .agents.defaults.subagents.maxConcurrent = $subagent_max
    | .agents.list = ((.agents.list // []) | map(
        if .id == "makaron" then
          .workspace = $makaron_workspace
          | .agentDir = $makaron_agent_dir
        else .
        end
      ))
    | .tools = (.tools // {})
    | .tools.sessions = (.tools.sessions // {})
    | .tools.sessions.visibility = $sessions_visibility
    | .skills = (.skills // {})
    | .skills.workshop = ((.skills.workshop // {}) + {
        approvalPolicy: "auto",
        maxSkillBytes: $workshop_max,
        allowSymlinkTargetWrites: $allow_symlink_writes
      })
    | .skills.load = (.skills.load // {})
    | .skills.load.allowSymlinkTargets = [$personal_skills, ($personal_skills + "/makaron")]
    | .plugins.load.paths = ((.plugins.load.paths // []) | map(
        if startswith($default_workspace + "/plugins/") then
          sub("^" + $default_workspace; $makaron_workspace)
        else .
        end
      ))
    | .plugins.entries["vlab-agent-worker-isolation"].config = (
        (.plugins.entries["vlab-agent-worker-isolation"].config // {}) + {
          minWorkers: $min_workers,
          maxWorkers: $max_workers,
          sessionsPerWorker: $sessions_per_worker,
          idleTimeoutMs: $idle_timeout_ms,
          requestTimeoutMs: $request_timeout_ms,
          workerConfigPath: $worker_config_path,
          gatewayConfigPath: $gateway_config_path
        }
      )
  ' \
  "$CONFIG_PATH" > "$candidate"
install -o vlab -g vlab -m 0600 "$candidate" "$CONFIG_PATH"
rm -f "$candidate"

if [[ -f "$WORKER_CONFIG_PATH" ]]; then
  worker_candidate="$(mktemp)"
  jq \
    --arg default_workspace "$default_workspace" \
    --arg makaron_workspace "$makaron_workspace" \
    --arg makaron_agent_dir "$makaron_agent_dir" \
    --arg personal_skills "$personal_skills" \
    --arg sessions_visibility "$sessions_visibility" \
    --argjson agent_max "$agent_max" \
    --argjson subagent_max "$subagent_max" \
    --argjson workshop_max "$workshop_max" \
    --argjson allow_symlink_writes "$allow_symlink_writes" \
    '
      .agents.defaults.workspace = $default_workspace
      | .agents.defaults.maxConcurrent = $agent_max
      | .agents.defaults.subagents.maxConcurrent = $subagent_max
      | .agents.list = ((.agents.list // []) | map(
          if .id == "makaron" then
            .workspace = $makaron_workspace
            | .agentDir = $makaron_agent_dir
          else .
          end
        ))
      | .tools.sessions.visibility = $sessions_visibility
      | .skills.workshop = ((.skills.workshop // {}) + {
          approvalPolicy: "auto",
          maxSkillBytes: $workshop_max,
          allowSymlinkTargetWrites: $allow_symlink_writes
        })
      | .skills.load.allowSymlinkTargets = [$personal_skills, ($personal_skills + "/makaron")]
      | .plugins.load.paths = ((.plugins.load.paths // []) | map(
          if startswith($default_workspace + "/plugins/") then
            sub("^" + $default_workspace; $makaron_workspace)
          else .
          end
        ))
    ' \
    "$WORKER_CONFIG_PATH" > "$worker_candidate"
  install -o vlab -g vlab -m 0600 "$worker_candidate" "$WORKER_CONFIG_PATH"
  rm -f "$worker_candidate"
fi

install -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
chown -R vlab:vlab "$makaron_workspace" "$personal_skills"
systemctl daemon-reload

sudo -u vlab env \
  HOME="$LAB_ROOT" \
  OPENCLAW_HOME="$LAB_ROOT" \
  OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
  OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
  OPENCLAW_WORKSPACE_DIR="$default_workspace" \
  /opt/vlab/node/bin/node \
  /opt/vlab/current/node_modules/openclaw/openclaw.mjs \
  config validate >/dev/null

systemctl restart openclaw-vlab-gateway.service
for _ in $(seq 1 45); do
  if systemctl is-active --quiet openclaw-vlab-gateway.service; then
    break
  fi
  sleep 1
done
systemctl is-active --quiet openclaw-vlab-gateway.service

install -d -o vlab -g vlab -m 0700 "$(dirname "$ACTIVE_MANIFEST")"
jq -n \
  --arg profile "$profile_name" \
  --arg applied_at "$TIMESTAMP" \
  --arg backup_dir "$BACKUP_DIR" \
  --arg node_version "$node_version" \
  '{
    profile: $profile,
    appliedAt: $applied_at,
    backupDir: $backup_dir,
    nodeVersion: $node_version,
    status: "active"
  }' > "${ACTIVE_MANIFEST}.new"
chown vlab:vlab "${ACTIVE_MANIFEST}.new"
chmod 0600 "${ACTIVE_MANIFEST}.new"
mv "${ACTIVE_MANIFEST}.new" "$ACTIVE_MANIFEST"

rollback_armed=false
trap - ERR
echo "vLab production parity applied: ${profile_name}"
