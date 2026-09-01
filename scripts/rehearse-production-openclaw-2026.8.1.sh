#!/usr/bin/env bash
set -Eeuo pipefail

mode=${1:-}
source_state=${OPENCLAW81_SOURCE_STATE:-/home/openclaw/.openclaw}
rehearsal_parent=${OPENCLAW81_REHEARSAL_PARENT:-/home/openclaw/.openclaw-upgrade-rehearsals}
rehearsal_root=${OPENCLAW81_REHEARSAL_ROOT:-$rehearsal_parent/2026.8.1-current}
state_dir=$rehearsal_root/state
worker_overlay_relative=experiments/agent-worker-isolation-v1
worker_overlay_source=$source_state/$worker_overlay_relative
worker_overlay_copy=$state_dir/$worker_overlay_relative
release_root=${OPENCLAW81_RELEASE_ROOT:-/opt/openclaw-2026.8.1}
migration_release_root=${OPENCLAW81_MIGRATION_RELEASE_ROOT:-/opt/openclaw-2026.8.1-session-migration}
worker_release=${OPENCLAW81_WORKER_RELEASE:-/opt/openclaw-experiments/agent-worker-isolation-v1/releases/d665f98e7c6c2a1b7372c94e42d556df23acf4edc9e854007b6cdc444efb3535}
tool_root=${OPENCLAW81_TOOL_ROOT:-/opt/openclaw-upgrade-tools/2026.8.1}
node_bin=${OPENCLAW81_NODE_BIN:-/opt/node-v22.23.1/bin/node}
service=${OPENCLAW81_SERVICE:-openclaw-gateway.service}
openclaw_entry=$release_root/node_modules/openclaw/dist/index.js
migration_openclaw_entry=$migration_release_root/node_modules/openclaw/dist/index.js
config_migrator=$tool_root/migrate-openclaw-2026.8.1-config.mjs
state_migrator=$tool_root/migrate-openclaw-2026.8.1-state-db.mjs
agent_migrator=$tool_root/migrate-openclaw-2026.8.1-agent-dbs.mjs
path_rewriter=$tool_root/rewrite-openclaw-2026.8.1-rehearsal-paths.mjs
expected_release_tree_sha=7bafc2197856e2ba6c0121f4a44708f4de51e72a77615b58b9905e4ef4e968a1
expected_worker_tree_sha=fc499e3c823a0a741a282abea9b8d627770f3906a3ddd6068cf190e059c09bed
maintenance_source_relative=node_modules/openclaw/dist/openclaw-agent-db-DwEkomYQ.js
expected_maintenance_source_sha=f2fa3e33a5f4b426c0d7e67bfe282b25479fb596fd7acd08e32f279e402cb06a

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"
}

fail() {
  log "REHEARSAL_FAILED $*" >&2
  exit 1
}

assert_safe_paths() {
  [[ $source_state == /home/openclaw/.openclaw ]] || fail "unexpected source state: $source_state"
  [[ $rehearsal_parent == /home/openclaw/.openclaw-upgrade-rehearsals ]] || fail "unexpected rehearsal parent"
  [[ $rehearsal_root == "$rehearsal_parent"/* ]] || fail "rehearsal root escaped parent"
  [[ $state_dir == "$rehearsal_root/state" ]] || fail "unexpected rehearsal state path"
}

tree_sha() {
  local root=$1
  (
    cd "$root"
    tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=gnu -cf - . |
      sha256sum | awk '{print $1}'
  )
}

capture_service_state() {
  systemctl show "$service" -p ActiveState -p MainPID -p NRestarts --value | paste -sd ':' -
}

assert_live_unchanged() {
  local expected
  expected=$(<"$rehearsal_root/live-service.before")
  [[ $(capture_service_state) == "$expected" ]] || fail "live Gateway state changed during rehearsal"
  systemctl is-active --quiet "$service" || fail "live Gateway is not active"
}

write_summary() {
  local root=$1
  local output=$2
  python3 - "$root" "$output" <<'PY'
import glob, hashlib, json, os, sys

root, output = map(os.path.realpath, sys.argv[1:])

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

summary = {"config": None, "sessionStores": {}, "databases": {}}
config = os.path.join(root, "openclaw.json")
if os.path.isfile(config):
    summary["config"] = {"sha256": digest(config), "bytes": os.path.getsize(config)}
for store in sorted(glob.glob(os.path.join(root, "agents", "*", "sessions", "sessions.json"))):
    agent = store.split(os.sep)[-3]
    payload = json.load(open(store))
    summary["sessionStores"][agent] = {
        "entries": len(payload),
        "sha256": digest(store),
        "bytes": os.path.getsize(store),
    }
for database in sorted(glob.glob(os.path.join(root, "state", "*.sqlite")) + glob.glob(os.path.join(root, "agents", "*", "agent", "*.sqlite"))):
    relative = os.path.relpath(database, root)
    summary["databases"][relative] = {
        "sha256": digest(database),
        "bytes": os.path.getsize(database),
    }
with open(output, "w") as handle:
    json.dump(summary, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY
}

run8_with_config() {
  local label=$1
  local config_path=$2
  shift 2
  systemd-run --quiet --wait --pipe --collect \
    --unit="openclaw81-rehearsal-$label-$$" \
    --property=User=openclaw \
    --property=Group=openclaw \
    --property=PrivateTmp=yes \
    --property=WorkingDirectory=/home/openclaw \
    --property=EnvironmentFile=-/home/openclaw/.openclaw/gateway.systemd.env \
    --property=EnvironmentFile=-/home/openclaw/.openclaw/.env \
    --property=EnvironmentFile=-/etc/v-browser/extension-relay.env \
    --setenv=HOME=/home/openclaw \
    --setenv=OPENCLAW_HOME=/home/openclaw \
    --setenv=OPENCLAW_STATE_DIR="$state_dir" \
    --setenv=OPENCLAW_CONFIG_PATH="$config_path" \
    --setenv=OPENCLAW_WORKSPACE_DIR=/home/openclaw/makaron-openclaw/.openclaw-local/workspace \
    --setenv=TMPDIR=/tmp \
    --setenv=PATH=/opt/node-v22.23.1/bin:/usr/local/bin:/usr/bin:/bin \
    "$node_bin" "$openclaw_entry" "$@"
}

run8() {
  local label=$1
  shift
  run8_with_config "$label" "$state_dir/openclaw.json" "$@"
}

run8_migration() {
  local label=$1
  shift
  local original_entry=$openclaw_entry
  openclaw_entry=$migration_openclaw_entry
  run8 "$label" "$@"
  openclaw_entry=$original_entry
}

prepare_session_migration_runtime() {
  local source_file=$release_root/$maintenance_source_relative
  local target_file=$migration_release_root/$maintenance_source_relative
  local marker=$migration_release_root/.openclaw-session-migration-runtime
  [[ $(sha256sum "$source_file" | awk '{print $1}') == "$expected_maintenance_source_sha" ]] ||
    fail "unexpected official maintenance runtime hash"
  if [[ -f $marker ]]; then
    [[ -f $target_file ]] || fail "migration runtime marker exists without patched file"
    [[ $(grep -Fc 'leaseMs: 36e5,' "$target_file") == 1 ]] || fail "migration runtime lease patch is invalid"
    [[ $(tree_sha "$release_root") == "$expected_release_tree_sha" ]] || fail "official runtime changed after migration runtime preparation"
    return
  fi
  [[ ! -e $migration_release_root ]] || fail "unverified migration runtime already exists: $migration_release_root"
  log "creating copy-on-write migration-only runtime with a one-hour maintenance lease"
  cp -al "$release_root" "$migration_release_root"
  [[ $(grep -Fc 'leaseMs: 6e4,' "$source_file") == 1 ]] || fail "expected maintenance lease source was not found exactly once"
  sed 's/^\([[:space:]]*\)leaseMs: 6e4,$/\1leaseMs: 36e5,/' "$source_file" > "$target_file.tmp"
  [[ $(grep -Fc 'leaseMs: 36e5,' "$target_file.tmp") == 1 ]] || fail "failed to create migration maintenance lease patch"
  chown --reference="$source_file" "$target_file.tmp"
  chmod --reference="$source_file" "$target_file.tmp"
  mv "$target_file.tmp" "$target_file"
  printf '%s\n' 'OpenClaw 2026.8.1 migration-only runtime; maintenance lease 60s -> 1h' > "$marker"
  [[ $(tree_sha "$release_root") == "$expected_release_tree_sha" ]] || fail "official runtime changed while preparing migration runtime"
}

has_exact_plugin_package() {
  local package_spec=$1
  local package_name=${package_spec%@*}
  local package_json
  while IFS= read -r -d '' package_json; do
    if [[ $($node_bin -p "require('$package_json').version") == 2026.8.1 ]]; then
      return 0
    fi
  done < <(find "$state_dir/npm/projects" -path "*/node_modules/$package_name/package.json" -type f -print0 2>/dev/null)
  return 1
}

verify_release_artifacts() {
  local worker_tree_sha
  [[ $($node_bin -p "require('$release_root/node_modules/openclaw/package.json').version") == 2026.8.1 ]] ||
    fail "OpenClaw release version mismatch"
  [[ $($node_bin -p "require('$worker_release/package.json').version") == 0.2.8 ]] ||
    fail "Worker release version mismatch"
  [[ $(tree_sha "$release_root") == "$expected_release_tree_sha" ]] || fail "OpenClaw release tree hash mismatch"
  worker_tree_sha=$( (cd "$worker_release" && find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum) | awk '{print $1}' )
  [[ $worker_tree_sha == "$expected_worker_tree_sha" ]] ||
    fail "Worker release tree hash mismatch"
  for script in "$config_migrator" "$state_migrator" "$agent_migrator" "$path_rewriter"; do
    [[ -f $script ]] || fail "missing migration tool: $script"
  done
}

copy_stable_agent_tree() {
  local before after
  for attempt in 1 2 3; do
    before=$(find "$source_state/agents" -path '*/sessions/sessions.json' -type f -print0 |
      sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
    ionice -c3 nice -n 15 rsync -a --delete \
      --exclude='*.sqlite' --exclude='*.sqlite-wal' --exclude='*.sqlite-shm' \
      "$source_state/agents/" "$state_dir/agents/"
    after=$(find "$source_state/agents" -path '*/sessions/sessions.json' -type f -print0 |
      sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
    if [[ $before == "$after" ]]; then
      printf '%s\n' "$after" > "$rehearsal_root/live-session-stores.sha256"
      return
    fi
    log "session directory changed during copy; retrying attempt=$attempt"
  done
  fail "could not obtain a stable legacy session directory snapshot"
}

backup_live_databases() {
  local source relative destination
  while IFS= read -r -d '' source; do
    relative=${source#"$source_state/"}
    [[ $relative != "$source" ]] || fail "database escaped live state: $source"
    destination=$state_dir/$relative
    install -d -o openclaw -g openclaw -m 700 "$(dirname "$destination")"
    rm -f "$destination" "$destination-wal" "$destination-shm"
    ionice -c3 nice -n 15 sqlite3 "$source" ".backup '$destination'"
    chown openclaw:openclaw "$destination"
    chmod 600 "$destination"
    [[ $(sqlite3 "$destination" 'PRAGMA integrity_check;') == ok ]] || fail "database backup failed integrity: $relative"
  done < <(find "$source_state/state" "$source_state/agents" -type f -name '*.sqlite' -print0 | sort -z)
}

capture_worker_overlay_baseline() {
  local snapshot=$rehearsal_root/worker-overlay-baseline
  local archive=$rehearsal_root/worker-overlay-baseline.tar.zst
  [[ -d $worker_overlay_source ]] || fail "live Worker overlay is missing"
  [[ ! -e $snapshot && ! -e $archive ]] || fail "Worker overlay baseline already exists"
  install -d -o openclaw -g openclaw -m 700 "$snapshot"
  ionice -c3 nice -n 15 rsync -a --delete \
    --exclude='/media/' \
    --exclude='/browser/' \
    --exclude='/acceptance/' \
    --exclude='/acceptance-*/' \
    --exclude='/test-reports/' \
    --exclude='/ab-tests/' \
    --exclude='/backups/' \
    --exclude='/capacity-*/' \
    --exclude='/candidates/' \
    "$worker_overlay_source/" "$snapshot/"
  (
    cd "$snapshot"
    find . -type f -print0 | sort -z | xargs -0 sha256sum
  ) > "$rehearsal_root/worker-overlay-baseline.manifest.sha256"
  tar -C "$rehearsal_root" -cf - worker-overlay-baseline | zstd -T2 -3 -q -o "$archive"
  zstd -t -q "$archive"
  install -d -o openclaw -g openclaw -m 700 "$worker_overlay_copy"
  rsync -a --delete "$snapshot/" "$worker_overlay_copy/"
  chown -R openclaw:openclaw "$state_dir/experiments"
  [[ -f $worker_overlay_copy/worker-openclaw.json ]] || fail "Worker overlay snapshot omitted worker-openclaw.json"
  "$node_bin" "$path_rewriter" \
    --state-dir "$state_dir" \
    --source-state-dir "$source_state" \
    --config "$worker_overlay_copy/worker-openclaw.json" \
    > "$rehearsal_root/worker-overlay-path-rewrite.json"
  chmod 600 "$worker_overlay_copy/worker-openclaw.json"
  assert_live_unchanged
  touch "$rehearsal_root/WORKER_OVERLAY_BASELINE_OK"
  log "REHEARSAL_WORKER_OVERLAY_OK files=$(find "$snapshot" -type f | wc -l)"
}

build_candidate_config() {
  local baseline_config_sha current_config_sha
  baseline_config_sha=$(BASELINE="$rehearsal_root/baseline-summary.json" "$node_bin" -e 'process.stdout.write(require(process.env.BASELINE).config.sha256)')
  current_config_sha=$(sha256sum "$state_dir/openclaw.json" | awk '{print $1}')
  [[ $current_config_sha == "$baseline_config_sha" ]] || fail "candidate config source does not match the frozen 7.1 baseline"
  mv "$state_dir/openclaw.json" "$state_dir/openclaw.2026.7.1.json"
  "$node_bin" "$config_migrator" \
    --input "$state_dir/openclaw.2026.7.1.json" \
    --output "$state_dir/openclaw.json" \
    --openclaw-root "$release_root" \
    --system-agent-id makaron \
    --worker-plugin-path "$worker_release" \
    > "$rehearsal_root/config-migration.json"
  "$node_bin" "$path_rewriter" \
    --state-dir "$state_dir" \
    --source-state-dir "$source_state" \
    --config "$state_dir/openclaw.json" \
    > "$rehearsal_root/path-rewrite.json"
  chown -R openclaw:openclaw "$state_dir"
}

prepare() {
  [[ ! -e $rehearsal_root ]] || fail "rehearsal root already exists: $rehearsal_root"
  local free_kb
  free_kb=$(df -Pk "$rehearsal_parent" 2>/dev/null | awk 'NR==2 {print $4}') || true
  if [[ -z $free_kb ]]; then
    free_kb=$(df -Pk /home/openclaw | awk 'NR==2 {print $4}')
  fi
  (( free_kb >= 45 * 1024 * 1024 )) || fail "less than 45 GiB free for rehearsal"
  install -d -o openclaw -g openclaw -m 700 "$rehearsal_root" "$state_dir"
  capture_service_state > "$rehearsal_root/live-service.before"
  verify_release_artifacts

  log "copying immutable small state surfaces"
  for name in openclaw.json .env credentials secrets identity devices nodes mcp-oauth plugin-state plugins extensions npm workspace-attestations cron; do
    [[ -e $source_state/$name ]] || continue
    ionice -c3 nice -n 15 rsync -a "$source_state/$name" "$state_dir/"
  done
  install -d -o openclaw -g openclaw -m 700 "$state_dir/agents" "$state_dir/state"

  log "copying a stable legacy Session tree while the live Gateway remains online"
  copy_stable_agent_tree
  log "creating consistent SQLite online backups"
  backup_live_databases
  write_summary "$state_dir" "$rehearsal_root/baseline-summary.json"

  log "compressing the exact 7.1 rehearsal rollback baseline at low IO priority"
  ionice -c3 nice -n 15 tar -C "$rehearsal_root" -cf - state |
    ionice -c3 nice -n 15 zstd -T2 -3 -q -o "$rehearsal_root/baseline-state.tar.zst"
  chmod 600 "$rehearsal_root/baseline-state.tar.zst"
  zstd -t -q "$rehearsal_root/baseline-state.tar.zst"

  log "building the 8.1 candidate config only inside the rehearsal copy"
  build_candidate_config
  chown -R openclaw:openclaw "$rehearsal_root"
  assert_live_unchanged
  touch "$rehearsal_root/PREPARED"
  log "REHEARSAL_PREPARED root=$rehearsal_root"
}

migrate() {
  local plugin_stage package plugin_label agent import_exit dry_run_exit
  [[ -f $rehearsal_root/PREPARED ]] || fail "rehearsal is not prepared"
  [[ ! -e $rehearsal_root/MIGRATED ]] || fail "rehearsal was already migrated"
  assert_live_unchanged
  verify_release_artifacts

  if [[ ! -f $rehearsal_root/DATABASES_MIGRATED ]]; then
    log "migrating the copied shared and Agent databases"
    "$node_bin" "$state_migrator" \
      --database "$state_dir/state/openclaw.sqlite" --openclaw-root "$release_root" \
      > "$rehearsal_root/state-db-migration.json"
    OPENCLAW_STATE_DIR="$state_dir" "$node_bin" "$agent_migrator" \
      --state-dir "$state_dir" --openclaw-root "$release_root" --lease-ms 3600000 \
      > "$rehearsal_root/agent-db-migration.json"
    find "$state_dir/state" "$state_dir/agents" -type f \( -name '*.sqlite' -o -name '*.sqlite-wal' -o -name '*.sqlite-shm' \) \
      -exec chown openclaw:openclaw {} +
    touch "$rehearsal_root/DATABASES_MIGRATED"
  fi

  log "installing the exact official 8.1 external plugin set inside the rehearsal copy"
  plugin_stage=$rehearsal_root/plugin-stage.json
  printf '%s\n' '{"plugins":{"allow":[]}}' > "$plugin_stage"
  chown openclaw:openclaw "$plugin_stage"
  chmod 600 "$plugin_stage"
  for package in \
    @openclaw/feishu@2026.8.1 \
    @openclaw/codex@2026.8.1 \
    @openclaw/deepseek-provider@2026.8.1 \
    @openclaw/perplexity-plugin@2026.8.1 \
    @openclaw/msteams@2026.8.1 \
    @openclaw/kimi-provider@2026.8.1 \
    @openclaw/moonshot-provider@2026.8.1 \
    @openclaw/byteplus-provider@2026.8.1 \
    @openclaw/cohere-provider@2026.8.1 \
    @openclaw/comfy-provider@2026.8.1 \
    @openclaw/meta-provider@2026.8.1 \
    @openclaw/mistral-provider@2026.8.1 \
    @openclaw/novita-provider@2026.8.1 \
    @openclaw/opencode-provider@2026.8.1 \
    @openclaw/synthetic-provider@2026.8.1 \
    @openclaw/volcengine-provider@2026.8.1 \
    @openclaw/voyage-provider@2026.8.1 \
    @openclaw/vydra-provider@2026.8.1 \
    @openclaw/xiaomi-provider@2026.8.1; do
    if has_exact_plugin_package "$package"; then
      log "plugin package already staged: $package"
      continue
    fi
    plugin_label=$(printf '%s' "$package" | tr -c '[:alnum:]' '-')
    run8_with_config "plugin-$plugin_label" "$plugin_stage" \
      plugins install --force --accept-capabilities "$package"
  done

  log "validating the migrated production config against OpenClaw 8.1"
  run8 config-validate config validate --json > "$rehearsal_root/config-validate.json"

  log "running official legacy Session dry-run/import/validate on the isolated copy"
  prepare_session_migration_runtime
  set +e
  run8_migration session-dry-run doctor --session-sqlite dry-run --session-sqlite-all-agents --json \
    > "$rehearsal_root/session-dry-run.json"
  dry_run_exit=$?
  set -e
  (( dry_run_exit == 0 || dry_run_exit == 1 )) || fail "session dry-run failed exit=$dry_run_exit"

  BASELINE="$rehearsal_root/baseline-summary.json" REPORT="$rehearsal_root/session-dry-run.json" "$node_bin" -e '
    const baseline = require(process.env.BASELINE);
    const report = require(process.env.REPORT);
    const baselineTotal = Object.values(baseline.sessionStores).reduce((sum, value) => sum + value.entries, 0);
    const invalid = (report.targets ?? []).flatMap((target) => target.issues ?? []).filter((issue) => issue.code === "entry_invalid").length;
    if ((report.totals?.legacyEntries ?? -1) + invalid !== baselineTotal) {
      throw new Error(`legacy Session accounting mismatch: valid=${report.totals?.legacyEntries} invalid=${invalid} baseline=${baselineTotal}`);
    }
    for (const target of report.targets ?? []) {
      for (const issue of target.issues ?? []) {
        if (!new Set(["entry_invalid", "transcript_missing"]).has(issue.code)) throw new Error(`unexpected dry-run issue: ${JSON.stringify(issue)}`);
      }
    }
    require("fs").writeFileSync(process.env.REPORT.replace("session-dry-run.json", "session-record-accounting.json"), JSON.stringify({baselineEntries: baselineTotal, validSessions: report.totals.legacyEntries, invalidPlaceholders: invalid}, null, 2) + "\n");
  '

  # The old main store has six unique Sessions whose transcript files live in the
  # Makaron directory. Import it first so the all-agent cleanup cannot archive
  # those files before main has read them.
  for agent in main makaron short-v v-codex dealclaw; do
    set +e
    run8_migration "session-import-$agent" doctor --session-sqlite import --session-sqlite-agent "$agent" --yes --non-interactive --json \
      > "$rehearsal_root/session-import.$agent.json"
    import_exit=$?
    set -e
    (( import_exit == 0 || import_exit == 1 )) || fail "session import failed agent=$agent exit=$import_exit"
  done
  run8_migration session-validate doctor --session-sqlite validate --session-sqlite-all-agents --json \
    > "$rehearsal_root/session-validate.json"

  BASELINE="$rehearsal_root/baseline-summary.json" DRY_RUN="$rehearsal_root/session-dry-run.json" ROOT="$rehearsal_root" "$node_bin" -e '
    const fs = require("fs");
    const path = require("path");
    const baseline = require(process.env.BASELINE);
    const dryRun = require(process.env.DRY_RUN);
    const expected = new Map((dryRun.targets ?? []).map((target) => [target.agentId, target.legacyEntries]));
    const reports = [];
    for (const agentId of ["main", "makaron", "short-v", "v-codex", "dealclaw"]) {
      const report = require(path.join(process.env.ROOT, `session-import.${agentId}.json`));
      const targets = report.targets ?? [];
      if (targets.length !== 1 || targets[0].agentId !== agentId) throw new Error(`unexpected import target for ${agentId}`);
      const target = targets[0];
      if (target.legacyEntries !== expected.get(agentId) || target.sqliteEntries !== expected.get(agentId)) {
        throw new Error(`Session count mismatch for ${target.agentId}: ${JSON.stringify(target)}`);
      }
      for (const issue of target.issues ?? []) {
        if (!new Set(["entry_invalid", "transcript_missing", "transcript_archive_failed"]).has(issue.code)) throw new Error(`unexpected import issue: ${JSON.stringify(issue)}`);
      }
      reports.push(target);
    }
    fs.writeFileSync(path.join(process.env.ROOT, "session-import.json"), JSON.stringify({mode: "import", targets: reports}, null, 2) + "\n");
  '
  if find "$state_dir/agents" -path '*/sessions/sessions.json' -type f | grep -q .; then
    fail "legacy sessions.json remained after import"
  fi
  while IFS= read -r -d '' database; do
    [[ $(sqlite3 "$database" 'PRAGMA integrity_check;') == ok ]] || fail "migrated database failed integrity: $database"
  done < <(find "$state_dir/state" "$state_dir/agents" -type f -name '*.sqlite' -print0 | sort -z)
  DRY_RUN="$rehearsal_root/session-dry-run.json" STATE="$state_dir" "$node_bin" -e '
    const cp = require("child_process");
    const report = require(process.env.DRY_RUN);
    for (const target of report.targets ?? []) {
      const database = `${process.env.STATE}/agents/${target.agentId}/agent/openclaw-agent.sqlite`;
      const count = Number(cp.execFileSync("sqlite3", [database, "SELECT count(*) FROM session_nodes;"], {encoding: "utf8"}).trim());
      if (count !== target.legacyEntries) throw new Error(`SQLite Session count mismatch for ${target.agentId}: ${count} != ${target.legacyEntries}`);
    }
  '
  assert_live_unchanged
  touch "$rehearsal_root/MIGRATED"
  log "REHEARSAL_MIGRATION_OK root=$rehearsal_root"
}

restore_isolated_baseline() {
  [[ -f $rehearsal_root/baseline-state.tar.zst ]] || fail "rollback archive is missing"
  assert_live_unchanged
  [[ $state_dir == /home/openclaw/.openclaw-upgrade-rehearsals/*/state ]] || fail "unsafe rollback target"
  log "discarding only the isolated candidate state and restoring the exact 7.1 rehearsal archive"
  rm -rf --one-file-system "$state_dir"
  zstd -dc "$rehearsal_root/baseline-state.tar.zst" | tar -C "$rehearsal_root" -xf -
  write_summary "$state_dir" "$rehearsal_root/restored-summary.json"
  cmp -s "$rehearsal_root/baseline-summary.json" "$rehearsal_root/restored-summary.json" ||
    fail "restored rehearsal state differs from the 7.1 baseline"
  while IFS= read -r -d '' database; do
    [[ $(sqlite3 "$database" 'PRAGMA integrity_check;') == ok ]] || fail "restored database failed integrity: $database"
  done < <(find "$state_dir/state" "$state_dir/agents" -type f -name '*.sqlite' -print0 | sort -z)
  rm -f "$rehearsal_root/MIGRATED" "$rehearsal_root/DATABASES_MIGRATED"
  assert_live_unchanged
}

prepare_migration_copy() {
  [[ -f $rehearsal_root/PREPARED ]] || fail "rehearsal is not prepared"
  [[ ! -e $rehearsal_root/MIGRATED && ! -e $rehearsal_root/DATABASES_MIGRATED ]] || fail "migration markers remain"
  log "rebuilding the 8.1 candidate config from the restored 7.1 rehearsal baseline"
  build_candidate_config
  assert_live_unchanged
}

restore_migrated_for_acceptance() {
  local archive=$rehearsal_root/migrated-state.tar.zst
  local checksum=$archive.sha256
  [[ -f $rehearsal_root/ROLLBACK_VERIFIED ]] || fail "rollback rehearsal has not been verified"
  [[ -f $archive && -f $checksum ]] || fail "migrated acceptance archive is missing"
  (cd "$rehearsal_root" && sha256sum -c "$(basename "$checksum")") >/dev/null || fail "migrated acceptance archive checksum failed"
  assert_live_unchanged
  [[ $state_dir == /home/openclaw/.openclaw-upgrade-rehearsals/*/state ]] || fail "unsafe acceptance restore target"
  log "restoring the verified migrated state only for isolated feature acceptance"
  rm -rf --one-file-system "$state_dir"
  zstd -dc "$archive" | tar -C "$rehearsal_root" -xf -
  if find "$state_dir/agents" -path '*/sessions/sessions.json' -type f | grep -q .; then
    fail "legacy sessions.json returned in migrated acceptance state"
  fi
  while IFS= read -r -d '' database; do
    [[ $(sqlite3 "$database" 'PRAGMA integrity_check;') == ok ]] || fail "acceptance database failed integrity: $database"
  done < <(find "$state_dir/state" "$state_dir/agents" -type f -name '*.sqlite' -print0 | sort -z)
  assert_live_unchanged
  touch "$rehearsal_root/ACCEPTANCE_STATE_RESTORED"
  log "REHEARSAL_ACCEPTANCE_STATE_OK root=$rehearsal_root"
}

rollback() {
  [[ -f $rehearsal_root/MIGRATED ]] || fail "rehearsal has not been migrated"
  restore_isolated_baseline
  touch "$rehearsal_root/ROLLBACK_VERIFIED"
  log "REHEARSAL_ROLLBACK_OK root=$rehearsal_root"
}

assert_safe_paths
[[ $EUID -eq 0 ]] || fail "must run as root"
case "$mode" in
  prepare) prepare ;;
  migrate) migrate ;;
  restore-baseline) restore_isolated_baseline ;;
  prepare-migration-copy) prepare_migration_copy ;;
  restore-migrated-for-acceptance) restore_migrated_for_acceptance ;;
  capture-worker-overlay) capture_worker_overlay_baseline ;;
  rollback) rollback ;;
  *) fail "usage: $0 prepare|migrate|restore-baseline|prepare-migration-copy|restore-migrated-for-acceptance|capture-worker-overlay|rollback" ;;
esac
