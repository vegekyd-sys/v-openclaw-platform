#!/usr/bin/env bash
set -Eeuo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
PROFILE_PATH="${VLAB_PARITY_PROFILE:-/tmp/vlab-production-parity-v1.json}"
CONFIG_PATH="${LAB_ROOT}/state/openclaw.json"
WORKER_CONFIG_PATH="${LAB_ROOT}/experiments/agent-worker-isolation-v1/worker-openclaw.json"
ACTIVE_MANIFEST="${LAB_ROOT}/experiments/production-parity-v1/active.json"
OPENCLAW="/opt/vlab/current/node_modules/openclaw/openclaw.mjs"
NODE="/opt/vlab/node/bin/node"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "vlab-production-parity.sh must run as root" >&2
  exit 1
fi
for path in "$PROFILE_PATH" "$CONFIG_PATH" "$WORKER_CONFIG_PATH" "$ACTIVE_MANIFEST"; do
  [[ -f "$path" ]] || {
    echo "missing parity input: $path" >&2
    exit 1
  }
done

expected_node="$(jq -er '.openclaw.nodeVersion' "$PROFILE_PATH")"
expected_release="${VLAB_EXPECTED_WORKER_RELEASE:-$(
  jq -er '.productionReference.workerRelease' "$PROFILE_PATH"
)}"
default_workspace="$(jq -er '.paths.defaultWorkspace' "$PROFILE_PATH")"
makaron_workspace="$(jq -er '.paths.makaronWorkspace' "$PROFILE_PATH")"
personal_skills="$(jq -er '.paths.personalSkills' "$PROFILE_PATH")"
actual_node="$("$NODE" -p 'process.versions.node')"
[[ "$actual_node" == "$expected_node" ]]

jq -e \
  --arg default_workspace "$default_workspace" \
  --arg makaron_workspace "$makaron_workspace" \
  --arg personal_skills "$personal_skills" \
  '
    .agents.defaults.workspace == $default_workspace
    and .agents.defaults.maxConcurrent == 10
    and .agents.defaults.subagents.maxConcurrent == 8
    and any(.agents.list[]; .id == "makaron"
      and .workspace == $makaron_workspace
      and .agentDir == "/srv/vlab/state/agents/makaron/agent")
    and .tools.sessions.visibility == "all"
    and .channels.feishu.streaming == true
    and .skills.workshop.approvalPolicy == "auto"
    and .skills.workshop.maxSkillBytes == 100000
    and .skills.workshop.allowSymlinkTargetWrites == true
    and .skills.load.allowSymlinkTargets == [
      $personal_skills,
      ($personal_skills + "/makaron")
    ]
    and all(.plugins.load.paths[]?;
      (startswith($default_workspace + "/plugins/") | not))
    and (.plugins.load.paths | index($makaron_workspace + "/plugins/makaron-image")) != null
    and .plugins.entries["makaron-image"].enabled == true
    and .plugins.entries["vlab-agent-worker-isolation"].config.minWorkers == 1
    and .plugins.entries["vlab-agent-worker-isolation"].config.maxWorkers == 3
    and .plugins.entries["vlab-agent-worker-isolation"].config.sessionsPerWorker == 3
    and .plugins.entries["vlab-agent-worker-isolation"].config.idleTimeoutMs == 180000
    and .plugins.entries["vlab-agent-worker-isolation"].config.requestTimeoutMs == 600000
    and .plugins.entries["vlab-agent-worker-isolation"].config.requestStallTimeoutMs == 120000
  ' "$CONFIG_PATH" >/dev/null

jq -e \
  --arg makaron_workspace "$makaron_workspace" \
  --arg personal_skills "$personal_skills" \
  '
    .agents.defaults.maxConcurrent == 10
    and .agents.defaults.subagents.maxConcurrent == 8
    and any(.agents.list[]; .id == "makaron" and .workspace == $makaron_workspace)
    and .tools.sessions.visibility == "all"
    and .channels.feishu.streaming == true
    and .skills.workshop.maxSkillBytes == 100000
    and .skills.workshop.allowSymlinkTargetWrites == true
    and .skills.load.allowSymlinkTargets == [
      $personal_skills,
      ($personal_skills + "/makaron")
    ]
    and all(.plugins.load.paths[]?;
      (startswith("/srv/vlab/workspace/plugins/") | not))
  ' "$WORKER_CONFIG_PATH" >/dev/null

[[ "$(systemctl show openclaw-vlab-gateway.service -p Restart --value)" == "always" ]]
[[ "$(systemctl show openclaw-vlab-gateway.service -p MemoryHigh --value)" == "5368709120" ]]
[[ "$(systemctl show openclaw-vlab-gateway.service -p MemoryMax --value)" == "6442450944" ]]
systemctl is-active --quiet openclaw-vlab-gateway.service
[[ -d "$makaron_workspace" ]]
[[ -L "${makaron_workspace}/skills/makaron" ]]
[[ "$(realpath "${makaron_workspace}/skills/makaron")" == "${personal_skills}/makaron" ]]
[[ -f "${makaron_workspace}/plugins/makaron-image/openclaw.plugin.json" ]]
[[ -x "${LAB_ROOT}/node_modules/.bin/makaron" ]]
[[ -s "${LAB_ROOT}/state/makaron.env" ]]
[[ "$(stat -c %a "${LAB_ROOT}/state/makaron.env")" == "600" ]]
[[ "$(jq -er '.platformCommit' "${LAB_ROOT}/experiments/agent-worker-isolation-v1/active.json")" == "$expected_release" ]]

sudo -u vlab env \
  HOME="$LAB_ROOT" \
  OPENCLAW_HOME="$LAB_ROOT" \
  OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
  OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
  OPENCLAW_WORKSPACE_DIR="$default_workspace" \
  "$NODE" "$OPENCLAW" config validate >/dev/null
sudo -u vlab env \
  HOME="$LAB_ROOT" \
  OPENCLAW_HOME="$LAB_ROOT" \
  OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
  OPENCLAW_CONFIG_PATH="$CONFIG_PATH" \
  OPENCLAW_WORKSPACE_DIR="$default_workspace" \
  "$NODE" "$OPENCLAW" gateway call health --params '{}' --json >/dev/null

jq -n \
  --arg profile "$(jq -er '.profile' "$PROFILE_PATH")" \
  --arg node "$actual_node" \
  --arg worker_release "$expected_release" \
  --argjson intentional_differences "$(jq '.intentionalDifferences' "$PROFILE_PATH")" \
  '{
    ok: true,
    profile: $profile,
    nodeVersion: $node,
    workerRelease: $worker_release,
    configSemanticsMatched: true,
    workspaceLayoutMatched: true,
    serviceSemanticsMatched: true,
    intentionalDifferences: $intentional_differences
  }'
