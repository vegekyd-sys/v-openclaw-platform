#!/usr/bin/env bash
set -euo pipefail
umask 077

source_dir=${1:-/tmp/project-sandbox-v0.3.1}
release_root=/opt/openclaw-experiments/project-sandbox-v0.3.1
release_id=${PROJECT_SANDBOX_RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)}
release_dir=$release_root/releases/$release_id
current_link=$release_root/current
backup_root=/home/openclaw/.openclaw/backups/project-sandbox-v0.3.1
backup_dir=$backup_root/$release_id
latest_backup=$backup_root/LATEST
main_config=/home/openclaw/.openclaw/openclaw.json
worker_config=/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
project_id=v-evolution-engine
project_path=/home/openclaw/makaron-openclaw/.openclaw-local/workspace/v-evolution-engine
agent_id=v-codex
session_key=agent:v-codex:feishu:group:oc_3355cd58853f38e19a613b8ff644f52f
experiment_root=/home/openclaw/.openclaw/experiments/project-sandbox-v0.3.1
node_bin=/opt/node-v22.23.1/bin/node
npm_bin=/opt/node-v22.23.1/bin/npm
openclaw_entry=/opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js
gateway_service=openclaw-gateway.service
broker_service=v-project-sandbox-broker.service
openshell_bin=/usr/bin/openshell
openshell_workspace=v-project-prod
tunnel_service=v-openshell-tunnel.service
lock_path=/run/lock/v-project-sandbox-v0.3.1.lock

[[ $(id -u) -eq 0 ]] || { echo "run as root" >&2; exit 1; }
exec 9>"$lock_path"
flock -n 9 || { echo "another Project Sandbox install or rollback is active" >&2; exit 1; }
for command in cp flock jq pgrep readlink realpath sha256sum stat sudo systemctl; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 1; }
done
for path in "$node_bin" "$npm_bin" /usr/bin/openshell; do
  [[ -x $path ]] || { echo "missing executable: $path" >&2; exit 1; }
done
[[ -f $openclaw_entry && -f $source_dir/package.json && -f $source_dir/plugin/openclaw.plugin.json ]] || {
  echo "invalid release source or OpenClaw install" >&2; exit 1;
}
[[ -d $project_path ]] || { echo "production canary project is missing" >&2; exit 1; }
[[ $(realpath -e "$project_path") == "$project_path" ]] || { echo "unexpected project symlink" >&2; exit 1; }
for config in "$main_config" "$worker_config"; do
  [[ -f $config ]] || { echo "missing config: $config" >&2; exit 1; }
  [[ $(stat -c '%U:%G %a' "$config") == "openclaw:openclaw 600" ]] || {
    echo "unexpected owner or mode for $config" >&2; exit 1;
  }
done
for path in \
  /home/openclaw/.ssh/project-sandbox-config \
  /home/openclaw/.config/openshell/active_gateway \
  /home/openclaw/.config/openshell/gateways/v-sandbox-prod/metadata.json \
  /home/openclaw/.config/openshell/gateways/v-sandbox-prod/mtls/ca.crt \
  /home/openclaw/.config/openshell/gateways/v-sandbox-prod/mtls/tls.crt \
  /home/openclaw/.config/openshell/gateways/v-sandbox-prod/mtls/tls.key; do
  [[ -f $path ]] || { echo "missing prepared OpenShell client file: $path" >&2; exit 1; }
done

run_openclaw() {
  local config=$1
  shift
  sudo -u openclaw -H env \
    HOME=/home/openclaw OPENCLAW_HOME=/home/openclaw \
    OPENCLAW_STATE_DIR=/home/openclaw/.openclaw OPENCLAW_CONFIG_PATH="$config" \
    PATH=/opt/node-v22.23.1/bin:/usr/local/bin:/usr/bin:/bin \
    "$node_bin" "$openclaw_entry" "$@"
}

worker_status=$(run_openclaw "$main_config" gateway call vlab.workers.status --json --timeout 10000)
jq -e '.started == true and .pending == 0 and all(.workers[]?; .activeCount == 0 and .queued == 0)' <<<"$worker_status" >/dev/null || {
  echo "production Worker pool is not in a safe deployment window" >&2; exit 1;
}
if pgrep -u openclaw -f '/opt/openclaw-2026\.7\.1/node_modules/openclaw/dist/index\.js agent([[:space:]]|$)' >/dev/null; then
  echo "production has an active foreground OpenClaw agent process" >&2; exit 1;
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
  "$current_link" \
  /usr/local/sbin/v-project-sandbox-rollback; do
  if [[ -e $target || -L $target ]]; then
    saved=$backup_dir/${target#/}
    install -d "$(dirname "$saved")"
    cp -a "$target" "$saved"
  fi
done
printf '%s\n' "$backup_dir" > "$latest_backup.new"
mv "$latest_backup.new" "$latest_backup"

rollback_on_error() {
  local code=${1:-1}
  local line=${2:-unknown}
  trap - ERR INT TERM
  set +e
  echo "production Project Sandbox install failed at line $line; starting automatic rollback" >&2
  PROJECT_SANDBOX_LOCK_HELD=1 bash "$source_dir/scripts/rollback-production-canary.sh" "$backup_dir"
  local rollback_code=$?
  (( rollback_code == 0 )) || { echo "automatic rollback failed; backup=$backup_dir" >&2; exit 70; }
  exit "$code"
}
trap 'rollback_on_error $? $LINENO' ERR
trap 'rollback_on_error 130' INT
trap 'rollback_on_error 143' TERM

systemctl stop "$gateway_service"
systemctl stop "$broker_service" "$tunnel_service" 2>/dev/null || true
install -d -o root -g root -m 0755 "$release_root/releases"
cp -a "$source_dir" "$release_dir"
chown -R root:root "$release_dir"
ln -sfn "$release_dir" "$current_link"
install -d -o openclaw -g openclaw -m 0700 "$experiment_root/state" "$experiment_root/state/artifacts"
install -d -o openclaw -g openclaw -m 0750 "$experiment_root/policies"
install -o openclaw -g openclaw -m 0644 "$release_dir/policies/offline-dev-v1.yaml" "$experiment_root/policies/offline-dev-v1.yaml"
install -o openclaw -g openclaw -m 0644 "$release_dir/policies/packages-dev-v1.yaml" "$experiment_root/policies/packages-dev-v1.yaml"
install -o root -g root -m 0644 "$release_dir/systemd/v-openshell-tunnel.service" /etc/systemd/system/v-openshell-tunnel.service
install -o root -g root -m 0644 "$release_dir/systemd/v-project-sandbox-broker.service" /etc/systemd/system/v-project-sandbox-broker.service

chmod 0755 "$release_dir/bin/"*.mjs "$release_dir/scripts/"*.sh
ln -sfn "$release_dir/scripts/rollback-production-canary.sh" /usr/local/sbin/v-project-sandbox-rollback

install -d -o openclaw -g openclaw -m 0700 /home/openclaw/.openclaw/tmp
plugin_stage=$(mktemp -d /home/openclaw/.openclaw/tmp/project-sandbox-plugin.XXXXXX)
chown openclaw:openclaw "$plugin_stage"
plugin_name=$(sudo -u openclaw -H env HOME=/home/openclaw PATH=/opt/node-v22.23.1/bin:/usr/bin:/bin \
  "$npm_bin" pack "$release_dir/plugin" --pack-destination "$plugin_stage" --silent | tail -n 1)
plugin_tgz=$plugin_stage/$(basename "$plugin_name")
[[ -f $plugin_tgz ]] || { echo "Plugin package was not created" >&2; exit 1; }
run_openclaw "$main_config" plugins install --force "$plugin_tgz"
sudo -u openclaw -H "$node_bin" "$release_dir/scripts/configure-production-canary.mjs" \
  "$main_config" "$project_id" "$project_path" "$agent_id" "$session_key"
sudo -u openclaw -H "$node_bin" "$release_dir/scripts/configure-production-canary.mjs" \
  "$worker_config" "$project_id" "$project_path" "$agent_id" "$session_key"
run_openclaw "$main_config" config validate >/dev/null
run_openclaw "$worker_config" config validate >/dev/null
plugin_inspect=$(run_openclaw "$main_config" plugins inspect project-sandbox --json)
jq -e '.plugin.status == "loaded" and .plugin.version == "0.3.1" and (.diagnostics | length) == 0' <<<"$plugin_inspect" >/dev/null
jq -e --arg agent "$agent_id" --arg session "$session_key" --arg project "$project_id" '
  .plugins.entries["project-sandbox"].config.allowedAgentIds == [$agent] and
  .plugins.entries["project-sandbox"].config.allowedSessionKeys == [$session] and
  .plugins.entries["project-sandbox"].config.allowedSessionPrefixes == [] and
  (.plugins.entries["project-sandbox"].config.projects | keys) == [$project]
' "$main_config" >/dev/null
jq -e --slurpfile main "$main_config" '
  .plugins.entries["project-sandbox"].config == $main[0].plugins.entries["project-sandbox"].config
' "$worker_config" >/dev/null

systemctl daemon-reload
systemctl enable --now "$tunnel_service"
for _ in $(seq 1 20); do
  systemctl is-active --quiet "$tunnel_service" && break
  sleep 1
done
systemctl is-active --quiet "$tunnel_service"
if ! sudo -u openclaw -H env HOME=/home/openclaw OPENSHELL_GATEWAY=v-sandbox-prod \
  "$openshell_bin" workspace get "$openshell_workspace" >/dev/null 2>&1; then
  sudo -u openclaw -H env HOME=/home/openclaw OPENSHELL_GATEWAY=v-sandbox-prod \
    "$openshell_bin" workspace create --name "$openshell_workspace" --label environment=production >/dev/null
fi
systemctl enable --now "$broker_service"
for _ in $(seq 1 30); do
  [[ -S $experiment_root/state/broker.sock ]] && break
  sleep 1
done
broker_health=$(sudo -u openclaw -H env \
  VLAB_SANDBOX_SOCKET="$experiment_root/state/broker.sock" \
  "$release_dir/bin/sandboxctl.mjs" health)
jq -e '.ok == true and (.workspaces.active // 0) == 0 and (.workspaces.opening // 0) == 0 and (.workspaces.queued // 0) == 0' <<<"$broker_health" >/dev/null
gateway_restarts_before=$(systemctl show "$gateway_service" -p NRestarts --value)
systemctl start "$gateway_service"
refreshed=
worker_ready=0
for _ in $(seq 1 60); do
  if systemctl is-active --quiet "$gateway_service"; then
    if refreshed=$(run_openclaw "$main_config" gateway call vlab.workers.status --json --timeout 10000 2>/dev/null); then
      if jq -e '.started == true and .pending == 0 and any(.workers[]?; .ready == true)' <<<"$refreshed" >/dev/null; then
        worker_ready=1
        break
      fi
    fi
  fi
  sleep 1
done
systemctl is-active --quiet "$gateway_service"
[[ $worker_ready == 1 ]] || { echo "production Worker pool did not become ready within 60 seconds" >&2; exit 1; }
sleep 5
systemctl is-active --quiet "$tunnel_service"
systemctl is-active --quiet "$broker_service"
[[ $(systemctl show "$tunnel_service" -p NRestarts --value) == 0 ]] || { echo "OpenShell tunnel restart loop detected" >&2; exit 1; }
[[ $(systemctl show "$broker_service" -p NRestarts --value) == 0 ]] || { echo "Project Sandbox Broker restart loop detected" >&2; exit 1; }
gateway_restarts_after=$(systemctl show "$gateway_service" -p NRestarts --value)
[[ $gateway_restarts_before == "$gateway_restarts_after" ]] || { echo "Gateway restart loop detected" >&2; exit 1; }

cat > "$backup_dir/ROLLBACK.txt" <<EOF
One-click rollback (only when Sandbox is idle):
  sudo /usr/local/sbin/v-project-sandbox-rollback "$backup_dir"
The default command without an argument uses $latest_backup.
Session, Memory, Broker state, and artifacts are preserved.
EOF
trap - ERR INT TERM
echo "production Project Sandbox v0.3.1 installed; backup=$backup_dir"
