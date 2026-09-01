#!/usr/bin/env bash
set -Eeuo pipefail

release_root=/opt/vlab/releases/2026.8.1
current_link=/opt/vlab/current
service=openclaw-vlab-gateway.service
state_dir=/srv/vlab/state
workspace_dir=/srv/vlab/workspace
candidate_dir=/srv/vlab/staging/openclaw-2026.8.1-probe
backup_root=/srv/vlab/backups/openclaw-2026.8.1/20260831-vlab-cutover-v4
data_backup_root=/root/data/disk/openclaw-2026.8.1/vlab-cutover-v3
agent_backup_root=/root/data/disk/openclaw-2026.8.1/vlab-cutover-v2/agents
main_config_source="$candidate_dir/openclaw.final.v4.json"
worker_config_source="$candidate_dir/worker.final.v4.json"
worker_release=/opt/vlab/experiments/agent-worker-isolation-v1/releases/def4e44edbda9977406fbce88cfb007869c2c70c1ec4b14c22fa93506478cab7
main_config="$state_dir/openclaw.json"
worker_config=/srv/vlab/experiments/agent-worker-isolation-v1/worker-openclaw.json
shared_db="$state_dir/state/openclaw.sqlite"
makaron_db="$state_dir/agents/makaron/agent/openclaw-agent.sqlite"
codex_db="$state_dir/agents/vlab-sandbox-codex/agent/openclaw-agent.sqlite"
vcodex_dropin=/etc/systemd/system/openclaw-vlab-gateway.service.d/vcodex-streaming-v0.1.4.conf
node_bin=/opt/vlab/node/bin/node
openclaw_entry="$release_root/node_modules/openclaw/dist/index.js"
migrate_state="$candidate_dir/migrate-state-db.mjs"
migrate_agents="$candidate_dir/migrate-agent-dbs.mjs"
old_target=""
committed=0

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"
}

run8_vlab() {
  local unit="vlab-openclaw81-$1-$$"
  local config_path=${RUN8_CONFIG_PATH:-$candidate_dir/openclaw.plugin-stage.json}
  shift
  systemd-run --quiet --wait --pipe --collect \
    --unit="$unit" \
    --property=User=vlab \
    --property=Group=vlab \
    --property=PrivateTmp=yes \
    --property=WorkingDirectory="$workspace_dir" \
    --setenv=HOME=/srv/vlab \
    --setenv=OPENCLAW_HOME=/srv/vlab \
    --setenv=OPENCLAW_STATE_DIR="$state_dir" \
    --setenv=OPENCLAW_CONFIG_PATH="$config_path" \
    --setenv=OPENCLAW_WORKSPACE_DIR="$workspace_dir" \
    --setenv=TMPDIR=/srv/vlab/tmp \
    --setenv=PATH=/opt/vlab/node/bin:/usr/local/bin:/usr/bin:/bin \
    "$node_bin" "$openclaw_entry" "$@"
}

restore_database() {
  local source=$1
  local destination=$2
  rm -f "$destination" "$destination-wal" "$destination-shm"
  install -o vlab -g vlab -m 600 "$source" "$destination"
}

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ $committed -eq 1 ]]; then
    exit "$exit_code"
  fi
  log "CUTOVER_FAILED exit=$exit_code"
  systemctl stop "$service" || true
  if [[ -n $old_target && -e $old_target ]]; then
    ln -sfn "$old_target" "$current_link"
  fi
  if [[ -f $backup_root/config/openclaw.json.before ]]; then
    install -o vlab -g vlab -m 600 "$backup_root/config/openclaw.json.before" "$main_config"
  fi
  if [[ -f $backup_root/config/worker-openclaw.json.before ]]; then
    install -o vlab -g vlab -m 600 "$backup_root/config/worker-openclaw.json.before" "$worker_config"
  fi
  if [[ -f $data_backup_root/state/openclaw.sqlite.before ]]; then
    restore_database "$data_backup_root/state/openclaw.sqlite.before" "$shared_db"
  fi
  if [[ -f $agent_backup_root/makaron/agent/openclaw-agent.sqlite.before ]]; then
    restore_database "$agent_backup_root/makaron/agent/openclaw-agent.sqlite.before" "$makaron_db"
  fi
  if [[ -f $agent_backup_root/vlab-sandbox-codex/agent/openclaw-agent.sqlite.before ]]; then
    restore_database "$agent_backup_root/vlab-sandbox-codex/agent/openclaw-agent.sqlite.before" "$codex_db"
  fi
  if [[ -d $data_backup_root/sessions ]]; then
    for agent_backup in "$data_backup_root"/sessions/*; do
      [[ -d $agent_backup ]] || continue
      agent=$(basename "$agent_backup")
      rm -rf "$state_dir/agents/$agent/sessions"
      cp -a "$agent_backup/sessions.before" "$state_dir/agents/$agent/sessions"
      chown -R vlab:vlab "$state_dir/agents/$agent/sessions"
    done
  fi
  if [[ -f $backup_root/agent-db-paths.before ]]; then
    generated_archive="$backup_root/failed-generated-agent-dbs/$(date +%s)"
    while IFS= read -r database; do
      if ! grep -Fxq "$database" "$backup_root/agent-db-paths.before"; then
        agent=$(basename "$(dirname "$(dirname "$database")")")
        mkdir -p "$generated_archive/$agent"
        for generated in "$database" "$database-wal" "$database-shm"; do
          [[ -e $generated ]] && mv "$generated" "$generated_archive/$agent/"
        done
      fi
    done < <(find "$state_dir/agents" -path '*/agent/openclaw-agent.sqlite' -type f | sort)
  fi
  if [[ -d $backup_root/plugins/projects.before ]]; then
    rm -rf "$state_dir/npm/projects"
    cp -a "$backup_root/plugins/projects.before" "$state_dir/npm/projects"
  fi
  if [[ -f $backup_root/vcodex-streaming-v0.1.4.conf.before ]]; then
    install -o root -g root -m 644 "$backup_root/vcodex-streaming-v0.1.4.conf.before" "$vcodex_dropin"
  fi
  systemctl daemon-reload
  systemctl start "$service" || true
  log "ROLLBACK_COMPLETED"
  exit "$exit_code"
}
trap rollback ERR

[[ $EUID -eq 0 ]]
[[ $($node_bin -p "require('$release_root/node_modules/openclaw/package.json').version") == 2026.8.1 ]]
[[ -f $main_config_source && -f $worker_config_source ]]
[[ $(sha256sum "$main_config_source" | awk '{print $1}') == 29eb99d78082916f3abedebf491aef0c2212292a8e3d67c191b87c965ac0bb90 ]]
[[ $(sha256sum "$worker_config_source" | awk '{print $1}') == 8f210c15f36f7602255869cf86907ddfaec596a0a2a87049741ab3dfd52f7b91 ]]
[[ $($node_bin -p "require('$worker_release/package.json').version") == 0.2.7 ]]
[[ $(cd "$worker_release" && find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}') == def4e44edbda9977406fbce88cfb007869c2c70c1ec4b14c22fa93506478cab7 ]]
[[ -f $agent_backup_root/makaron/agent/openclaw-agent.sqlite.before ]]
[[ -f $agent_backup_root/vlab-sandbox-codex/agent/openclaw-agent.sqlite.before ]]

old_target=$(readlink -f "$current_link")
[[ $old_target == /opt/vlab/releases/2026.7.1 ]]
mkdir -p "$backup_root/config" "$backup_root/plugins" "$data_backup_root/state"
install -m 600 "$main_config" "$backup_root/config/openclaw.json.before"
install -m 600 "$worker_config" "$backup_root/config/worker-openclaw.json.before"
find "$state_dir/agents" -path '*/agent/openclaw-agent.sqlite' -type f | sort > "$backup_root/agent-db-paths.before"
printf '%s\n' "$old_target" > "$backup_root/current-target"
if [[ -f $vcodex_dropin ]]; then
  install -m 600 "$vcodex_dropin" "$backup_root/vcodex-streaming-v0.1.4.conf.before"
fi
rm -rf "$backup_root/plugins/projects.before"
cp -a "$state_dir/npm/projects" "$backup_root/plugins/projects.before"

log "checking idle worker pool"
worker_status=$(runuser -u vlab -- env \
  HOME=/srv/vlab OPENCLAW_HOME=/srv/vlab OPENCLAW_STATE_DIR="$state_dir" \
  OPENCLAW_CONFIG_PATH="$main_config" OPENCLAW_WORKSPACE_DIR="$workspace_dir" \
  TMPDIR=/srv/vlab/tmp PATH=/opt/vlab/node/bin:/usr/local/bin:/usr/bin:/bin \
  "$node_bin" "$old_target/node_modules/openclaw/dist/index.js" gateway call vlab.workers.status --json 2>/dev/null)
STATUS_JSON="$worker_status" "$node_bin" -e '
  const status = JSON.parse(process.env.STATUS_JSON);
  const active = status.workers.reduce((sum, worker) => sum + (worker.activeCount ?? 0), 0);
  const queued = status.workers.reduce((sum, worker) => sum + (worker.queued ?? 0), 0);
  if (active !== 0 || queued !== 0 || status.pending !== 0) {
    throw new Error(`unsafe cutover window active=${active} queued=${queued} pending=${status.pending}`);
  }
'

log "stopping VLab gateway"
systemctl stop "$service"
systemctl is-active --quiet "$service" && false || true

rm -rf "$data_backup_root/sessions"
mkdir -p "$data_backup_root/sessions"
for agent_dir in "$state_dir"/agents/*; do
  [[ -d $agent_dir/sessions ]] || continue
  agent=$(basename "$agent_dir")
  mkdir -p "$data_backup_root/sessions/$agent"
  cp -a "$agent_dir/sessions" "$data_backup_root/sessions/$agent/sessions.before"
done

rm -f "$shared_db-wal" "$shared_db-shm"
install -m 600 "$shared_db" "$data_backup_root/state/openclaw.sqlite.before"
sqlite3 "$data_backup_root/state/openclaw.sqlite.before" 'PRAGMA integrity_check;' | grep -qx ok

log "migrating shared and agent databases with official 8.1 schema code"
OPENCLAW_STATE_DIR="$state_dir" "$node_bin" "$migrate_state" \
  --database "$shared_db" --openclaw-root "$release_root"
OPENCLAW_STATE_DIR="$state_dir" "$node_bin" "$migrate_agents" \
  --state-dir "$state_dir" --openclaw-root "$release_root" --lease-ms 3600000
chown vlab:vlab "$shared_db" "$makaron_db" "$codex_db"
find "$state_dir/state" "$state_dir/agents/makaron/agent" "$state_dir/agents/vlab-sandbox-codex/agent" \
  -maxdepth 1 -type f \( -name '*.sqlite-wal' -o -name '*.sqlite-shm' \) -exec chown vlab:vlab {} +
install -d -o vlab -g vlab -m 700 "$state_dir/tmp"
if [[ -d /srv/vlab/.openclaw ]]; then
  chown -R vlab:vlab /srv/vlab/.openclaw
fi
chown -R vlab:vlab "$state_dir/npm"

log "installing exact official 8.1 external plugins"
run8_vlab feishu plugins install --force --accept-capabilities @openclaw/feishu@2026.8.1
run8_vlab codex plugins install --force --accept-capabilities @openclaw/codex@2026.8.1
run8_vlab deepseek plugins install --force --accept-capabilities @openclaw/deepseek-provider@2026.8.1
run8_vlab perplexity plugins install --force --accept-capabilities @openclaw/perplexity-plugin@2026.8.1

log "validating final config as the runtime user"
RUN8_CONFIG_PATH="$main_config_source" run8_vlab validate config validate --json > "$backup_root/config-validate.json"
RUN8_CONFIG_PATH="$main_config_source" run8_vlab plugins plugins list --json > "$backup_root/plugin-list-before-start.json"
PLUGIN_LIST="$backup_root/plugin-list-before-start.json" "$node_bin" -e '
  const list = require(process.env.PLUGIN_LIST).plugins;
  for (const id of ["feishu", "codex", "deepseek"]) {
    const plugin = list.find((candidate) => candidate.id === id);
    if (!plugin || plugin.status !== "loaded" || plugin.version !== "2026.8.1") {
      throw new Error(`plugin acceptance failed: ${id} ${JSON.stringify(plugin)}`);
    }
  }
'

log "migrating all legacy session stores into agent SQLite"
find "$workspace_dir" -type f -printf '%P\t%s\t%T@\n' | sort > "$backup_root/workspace.before"
memory_counts_before=$(sqlite3 "$makaron_db" 'SELECT (SELECT count(*) FROM memory_embedding_cache),(SELECT count(*) FROM memory_index_chunk_provenance),(SELECT count(*) FROM memory_index_chunks),(SELECT count(*) FROM memory_index_sources);')
STATE_DIR="$state_dir" SESSION_COUNTS="$backup_root/session-counts-before.json" "$node_bin" -e '
  const fs = require("fs");
  const path = require("path");
  const counts = {};
  for (const agentId of fs.readdirSync(path.join(process.env.STATE_DIR, "agents"))) {
    const store = path.join(process.env.STATE_DIR, "agents", agentId, "sessions", "sessions.json");
    if (fs.existsSync(store)) counts[agentId] = Object.keys(JSON.parse(fs.readFileSync(store))).length;
  }
  fs.writeFileSync(process.env.SESSION_COUNTS, JSON.stringify(counts, null, 2) + "\n");
'
if RUN8_CONFIG_PATH="$main_config_source" run8_vlab session-dry-run doctor \
  --session-sqlite dry-run --session-sqlite-all-agents --json > "$backup_root/session-dry-run.json"; then
  session_dry_run_exit=0
else
  session_dry_run_exit=$?
fi
[[ $session_dry_run_exit -eq 1 ]]
SESSION_REPORT="$backup_root/session-dry-run.json" SESSION_COUNTS="$backup_root/session-counts-before.json" "$node_bin" -e '
  const report = require(process.env.SESSION_REPORT);
  const expectedCounts = new Map(Object.entries(require(process.env.SESSION_COUNTS)));
  const expectedMissing = new Set([
    "agent:vlab-sandbox-codex:qa-runtime-codex-20260830",
    "agent:vlab-sandbox-codex:qa-runtime-codex-20260830-v2",
    "agent:vlab-sandbox-codex:qa-runtime-codex-20260830-v3",
    "agent:vlab-sandbox-codex:auth-readthrough-20260830",
    "agent:vlab-sandbox-codex:auth-readthrough-20260830b",
    "agent:vlab-sandbox-codex:auth-readthrough-stub-20260830",
    "agent:vlab-sandbox-codex:auth-readthrough-stub-20260830b",
    "agent:vlab-sandbox-choice-codex:acceptance-free-choice-20260830",
  ]);
  if (report.mode !== "dry-run" || report.targets.length !== expectedCounts.size) {
    throw new Error("unexpected session dry-run target set");
  }
  const missing = [];
  for (const target of report.targets) {
    if (target.legacyEntries !== expectedCounts.get(target.agentId) || target.sqliteEntries !== 0) {
      throw new Error(`unexpected session count for ${target.agentId}`);
    }
    for (const issue of target.issues ?? []) {
      if (issue.code !== "transcript_missing") throw new Error(`unexpected issue ${JSON.stringify(issue)}`);
      missing.push(issue.sessionKey);
    }
  }
  if (missing.length !== expectedMissing.size || missing.some((key) => !expectedMissing.has(key))) {
    throw new Error(`unexpected missing transcript set: ${JSON.stringify(missing)}`);
  }
'
if RUN8_CONFIG_PATH="$main_config_source" run8_vlab session-import doctor \
  --session-sqlite import --session-sqlite-all-agents --yes --non-interactive --json > "$backup_root/session-import.json"; then
  session_import_exit=0
else
  session_import_exit=$?
fi
[[ $session_import_exit -eq 1 ]]
SESSION_REPORT="$backup_root/session-import.json" SESSION_COUNTS="$backup_root/session-counts-before.json" "$node_bin" -e '
  const report = require(process.env.SESSION_REPORT);
  const targets = report.targets ?? [];
  const imported = targets.reduce((sum, target) => sum + target.importedEntries, 0);
  const sqlite = targets.reduce((sum, target) => sum + target.sqliteEntries, 0);
  const expected = Object.values(require(process.env.SESSION_COUNTS)).reduce((sum, count) => sum + count, 0);
  const issues = targets.flatMap((target) => target.issues ?? []);
  if (report.mode !== "import" || imported !== expected || sqlite !== expected) {
    throw new Error(`session import mismatch imported=${imported} sqlite=${sqlite}`);
  }
  if (issues.length !== 8 || issues.some((issue) => issue.code !== "transcript_missing")) {
    throw new Error(`session import issues changed: ${JSON.stringify(issues)}`);
  }
'
RUN8_CONFIG_PATH="$main_config_source" run8_vlab session-validate doctor \
  --session-sqlite validate --session-sqlite-all-agents --json > "$backup_root/session-validate.json"
if find "$state_dir/agents" -path '*/sessions/sessions.json' -type f | grep -q .; then
  log "legacy sessions.json remained after import"
  false
fi
find "$workspace_dir" -type f -printf '%P\t%s\t%T@\n' | sort > "$backup_root/workspace.after"
cmp -s "$backup_root/workspace.before" "$backup_root/workspace.after"
memory_counts_after=$(sqlite3 "$makaron_db" 'SELECT (SELECT count(*) FROM memory_embedding_cache),(SELECT count(*) FROM memory_index_chunk_provenance),(SELECT count(*) FROM memory_index_chunks),(SELECT count(*) FROM memory_index_sources);')
[[ $memory_counts_after == "$memory_counts_before" ]]
expected_session_total=$(SESSION_COUNTS="$backup_root/session-counts-before.json" "$node_bin" -e 'const x=require(process.env.SESSION_COUNTS); process.stdout.write(String(Object.values(x).reduce((sum, count) => sum + count, 0)))')
expected_transcript_total=$(SESSION_REPORT="$backup_root/session-import.json" "$node_bin" -e 'const x=require(process.env.SESSION_REPORT); process.stdout.write(String(x.targets.reduce((sum, target) => sum + target.importedTranscriptEvents, 0)))')
session_total=0
transcript_total=0
for db in "$state_dir"/agents/*/agent/openclaw-agent.sqlite; do
  [[ -f $db ]] || continue
  session_total=$((session_total + $(sqlite3 "$db" 'SELECT count(*) FROM session_nodes;')))
  transcript_total=$((transcript_total + $(sqlite3 "$db" 'SELECT count(*) FROM transcript_events;')))
done
[[ $session_total -eq $expected_session_total ]]
[[ $transcript_total -eq $expected_transcript_total ]]

install -o vlab -g vlab -m 600 "$main_config_source" "$main_config"
install -o vlab -g vlab -m 600 "$worker_config_source" "$worker_config"
if [[ -f $vcodex_dropin ]]; then
  rm -f "$vcodex_dropin"
fi
ln -sfn "$release_root" "$current_link"
systemctl daemon-reload

cutover_started=$(date --iso-8601=seconds)
restarts_before=$(systemctl show "$service" -p NRestarts --value)
log "starting OpenClaw 8.1"
systemctl start "$service"

ready=0
for _ in $(seq 1 36); do
  if journalctl -u "$service" --since "$cutover_started" --no-pager | grep -q '\[gateway\] ready'; then
    ready=1
    break
  fi
  sleep 5
done
[[ $ready -eq 1 ]]
systemctl is-active --quiet "$service"
sleep 20
restarts_after=$(systemctl show "$service" -p NRestarts --value)
[[ $restarts_after == "$restarts_before" ]]

startup_log="$backup_root/startup.log"
journalctl -u "$service" --since "$cutover_started" --no-pager > "$startup_log"
grep -q 'ws client ready' "$startup_log"
grep -q 'vLab Agent Worker Isolation started with 1-15 elastic workers and 3 sessions per worker' "$startup_log"
! grep -Eq 'OpenClaw startup migrations did not complete cleanly|Main process exited|plugin load failed|Failed with result' "$startup_log"

log "checking worker capacity and plugin runtime after startup"
online_status=$(runuser -u vlab -- env \
  HOME=/srv/vlab OPENCLAW_HOME=/srv/vlab OPENCLAW_STATE_DIR="$state_dir" \
  OPENCLAW_CONFIG_PATH="$main_config" OPENCLAW_WORKSPACE_DIR="$workspace_dir" \
  TMPDIR=/srv/vlab/tmp PATH=/opt/vlab/node/bin:/usr/local/bin:/usr/bin:/bin \
  "$node_bin" "$openclaw_entry" gateway call vlab.workers.status --json 2>/dev/null)
STATUS_JSON="$online_status" "$node_bin" -e '
  const status = JSON.parse(process.env.STATUS_JSON);
  if (status.maxWorkers !== 15 || status.sessionsPerWorker !== 3 || status.maxActiveSessions !== 45) {
    throw new Error(`worker capacity changed: ${JSON.stringify(status)}`);
  }
  if (status.pending !== 0 || status.workers.some((worker) => !worker.ready)) {
    throw new Error(`worker pool not ready: ${JSON.stringify(status)}`);
  }
  if (status.integration?.workerIsolationVersion !== "0.2.7") {
    throw new Error(`worker version changed: ${status.integration?.workerIsolationVersion}`);
  }
'

runuser -u vlab -- env \
  HOME=/srv/vlab OPENCLAW_HOME=/srv/vlab OPENCLAW_STATE_DIR="$state_dir" \
  OPENCLAW_CONFIG_PATH="$main_config" OPENCLAW_WORKSPACE_DIR="$workspace_dir" \
  TMPDIR=/srv/vlab/tmp PATH=/opt/vlab/node/bin:/usr/local/bin:/usr/bin:/bin \
  "$node_bin" "$openclaw_entry" plugins list --json > "$backup_root/plugin-list-after-start.json"
PLUGIN_LIST="$backup_root/plugin-list-after-start.json" "$node_bin" -e '
  const list = require(process.env.PLUGIN_LIST).plugins;
  for (const id of ["feishu", "codex", "deepseek"]) {
    const plugin = list.find((candidate) => candidate.id === id);
    if (!plugin || plugin.status !== "loaded" || plugin.version !== "2026.8.1") {
      throw new Error(`online plugin acceptance failed: ${id} ${JSON.stringify(plugin)}`);
    }
  }
'

sqlite3 "$shared_db" 'PRAGMA integrity_check;' | grep -qx ok
sqlite3 "$makaron_db" 'PRAGMA integrity_check;' | grep -qx ok
sqlite3 "$codex_db" 'PRAGMA integrity_check;' | grep -qx ok

committed=1
trap - ERR
log "CUTOVER_V4_HEALTHY"
