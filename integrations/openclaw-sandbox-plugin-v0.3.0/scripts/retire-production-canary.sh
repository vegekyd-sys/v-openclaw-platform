#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

backup_root=/home/openclaw/.openclaw/backups/project-sandbox-v0.3.1
stamp=${PROJECT_SANDBOX_RETIRE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-retire}
backup_dir=$backup_root/$stamp
main_config=/home/openclaw/.openclaw/openclaw.json
worker_config=/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
state_root=/home/openclaw/.openclaw/experiments/project-sandbox-v0.3.1/state
release_root=/opt/openclaw-experiments/project-sandbox-v0.3.1
gateway_service=openclaw-gateway.service
broker_service=v-project-sandbox-broker.service
tunnel_service=v-openshell-tunnel.service
node_bin=/opt/node-v22.23.1/bin/node
openclaw_entry=/opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js
lock_path=/run/lock/v-project-sandbox-v0.3.1.lock

[[ $(id -u) -eq 0 ]] || { echo "run as root" >&2; exit 1; }
exec 9>"$lock_path"
flock -n 9 || { echo "another Project Sandbox install, rollback, or retire is active" >&2; exit 1; }
for command in cp flock jq pgrep rm stat sudo systemctl; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 1; }
done

run_openclaw() {
  sudo -u openclaw -H env \
    HOME=/home/openclaw OPENCLAW_HOME=/home/openclaw \
    OPENCLAW_STATE_DIR=/home/openclaw/.openclaw OPENCLAW_CONFIG_PATH="$main_config" \
    PATH=/opt/node-v22.23.1/bin:/usr/local/bin:/usr/bin:/bin \
    "$node_bin" "$openclaw_entry" "$@"
}

worker_status=$(run_openclaw gateway call vlab.workers.status --json --timeout 10000)
jq -e '.started == true and .pending == 0 and all(.workers[]?; .activeCount == 0 and .queued == 0)' <<<"$worker_status" >/dev/null || {
  echo "production Worker pool is not in a safe retirement window" >&2; exit 1;
}
if pgrep -u openclaw -f '/opt/openclaw-2026\.7\.1/node_modules/openclaw/dist/index\.js agent([[:space:]]|$)' >/dev/null; then
  echo "production has an active foreground OpenClaw agent process" >&2; exit 1;
fi
if [[ -S $state_root/broker.sock ]]; then
  health=$(env VLAB_SANDBOX_SOCKET="$state_root/broker.sock" "$release_root/current/bin/sandboxctl.mjs" health)
  jq -e '(.workspaces.active // 0) == 0 and (.workspaces.opening // 0) == 0 and (.workspaces.queued // 0) == 0' <<<"$health" >/dev/null || {
    echo "Project Sandbox has active or queued work" >&2; exit 1;
  }
fi

install -d -m 0700 "$backup_dir"
printf 'gateway_enabled=%s\ngateway_active=%s\nbroker_enabled=%s\nbroker_active=%s\ntunnel_enabled=%s\ntunnel_active=%s\n' \
  "$(systemctl is-enabled "$gateway_service" 2>/dev/null || true)" \
  "$(systemctl is-active "$gateway_service" 2>/dev/null || true)" \
  "$(systemctl is-enabled "$broker_service" 2>/dev/null || true)" \
  "$(systemctl is-active "$broker_service" 2>/dev/null || true)" \
  "$(systemctl is-enabled "$tunnel_service" 2>/dev/null || true)" \
  "$(systemctl is-active "$tunnel_service" 2>/dev/null || true)" > "$backup_dir/service-state.env"
for target in \
  "$main_config" "$worker_config" \
  /home/openclaw/.openclaw/extensions/project-sandbox \
  /etc/systemd/system/v-project-sandbox-broker.service \
  /etc/systemd/system/v-openshell-tunnel.service \
  "$release_root/current" \
  /usr/local/sbin/v-project-sandbox-rollback; do
  if [[ -e $target || -L $target ]]; then
    saved=$backup_dir/${target#/}
    install -d "$(dirname "$saved")"
    cp -a "$target" "$saved"
  fi
done

restore_on_error() {
  local code=${1:-1}
  trap - ERR INT TERM
  set +e
  systemctl stop "$gateway_service" "$broker_service" "$tunnel_service" >/dev/null 2>&1
  for target in \
    "$main_config" "$worker_config" \
    /home/openclaw/.openclaw/extensions/project-sandbox \
    /etc/systemd/system/v-project-sandbox-broker.service \
    /etc/systemd/system/v-openshell-tunnel.service \
    "$release_root/current" \
    /usr/local/sbin/v-project-sandbox-rollback; do
    saved=$backup_dir/${target#/}
    rm -rf -- "$target"
    if [[ -e $saved || -L $saved ]]; then
      install -d "$(dirname "$target")"
      cp -a "$saved" "$target"
    fi
  done
  systemctl daemon-reload
  systemctl enable --now "$tunnel_service" "$broker_service" "$gateway_service" >/dev/null 2>&1
  echo "Project Sandbox retirement failed and was restored from $backup_dir" >&2
  exit "$code"
}
trap 'restore_on_error $?' ERR
trap 'restore_on_error 130' INT
trap 'restore_on_error 143' TERM

systemctl stop "$gateway_service"
systemctl disable --now "$broker_service" "$tunnel_service" >/dev/null 2>&1 || true

"$node_bin" - "$main_config" "$worker_config" <<'NODE'
const fs = require("node:fs");
const sandboxTools = new Set([
  "project_sandbox_open",
  "project_sandbox_files",
  "project_sandbox_exec",
  "project_sandbox_finish",
]);
for (const configPath of process.argv.slice(2)) {
  const original = fs.readFileSync(configPath);
  const metadata = fs.statSync(configPath);
  const config = JSON.parse(original);
  if (config.plugins?.entries) delete config.plugins.entries["project-sandbox"];
  if (Array.isArray(config.plugins?.allow)) {
    config.plugins.allow = config.plugins.allow.filter((value) => value !== "project-sandbox");
  }
  if (Array.isArray(config.tools?.alsoAllow)) {
    config.tools.alsoAllow = config.tools.alsoAllow.filter((value) => !sandboxTools.has(value));
  }
  const temp = `${configPath}.${process.pid}.retire`;
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: metadata.mode & 0o777 });
  fs.chownSync(temp, metadata.uid, metadata.gid);
  if (!fs.readFileSync(configPath).equals(original)) throw new Error(`configuration changed concurrently: ${configPath}`);
  fs.renameSync(temp, configPath);
}
NODE

rm -rf -- \
  /home/openclaw/.openclaw/extensions/project-sandbox \
  /etc/systemd/system/v-project-sandbox-broker.service \
  /etc/systemd/system/v-openshell-tunnel.service \
  "$release_root/current" \
  /usr/local/sbin/v-project-sandbox-rollback
systemctl daemon-reload

run_openclaw config validate >/dev/null
systemctl enable --now "$gateway_service" >/dev/null
for _ in $(seq 1 60); do
  if systemctl is-active --quiet "$gateway_service"; then
    refreshed=$(run_openclaw gateway call vlab.workers.status --json --timeout 10000 2>/dev/null || true)
    if jq -e '.started == true and .pending == 0 and any(.workers[]?; .ready == true)' <<<"${refreshed:-"{}"}" >/dev/null; then
      break
    fi
  fi
  sleep 1
done
systemctl is-active --quiet "$gateway_service"
jq -e '
  (.plugins.entries["project-sandbox"] // null) == null and
  ((.plugins.allow // []) | index("project-sandbox") | not) and
  ((.tools.alsoAllow // []) | map(select(startswith("project_sandbox_"))) | length == 0)
' "$main_config" "$worker_config" >/dev/null
[[ $(systemctl is-active "$broker_service" 2>/dev/null || true) != active ]]
[[ $(systemctl is-active "$tunnel_service" 2>/dev/null || true) != active ]]
trap - ERR INT TERM
echo "Project Sandbox production canary retired; backup=$backup_dir; state and artifacts preserved"
