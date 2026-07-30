#!/usr/bin/env bash
set -Eeuo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
PROFILE_PATH="${VLAB_PARITY_PROFILE:-/tmp/vlab-production-parity-v1.json}"
UNIT_SOURCE="${VLAB_PARITY_UNIT_SOURCE:-/tmp/openclaw-vlab-gateway.service}"
FEISHU_PATCHER_SOURCE="${VLAB_FEISHU_PATCHER_SOURCE:-/tmp/patch-feishu-latest-snapshot-streaming.mjs}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
WORKER_CONFIG_PATH="${LAB_ROOT}/experiments/agent-worker-isolation-v1/worker-openclaw.json"
ACTIVE_MANIFEST="${LAB_ROOT}/experiments/production-parity-v1/active.json"
MAKARON_AUTH_SOURCE="${VLAB_MAKARON_AUTH_SOURCE:-/root/.makaron/auth.json}"
MAKARON_PLUGIN_SOURCE="${VLAB_MAKARON_PLUGIN_SOURCE:-${LAB_ROOT}/backups/legacy-plugin-state-seed/extensions/makaron-image}"
MAKARON_CLI_VERSION="${VLAB_MAKARON_CLI_VERSION:-0.13.0}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${LAB_ROOT}/backups/production-parity-v1/${TIMESTAMP}"
UNIT_TARGET="/etc/systemd/system/openclaw-vlab-gateway.service"
rollback_armed=false

restore_feishu_bundles() {
  local backup_root="${1}/feishu-bundles"
  local target
  [[ -d "$backup_root" ]] || return 0
  while IFS= read -r -d '' backup_file; do
    target="/${backup_file#"${backup_root}/"}"
    install -d "$(dirname "$target")"
    cp -a "$backup_file" "$target"
  done < <(find "$backup_root" -type f -print0)
}

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
    restore_feishu_bundles "$BACKUP_DIR"
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
[[ -f "$FEISHU_PATCHER_SOURCE" ]] || {
  echo "missing staged Feishu streaming patcher: $FEISHU_PATCHER_SOURCE" >&2
  exit 1
}
[[ -f "$CONFIG_PATH" ]] || {
  echo "missing vLab config: $CONFIG_PATH" >&2
  exit 1
}
[[ -f "$MAKARON_AUTH_SOURCE" ]] || {
  echo "missing VLab Makaron auth: $MAKARON_AUTH_SOURCE" >&2
  exit 1
}
[[ -f "${MAKARON_PLUGIN_SOURCE}/openclaw.plugin.json" ]] || {
  echo "missing VLab Makaron plugin source: $MAKARON_PLUGIN_SOURCE" >&2
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
feishu_streaming="$(jq -er '.config.feishuStreaming' "$PROFILE_PATH")"
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
mapfile -d '' feishu_bundles < <(
  find "${LAB_ROOT}/state/npm/projects" \
    -path "*/node_modules/@openclaw/feishu/dist/monitor.account-*.js" \
    -type f \
    -print0
)
[[ "${#feishu_bundles[@]}" -gt 0 ]] || {
  echo "missing @openclaw/feishu monitor.account bundle" >&2
  exit 1
}
for bundle in "${feishu_bundles[@]}"; do
  install -d "${BACKUP_DIR}/feishu-bundles$(dirname "$bundle")"
  cp -a "$bundle" "${BACKUP_DIR}/feishu-bundles${bundle}"
done
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

mapfile -t feishu_package_roots < <(
  printf '%s\n' "${feishu_bundles[@]}" |
    sed 's#/dist/monitor\.account-[^/]*\.js$##' |
    sort -u
)
/opt/vlab/node/bin/node \
  "$FEISHU_PATCHER_SOURCE" \
  "${feishu_package_roots[@]}"
for bundle in "${feishu_bundles[@]}"; do
  /opt/vlab/node/bin/node --check "$bundle"
done

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

makaron_plugin_path="${makaron_workspace}/plugins/makaron-image"
install -d -o vlab -g vlab -m 0700 \
  "${LAB_ROOT}/.makaron" \
  "$(dirname "$makaron_plugin_path")"
install -o vlab -g vlab -m 0600 \
  "$MAKARON_AUTH_SOURCE" "${LAB_ROOT}/.makaron/auth.json"
makaron_api_key="$(jq -er '._apiKey' "$MAKARON_AUTH_SOURCE")"
makaron_url="$(jq -er '._baseUrl' "$MAKARON_AUTH_SOURCE")"
{
  printf 'MAKARON_API_KEY=%s\n' "$makaron_api_key"
  printf 'MAKARON_URL=%s\n' "$makaron_url"
} > "${LAB_ROOT}/state/makaron.env"
chown root:root "${LAB_ROOT}/state/makaron.env"
chmod 0600 "${LAB_ROOT}/state/makaron.env"
unset makaron_api_key makaron_url
install -d -o vlab -g vlab -m 0700 "$makaron_plugin_path"
rsync -a --delete "${MAKARON_PLUGIN_SOURCE}/" "${makaron_plugin_path}/"
# The preserved vLab adapter predates the CLI binary rename and invokes
# `npx makaron-cli`. Pin it to the locally installed `makaron` binary so a
# smoke never downloads an unreviewed newer CLI at runtime.
sed -i \
  -e 's/const args = \["makaron-cli", "edit"\];/const args = ["edit"];/' \
  -e 's/spawnSync("npx", args/spawnSync("makaron", args/' \
  "${makaron_plugin_path}/image-generation-provider.js"
if [[ ! -x "${LAB_ROOT}/node_modules/.bin/makaron" ]]; then
  sudo -u vlab env \
    HOME="$LAB_ROOT" \
    PATH="/opt/vlab/node/bin:/usr/bin:/bin" \
    /opt/vlab/node/bin/npm install \
    --prefix "$LAB_ROOT" \
    --omit=dev \
    --no-audit \
    --no-fund \
    "makaron-cli@${MAKARON_CLI_VERSION}"
fi

candidate="$(mktemp)"
jq \
  --arg default_workspace "$default_workspace" \
  --arg makaron_workspace "$makaron_workspace" \
  --arg makaron_agent_dir "$makaron_agent_dir" \
  --arg personal_skills "$personal_skills" \
  --arg sessions_visibility "$sessions_visibility" \
  --argjson feishu_streaming "$feishu_streaming" \
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
  --arg makaron_plugin_path "$makaron_plugin_path" \
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
    | .channels.feishu.streaming = $feishu_streaming
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
      ) + [$makaron_plugin_path] | unique)
    | .plugins.entries["makaron-image"] = {enabled: true}
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
    --argjson feishu_streaming "$feishu_streaming" \
    --argjson agent_max "$agent_max" \
    --argjson subagent_max "$subagent_max" \
    --argjson workshop_max "$workshop_max" \
    --argjson allow_symlink_writes "$allow_symlink_writes" \
    --arg makaron_plugin_path "$makaron_plugin_path" \
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
      | .channels.feishu.streaming = $feishu_streaming
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
        ) + [$makaron_plugin_path] | unique)
      | .plugins.entries["makaron-image"] = {enabled: true}
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
