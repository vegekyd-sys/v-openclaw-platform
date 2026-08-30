#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

source_dir=${1:-/srv/vlab/staging/openclaw-sandbox-plugin-v0.3.0}
release_dir=/srv/vlab/releases/openclaw-sandbox-plugin-v0.3.0
backup_root=/srv/vlab/backups/openclaw-sandbox-plugin-v0.3.0
main_config=/srv/vlab/state/openclaw.json
worker_config=/srv/vlab/experiments/agent-worker-isolation-v1/worker-openclaw.json
project_id=${VLAB_SANDBOX_PROJECT_ID:-v-core}
project_path=${VLAB_SANDBOX_PROJECT_PATH:-/srv/vlab/projects/v-core}
node_bin=/opt/vlab/node/bin/node
npm_bin=/opt/vlab/node/bin/npm
openclaw_entry=/opt/vlab/current/node_modules/openclaw/openclaw.mjs
gateway_service=openclaw-vlab-gateway.service
broker_service=vlab-sandbox-broker.service
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=$backup_root/$stamp
lock_path=/run/lock/vlab-openclaw-sandbox-plugin-v0.3.0.lock
min_free_kib=${VLAB_SANDBOX_MIN_FREE_KIB:-10485760}
max_disk_used_percent=${VLAB_SANDBOX_MAX_DISK_USED_PERCENT:-95}
codex_plugin_spec=@openclaw/codex@2026.7.1
codex_plugin_integrity='sha512-OCEVg4R3yb5vXZiwchJp02o+XmWklnF9EdcXgQUGfvVELwIwJvvvQYJ0tp0M2zJLuA4zDSYPtFVDGviKRrKd2w=='
codex_stage=
gateway_token_stage=
config_stage=
rotate_gateway_token=${VLAB_ROTATE_GATEWAY_TOKEN:-0}

if [[ $(id -u) -ne 0 ]]; then
  echo "install-vlab.sh must run as root" >&2
  exit 1
fi
exec 9>"$lock_path"
flock -n 9 || { echo "another Project Sandbox install or rollback is active" >&2; exit 1; }

for command in awk df flock jq mktemp pgrep realpath stat sudo systemctl; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 1; }
done
if ! [[ $min_free_kib =~ ^[0-9]+$ && $max_disk_used_percent =~ ^[0-9]+$ ]]; then
  echo "invalid VLab disk safety thresholds" >&2
  exit 1
fi
[[ $rotate_gateway_token =~ ^[01]$ ]] || { echo "invalid VLAB_ROTATE_GATEWAY_TOKEN flag" >&2; exit 1; }
for executable in "$node_bin" "$npm_bin"; do
  [[ -x $executable ]] || { echo "missing VLab runtime: $executable" >&2; exit 1; }
done
[[ -f $openclaw_entry ]] || { echo "missing VLab OpenClaw entry: $openclaw_entry" >&2; exit 1; }
id vlab >/dev/null 2>&1 || { echo "VLab service user is missing" >&2; exit 1; }
systemctl cat "$gateway_service" >/dev/null
systemctl cat "$broker_service" >/dev/null

read -r disk_free_kib disk_used_percent < <(
  df -k --output=avail,pcent /srv/vlab | tail -n 1 | awk '{ gsub(/%/, "", $2); print $1, $2 }'
)
if (( disk_free_kib < min_free_kib || disk_used_percent >= max_disk_used_percent )); then
  echo "VLab disk safety gate failed: free_kib=$disk_free_kib used_percent=$disk_used_percent" >&2
  exit 1
fi

if [[ ! -f $source_dir/package.json || ! -f $source_dir/bin/sandboxd.mjs || ! -f $source_dir/plugin/openclaw.plugin.json ]]; then
  echo "invalid release source: $source_dir" >&2
  exit 1
fi
if [[ ! $project_id =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]]; then
  echo "invalid VLab project id: $project_id" >&2
  exit 1
fi
project_path=$(realpath -e "$project_path")
case "$project_path" in
  /srv/vlab/projects|/srv/vlab/projects/*|/srv/vlab/state/sandbox/projects|/srv/vlab/state/sandbox/projects/*) ;;
  *) echo "approved project is outside VLab project roots: $project_path" >&2; exit 1 ;;
esac
[[ -d $project_path ]] || { echo "approved VLab project is missing: $project_path" >&2; exit 1; }

for config in "$main_config" "$worker_config"; do
  [[ -f $config ]] || { echo "missing VLab config: $config" >&2; exit 1; }
  [[ $(stat -c '%U:%G %a' "$config") == "vlab:vlab 600" ]] || {
    echo "unexpected owner or mode for $config" >&2
    exit 1
  }
done

run_openclaw() {
  local config_path=$1
  shift
  sudo -u vlab -H env \
    HOME=/srv/vlab \
    OPENCLAW_HOME=/srv/vlab \
    OPENCLAW_STATE_DIR=/srv/vlab/state \
    OPENCLAW_CONFIG_PATH="$config_path" \
    OPENCLAW_WORKSPACE_DIR=/srv/vlab/workspace \
    TMPDIR=/srv/vlab/tmp \
    PATH=/srv/vlab/node_modules/.bin:/opt/vlab/node/bin:/usr/local/bin:/usr/bin:/bin \
    "$node_bin" "$openclaw_entry" "$@"
}

progress() {
  printf '[project-sandbox-install] %s\n' "$*"
}

broker_restarts_before=$(systemctl show "$broker_service" -p NRestarts --value)
worker_status=$(run_openclaw "$main_config" gateway call vlab.workers.status --json --timeout 10000)
jq -e '.started == true and .pending == 0 and all(.workers[]?; .activeCount == 0 and .queued == 0)' <<<"$worker_status" >/dev/null || {
  echo "VLab Worker pool is not in a safe deployment window" >&2
  exit 1
}
broker_health=$(sudo -u vlab -H /srv/vlab/bin/sandboxctl health)
jq -e '
  .ok == true and
  (.running // .jobs.running // 0) == 0 and
  (.queued // .jobs.queued // 0) == 0 and
  (.workspaces.active // 0) == 0 and
  (.workspaces.opening // 0) == 0 and
  (.workspaces.queued // 0) == 0
' <<<"$broker_health" >/dev/null || {
  echo "VLab Broker is not idle" >&2
  exit 1
}
if pgrep -u vlab -f '/opt/vlab/current/node_modules/openclaw/dist/index\.js agent([[:space:]]|$)' >/dev/null; then
  echo "VLab has an active foreground openclaw agent process; refusing to restart Gateway" >&2
  exit 1
fi

codex_stage=$(mktemp -d /srv/vlab/staging/project-sandbox-codex.XXXXXX)
chown vlab:vlab "$codex_stage"
cleanup_stage() {
  if [[ -n ${codex_stage:-} && $codex_stage == /srv/vlab/staging/project-sandbox-codex.* && -d $codex_stage ]]; then
    rm -rf -- "$codex_stage"
  fi
  if [[ -n ${gateway_token_stage:-} && $gateway_token_stage == /run/vlab-gateway-token.* && -f $gateway_token_stage ]]; then
    rm -f -- "$gateway_token_stage"
  fi
  case ${config_stage:-} in
    /srv/vlab/state/.gateway-token-rotation.*|/srv/vlab/experiments/agent-worker-isolation-v1/.gateway-token-rotation.*)
      [[ -f $config_stage ]] && rm -f -- "$config_stage"
      ;;
  esac
}
trap cleanup_stage EXIT
codex_pack_json=$(
  sudo -u vlab -H env HOME=/srv/vlab PATH=/opt/vlab/node/bin:/usr/bin:/bin \
    "$npm_bin" pack "$codex_plugin_spec" --pack-destination "$codex_stage" --json
)
[[ $(jq -r '.[0].integrity // empty' <<<"$codex_pack_json") == "$codex_plugin_integrity" ]] || {
  echo "Codex Plugin package integrity mismatch" >&2
  exit 1
}
codex_tgz=$codex_stage/$(jq -r '.[0].filename // empty' <<<"$codex_pack_json")
[[ -f $codex_tgz ]] || { echo "Codex Plugin package was not created" >&2; exit 1; }

install -d -m 0700 "$backup_dir"
progress "backup created: $backup_dir"
printf 'gateway_enabled=%s\ngateway_active=%s\nbroker_enabled=%s\nbroker_active=%s\n' \
  "$(systemctl is-enabled "$gateway_service" 2>/dev/null || true)" \
  "$(systemctl is-active "$gateway_service" 2>/dev/null || true)" \
  "$(systemctl is-enabled "$broker_service" 2>/dev/null || true)" \
  "$(systemctl is-active "$broker_service" 2>/dev/null || true)" \
  > "$backup_dir/service-state.env"
for directory in \
  /srv/vlab/projects \
  /srv/vlab/state/sandbox/projects \
  /srv/vlab/state/sandbox-broker \
  /srv/vlab/state/sandbox-broker/artifacts \
  /srv/vlab/state/sandbox/policies \
  /srv/vlab/bin; do
  if [[ -d $directory ]]; then
    printf '%s\t%s\t%s\t%s\n' \
      "$(stat -c '%a' "$directory")" \
      "$(stat -c '%u' "$directory")" \
      "$(stat -c '%g' "$directory")" \
      "$directory" >> "$backup_dir/directory-modes.tsv"
  fi
done
for entry in \
  /etc/systemd/system/vlab-sandbox-broker.service \
  /srv/vlab/state/gateway-token \
  "$main_config" \
  "$worker_config" \
  "$release_dir" \
  /srv/vlab/state/extensions/project-sandbox \
  /srv/vlab/state/extensions/codex \
  /srv/vlab/bin/sandboxctl \
  /srv/vlab/state/sandbox/policies/offline-dev-v1.yaml \
  /srv/vlab/state/sandbox/policies/packages-dev-v1.yaml; do
  if [[ -e $entry || -L $entry ]]; then
    name=${entry#/}
    install -d "$backup_dir/$(dirname "$name")"
    cp -a "$entry" "$backup_dir/$name"
  fi
done

rollback_on_error() {
  local exit_code=${1:-1}
  trap - ERR INT TERM
  set +e
  VLAB_SANDBOX_LOCK_HELD=1 bash "$source_dir/scripts/rollback-vlab.sh" "$backup_dir"
  local rollback_code=$?
  if (( rollback_code != 0 )); then
    echo "automatic rollback failed with exit $rollback_code; backup=$backup_dir" >&2
    exit 70
  fi
  exit "$exit_code"
}
trap 'rollback_on_error $?' ERR
trap 'rollback_on_error 130' INT
trap 'rollback_on_error 143' TERM

systemctl stop "$gateway_service"
systemctl stop "$broker_service"

install -d -o vlab -g vlab -m 0750 /srv/vlab/projects
install -d -o vlab -g vlab -m 0700 \
  /srv/vlab/state/sandbox/projects \
  /srv/vlab/state/sandbox-broker \
  /srv/vlab/state/sandbox-broker/artifacts
install -d -o vlab -g vlab -m 0750 /srv/vlab/state/sandbox/policies /srv/vlab/bin
install -d -o vlab -g vlab -m 0700 \
  /srv/vlab/workspaces/vlab-sandbox-openclaw \
  /srv/vlab/workspaces/vlab-sandbox-codex

if [[ $source_dir != "$release_dir" ]]; then
  rm -rf "$release_dir.new"
  cp -a "$source_dir" "$release_dir.new"
  chown -R vlab:vlab "$release_dir.new"
  rm -rf "$release_dir"
  mv "$release_dir.new" "$release_dir"
fi

install -o vlab -g vlab -m 0644 "$release_dir/policies/offline-dev-v1.yaml" /srv/vlab/state/sandbox/policies/offline-dev-v1.yaml
install -o vlab -g vlab -m 0644 "$release_dir/policies/packages-dev-v1.yaml" /srv/vlab/state/sandbox/policies/packages-dev-v1.yaml
install -o root -g root -m 0644 "$release_dir/systemd/vlab-sandbox-broker.service" /etc/systemd/system/vlab-sandbox-broker.service
ln -sfn "$release_dir/bin/sandboxctl.mjs" /srv/vlab/bin/sandboxctl
chmod 0755 "$release_dir/bin/"*.mjs "$release_dir/scripts/"*.sh

plugin_tgz=$(
  sudo -u vlab -H env PATH=/opt/vlab/node/bin:/usr/bin:/bin \
    "$npm_bin" pack "$release_dir/plugin" --pack-destination "$release_dir" --silent | tail -n 1
)
plugin_tgz=$release_dir/$(basename "$plugin_tgz")
[[ -f $plugin_tgz ]] || { echo "Plugin package was not created" >&2; exit 1; }
run_openclaw "$main_config" plugins install --force "$plugin_tgz"
run_openclaw "$main_config" plugins install --force "$codex_plugin_spec"
sudo -u vlab -H "$node_bin" "$release_dir/scripts/configure-vlab.mjs" "$main_config" "$project_id" "$project_path"
sudo -u vlab -H "$node_bin" "$release_dir/scripts/configure-vlab.mjs" "$worker_config" "$project_id" "$project_path"
sudo -u vlab -H "$node_bin" "$release_dir/scripts/configure-vlab-agents.mjs" "$main_config"
if [[ $rotate_gateway_token == 1 ]]; then
  progress "rotating the VLab-only Gateway token without exposing it in process arguments"
  gateway_token_stage=$(mktemp /run/vlab-gateway-token.XXXXXX)
  "$node_bin" -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' > "$gateway_token_stage"
  [[ $(wc -c < "$gateway_token_stage") == 64 ]] || {
    echo "failed to generate a VLab Gateway token" >&2
    exit 1
  }
  for config in "$main_config" "$worker_config"; do
    config_stage=$(mktemp "$(dirname "$config")/.gateway-token-rotation.XXXXXX")
    jq --rawfile token "$gateway_token_stage" \
      '.gateway.auth.mode = "token" | .gateway.auth.token = $token' \
      "$config" > "$config_stage"
    chown vlab:vlab "$config_stage"
    chmod 0600 "$config_stage"
    mv "$config_stage" "$config"
    config_stage=
  done
  install -o vlab -g vlab -m 0600 "$gateway_token_stage" /srv/vlab/state/gateway-token
fi
progress "validating main and Worker configurations"
run_openclaw "$main_config" config validate
run_openclaw "$worker_config" config validate
progress "inspecting Project Sandbox and official Codex plugins"
run_openclaw "$main_config" plugins inspect project-sandbox --runtime --json \
  > "$backup_dir/project-sandbox-inspect.json" \
  2> "$backup_dir/project-sandbox-inspect.stderr"
jq -e '.plugin.status == "loaded" and .plugin.version == "0.3.1" and (.diagnostics | length) == 0' \
  "$backup_dir/project-sandbox-inspect.json" >/dev/null
run_openclaw "$main_config" plugins inspect codex --runtime --json \
  > "$backup_dir/codex-inspect.json" \
  2> "$backup_dir/codex-inspect.stderr"
jq -e '.plugin.status == "loaded" and .plugin.version == "2026.7.1" and .plugin.trustedOfficialInstall == true and (.diagnostics | length) == 0' \
  "$backup_dir/codex-inspect.json" >/dev/null
run_openclaw "$main_config" plugins doctor \
  > "$backup_dir/plugins-doctor.stdout" \
  2> "$backup_dir/plugins-doctor.stderr"
grep -F 'No plugin issues detected' "$backup_dir/plugins-doctor.stdout" >/dev/null
jq -S '.plugins.entries["project-sandbox"]' "$main_config" > "$backup_dir/main-plugin-config.json"
jq -S '.plugins.entries["project-sandbox"]' "$worker_config" > "$backup_dir/worker-plugin-config.json"
cmp -s "$backup_dir/main-plugin-config.json" "$backup_dir/worker-plugin-config.json" || {
  echo "main and Worker Project Sandbox configs differ" >&2
  exit 1
}

cat > "$backup_dir/ROLLBACK.txt" <<EOF
sudo bash $release_dir/scripts/rollback-vlab.sh $backup_dir
EOF
systemctl daemon-reload
systemctl enable "$broker_service"
progress "starting persistent Project Sandbox Broker"
systemctl start "$broker_service"
for _ in $(seq 1 100); do
  [[ -S /srv/vlab/state/sandbox-broker/broker.sock ]] && break
  sleep 0.1
done
[[ -S /srv/vlab/state/sandbox-broker/broker.sock ]] || {
  systemctl status "$broker_service" --no-pager >&2 || true
  exit 1
}
new_health=$(sudo -u vlab -H /srv/vlab/bin/sandboxctl health)
jq -e '.ok == true and (.workspaces | type) == "object" and (.capacity | type) == "object" and .capacity.active == 0' <<<"$new_health" >/dev/null

gateway_restarts_before=$(systemctl show "$gateway_service" -p NRestarts --value)
progress "starting VLab Gateway and waiting for an isolated Worker"
systemctl start "$gateway_service"
refreshed_worker_status=
worker_ready=0
for _ in $(seq 1 60); do
  if systemctl is-active --quiet "$gateway_service"; then
    if refreshed_worker_status=$(run_openclaw "$main_config" gateway call vlab.workers.status --json --timeout 10000 2>/dev/null); then
      if jq -e '.started == true and .pending == 0 and any(.workers[]?; .ready == true)' <<<"$refreshed_worker_status" >/dev/null; then
        worker_ready=1
        break
      fi
    fi
  fi
  sleep 1
done
systemctl is-active --quiet "$gateway_service"
if [[ $worker_ready != 1 ]]; then
  echo "VLab Worker pool did not become ready within 60 seconds" >&2
  systemctl status "$gateway_service" --no-pager >&2 || true
  exit 1
fi
[[ -n $refreshed_worker_status ]] || refreshed_worker_status='{}'
printf '%s\n' "$refreshed_worker_status" > "$backup_dir/worker-status-after-start.json"
jq -e '.started == true and .pending == 0 and any(.workers[]?; .ready == true)' \
  "$backup_dir/worker-status-after-start.json" >/dev/null
sleep 5
gateway_restarts_after=$(systemctl show "$gateway_service" -p NRestarts --value)
broker_restarts_after=$(systemctl show "$broker_service" -p NRestarts --value)
if [[ $gateway_restarts_after != "$gateway_restarts_before" ]]; then
  echo "Gateway restarted during acceptance: before=$gateway_restarts_before after=$gateway_restarts_after" >&2
  exit 1
fi
if [[ $broker_restarts_after != "$broker_restarts_before" ]]; then
  echo "Project Sandbox Broker restarted during acceptance: before=$broker_restarts_before after=$broker_restarts_after" >&2
  exit 1
fi

trap - ERR INT TERM
progress "VLab deployment accepted"
echo "backup=$backup_dir"
