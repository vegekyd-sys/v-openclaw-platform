#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="${LAB_ROOT:-/srv/vlab}"
LAB_USER="${LAB_USER:-vlab}"
LAB_PORT="${LAB_PORT:-23793}"
OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.7.1}"
NODE_VERSION="${NODE_VERSION:-22.22.3}"
SOURCE_STATE="${SOURCE_STATE:-/root/.openclaw}"
SOURCE_WORKSPACE="${SOURCE_WORKSPACE:-/root/makaron-openclaw/.openclaw-local/workspace}"
UNIT_SOURCE="${UNIT_SOURCE:-/tmp/openclaw-vlab-gateway.service}"
UNIT_TARGET="/etc/systemd/system/openclaw-vlab-gateway.service"
RELEASE_ROOT="/opt/vlab/releases/${OPENCLAW_VERSION}"
NODE_ROOT="/opt/vlab/node-v${NODE_VERSION}-linux-x64"
SEED_MARKER="${LAB_ROOT}/state/.seeded-from-v-from-versa"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "bootstrap-vlab.sh must run as root" >&2
  exit 1
fi

for required in curl jq rsync openssl sha256sum tar xz; do
  command -v "$required" >/dev/null || { echo "missing command: $required" >&2; exit 1; }
done

[[ -f "${SOURCE_STATE}/openclaw.json" ]] || {
  echo "missing source config: ${SOURCE_STATE}/openclaw.json" >&2
  exit 1
}
[[ -d "$SOURCE_WORKSPACE" ]] || {
  echo "missing source workspace: $SOURCE_WORKSPACE" >&2
  exit 1
}
[[ -f "$UNIT_SOURCE" ]] || {
  echo "missing staged systemd unit: $UNIT_SOURCE" >&2
  exit 1
}

if ss -ltnH | awk '{print $4}' | grep -Eq "(^|:)${LAB_PORT}$"; then
  if ! systemctl is-active --quiet openclaw-vlab-gateway.service; then
    echo "port ${LAB_PORT} is already occupied by another process" >&2
    exit 1
  fi
fi

systemctl stop openclaw-vlab-gateway.service 2>/dev/null || true

available_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
if (( available_kb < 20 * 1024 * 1024 )); then
  echo "vLab requires at least 20 GiB free on the root filesystem" >&2
  exit 1
fi

if ! id "$LAB_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$LAB_ROOT" --shell /usr/sbin/nologin "$LAB_USER"
fi

install -d -m 0755 /opt/vlab /opt/vlab/releases

if [[ ! -x "${NODE_ROOT}/bin/node" ]]; then
  node_archive="node-v${NODE_VERSION}-linux-x64.tar.xz"
  node_download_dir="$(mktemp -d)"
  trap 'rm -rf "$node_download_dir"' EXIT

  curl -fsSLo "${node_download_dir}/${node_archive}" \
    "https://nodejs.org/dist/v${NODE_VERSION}/${node_archive}"
  curl -fsSLo "${node_download_dir}/SHASUMS256.txt" \
    "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"

  (
    cd "$node_download_dir"
    grep "  ${node_archive}$" SHASUMS256.txt | sha256sum -c -
  )
  tar -xJf "${node_download_dir}/${node_archive}" -C /opt/vlab
fi

ln -sfn "$NODE_ROOT" /opt/vlab/node
export PATH="/opt/vlab/node/bin:${PATH}"

if [[ ! -f "${RELEASE_ROOT}/node_modules/openclaw/openclaw.mjs" ]]; then
  install -d -m 0755 "$RELEASE_ROOT"
  /opt/vlab/node/bin/npm install \
    --prefix "$RELEASE_ROOT" \
    --omit=dev \
    --no-audit \
    --no-fund \
    "openclaw@${OPENCLAW_VERSION}"
fi

ln -sfn "$RELEASE_ROOT" /opt/vlab/current

install -d -o "$LAB_USER" -g "$LAB_USER" -m 0700 \
  "$LAB_ROOT/state" \
  "$LAB_ROOT/state/agents/makaron" \
  "$LAB_ROOT/workspace" \
  "$LAB_ROOT/logs"

if [[ ! -f "$SEED_MARKER" ]]; then
  for state_dir in agents/makaron memory identity credentials extensions skills plugin-skills plugins plugin-state state; do
    if [[ -e "${SOURCE_STATE}/${state_dir}" ]]; then
      install -d -o "$LAB_USER" -g "$LAB_USER" -m 0700 "${LAB_ROOT}/state/${state_dir}"
      rsync -a --delete "${SOURCE_STATE}/${state_dir}/" "${LAB_ROOT}/state/${state_dir}/"
    fi
  done

  for workspace_file in AGENTS.md BOOTSTRAP.md HEARTBEAT.md IDENTITY.md MEMORY.md SOUL.md TOOLS.md USER.md; do
    if [[ -f "${SOURCE_WORKSPACE}/${workspace_file}" ]]; then
      install -m 0600 "${SOURCE_WORKSPACE}/${workspace_file}" "${LAB_ROOT}/workspace/${workspace_file}"
    fi
  done

  for workspace_dir in memory skills scripts plugins; do
    if [[ -d "${SOURCE_WORKSPACE}/${workspace_dir}" ]]; then
      install -d -m 0700 "${LAB_ROOT}/workspace/${workspace_dir}"
      rsync -a --delete "${SOURCE_WORKSPACE}/${workspace_dir}/" "${LAB_ROOT}/workspace/${workspace_dir}/"
    fi
  done

  if [[ -f "${LAB_ROOT}/state/agents/makaron/sessions/sessions.json" ]]; then
    jq \
      --arg old_state "${SOURCE_STATE}/agents/makaron" \
      --arg new_state "${LAB_ROOT}/state/agents/makaron" \
      --arg old_workspace "$SOURCE_WORKSPACE" \
      --arg new_workspace "${LAB_ROOT}/workspace" \
      'walk(
        if type == "string" then
          gsub("^" + $old_state; $new_state)
          | gsub("^" + $old_workspace; $new_workspace)
        else .
        end
      )' \
      "${LAB_ROOT}/state/agents/makaron/sessions/sessions.json" \
      > "${LAB_ROOT}/state/agents/makaron/sessions/sessions.json.vlab"
    mv \
      "${LAB_ROOT}/state/agents/makaron/sessions/sessions.json.vlab" \
      "${LAB_ROOT}/state/agents/makaron/sessions/sessions.json"
  fi

  if [[ -f "${LAB_ROOT}/workspace/AGENTS.md" ]]; then
    mv "${LAB_ROOT}/workspace/AGENTS.md" "${LAB_ROOT}/workspace/AGENTS.source-v-from-versa.md"
  fi
  {
    echo "# vLab operating boundary"
    echo
    echo "You are vLab, an isolated OpenClaw development and regression environment."
    echo "You are not private V and not the live V from Versa agent."
    echo "Never send external messages, publish, pay, delete remote resources, or modify another Gateway."
    echo "All experiments must stay inside ${LAB_ROOT} unless Tianyi explicitly approves a wider target."
    echo "Use copied sessions and memory as test fixtures; do not treat them as live production state."
    echo
    if [[ -f "${LAB_ROOT}/workspace/AGENTS.source-v-from-versa.md" ]]; then
      echo "## Source behavior snapshot"
      echo
      cat "${LAB_ROOT}/workspace/AGENTS.source-v-from-versa.md"
    fi
  } > "${LAB_ROOT}/workspace/AGENTS.md"

  if [[ -f "${LAB_ROOT}/workspace/IDENTITY.md" ]]; then
    mv "${LAB_ROOT}/workspace/IDENTITY.md" "${LAB_ROOT}/workspace/IDENTITY.source-v-from-versa.md"
  fi
  {
    echo "# vLab"
    echo
    echo "vLab is the isolated development and regression instance for private V/OpenClaw."
    echo "Its source snapshot came from V from Versa, but it has no production channel ownership."
  } > "${LAB_ROOT}/workspace/IDENTITY.md"

  touch "$SEED_MARKER"
fi

if [[ -s "${LAB_ROOT}/state/gateway-token" ]]; then
  gateway_token="$(cat "${LAB_ROOT}/state/gateway-token")"
else
  gateway_token="$(openssl rand -hex 32)"
fi
jq \
  --arg source_state "$SOURCE_STATE" \
  --arg lab_state "${LAB_ROOT}/state" \
  --arg source_workspace "$SOURCE_WORKSPACE" \
  --arg workspace "${LAB_ROOT}/workspace" \
  --arg agent_dir "${LAB_ROOT}/state/agents/makaron/agent" \
  --arg token "$gateway_token" \
  --argjson port "$LAB_PORT" \
  '
    walk(
      if type == "string" then
        gsub("^" + $source_state; $lab_state)
        | gsub("^" + $source_workspace; $workspace)
      else .
      end
    )
    | .gateway = ((.gateway // {}) + {
      port: $port,
      bind: "loopback",
      auth: {mode: "token", token: $token},
      reload: {mode: "off"}
    })
    | .channels = {}
    | del(.hooks)
    | .agents.defaults.workspace = $workspace
    | .agents.list = ((.agents.list // []) | map(
        if .id == "makaron" then
          .name = "vLab"
          | .workspace = $workspace
          | .agentDir = $agent_dir
        else .
        end
      ))
    | if (.browser? | type) == "object" then
        del(.browser.controlPort)
      else .
      end
    | if (.plugins.entries? | type) == "object" then
        .plugins.entries |= with_entries(
          if (.key | test("feishu|lark|slack|telegram|wecom|wechat|dingtalk|qq"; "i"))
          then .value.enabled = false
          else .
          end
        )
      else .
      end
  ' \
  "${SOURCE_STATE}/openclaw.json" \
  > "${LAB_ROOT}/state/openclaw.json"

printf '%s\n' "$gateway_token" > "${LAB_ROOT}/state/gateway-token"
chmod 0600 "${LAB_ROOT}/state/openclaw.json" "${LAB_ROOT}/state/gateway-token"

if [[ -f "${SOURCE_STATE}/.env" ]]; then
  awk -F= '
    /^[[:space:]]*#/ { next }
    $1 ~ /^(AZURE_OPENAI|OPENAI|ANTHROPIC|DEEPSEEK|GEMINI|GOOGLE|XAI|OPENROUTER|PERPLEXITY|TAVILY|BRAVE|BING|SERPAPI)_[A-Z0-9_]+$/ { print }
  ' "${SOURCE_STATE}/.env" > "${LAB_ROOT}/state/.env"
  chmod 0600 "${LAB_ROOT}/state/.env"
fi

chown -R "$LAB_USER:$LAB_USER" "$LAB_ROOT"
chmod 0700 "$LAB_ROOT" "$LAB_ROOT/state" "$LAB_ROOT/workspace"

install -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
systemctl daemon-reload
systemctl enable openclaw-vlab-gateway.service

doctor_log="${LAB_ROOT}/logs/bootstrap-doctor.log"
set +e
sudo -u "$LAB_USER" env \
  HOME="$LAB_ROOT" \
  OPENCLAW_HOME="$LAB_ROOT" \
  OPENCLAW_STATE_DIR="${LAB_ROOT}/state" \
  OPENCLAW_CONFIG_PATH="${LAB_ROOT}/state/openclaw.json" \
  OPENCLAW_WORKSPACE_DIR="${LAB_ROOT}/workspace" \
  /opt/vlab/node/bin/node \
  /opt/vlab/current/node_modules/openclaw/openclaw.mjs \
  doctor --fix >"$doctor_log" 2>&1
doctor_exit=$?
set -e

per_agent_memory_db="${LAB_ROOT}/state/agents/makaron/agent/openclaw-agent.sqlite"
legacy_memory_dir="${LAB_ROOT}/state/memory"
if [[ -d "$legacy_memory_dir" ]] \
  && [[ -f "$per_agent_memory_db" ]] \
  && [[ "$(stat -c %s "$per_agent_memory_db")" -gt 1048576 ]]; then
  legacy_backup="${LAB_ROOT}/backups/legacy-memory-core-seed"
  install -d -o "$LAB_USER" -g "$LAB_USER" -m 0700 "${LAB_ROOT}/backups"
  if [[ ! -e "$legacy_backup" ]]; then
    mv "$legacy_memory_dir" "$legacy_backup"
  fi
fi

if (( doctor_exit != 0 )) && [[ ! -s "$per_agent_memory_db" ]]; then
  echo "vLab doctor failed before creating a per-agent memory database; see $doctor_log" >&2
  exit "$doctor_exit"
fi

find "${LAB_ROOT}/state/logs/stability" \
  -maxdepth 1 \
  -type f \
  \( -name '*gateway.startup_failed.json' -o -name '*gateway.crash_loop_breaker.json' \) \
  -delete 2>/dev/null || true
systemctl reset-failed openclaw-vlab-gateway.service 2>/dev/null || true
systemctl restart openclaw-vlab-gateway.service

echo "vLab bootstrap completed"
systemctl show openclaw-vlab-gateway.service \
  -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent --no-pager
