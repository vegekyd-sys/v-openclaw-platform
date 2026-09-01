#!/usr/bin/env bash
set -euo pipefail

service=openclaw-vlab-gateway.service
state_dir=/srv/vlab/state
shared_db=$state_dir/state/openclaw.sqlite
config=$state_dir/openclaw.json
workspace=/srv/vlab/workspace
event_source=$workspace/memory/.dreams/events.jsonl
attestations=$state_dir/workspace-attestations
node_bin=/opt/vlab/node/bin/node
openclaw_root=/opt/vlab/releases/2026.8.1
migration_script=/srv/vlab/staging/openclaw-2026.8.1-probe/migrate-workspace-v2.mjs
staging_root=/srv/vlab/staging/openclaw-2026.8.1-probe
backup_parent=/srv/vlab/backups/openclaw-2026.8.1

[[ $EUID -eq 0 ]]
[[ -f $shared_db && -f $config && -f $event_source && -d $attestations ]]
[[ -x $node_bin && -f $migration_script ]]
[[ $($node_bin -p "require('$openclaw_root/node_modules/openclaw/package.json').version") == 2026.8.1 ]]

status=$(runuser -u vlab -- env \
  HOME=/srv/vlab OPENCLAW_HOME=/srv/vlab OPENCLAW_STATE_DIR="$state_dir" \
  OPENCLAW_CONFIG_PATH="$config" OPENCLAW_WORKSPACE_DIR="$workspace" \
  TMPDIR=/srv/vlab/tmp PATH=/opt/vlab/node/bin:/usr/local/bin:/usr/bin:/bin \
  "$node_bin" "$openclaw_root/node_modules/openclaw/dist/index.js" \
  gateway call vlab.workers.status --json 2>/dev/null)
STATUS_JSON="$status" "$node_bin" -e '
  const status = JSON.parse(process.env.STATUS_JSON);
  const active = status.workers.reduce((sum, worker) => sum + (worker.activeCount ?? 0), 0);
  const queued = status.workers.reduce((sum, worker) => sum + (worker.queued ?? 0), 0);
  if (active !== 0 || queued !== 0 || status.pending !== 0) {
    throw new Error(`unsafe migration window active=${active} queued=${queued} pending=${status.pending}`);
  }
'

stamp=$(date +%Y%m%d-%H%M%S)
backup=$backup_parent/workspace-state-targeted-$stamp
simulation=$(mktemp -d "$staging_root/workspace-state-targeted-sim.XXXXXX")
held_event=$backup/events.jsonl.held
mkdir -p "$backup" "$simulation/state" "$simulation/workspace-attestations"

success=0
live_touched=0
cleanup() {
  code=$?
  set +e
  if [[ $success -ne 1 ]]; then
    if [[ $live_touched -eq 1 ]]; then
      rm -f "$shared_db" "$shared_db-wal" "$shared_db-shm"
      cp -a "$backup/openclaw.sqlite.before" "$shared_db"
      rm -rf "$attestations"
      cp -a "$backup/workspace-attestations.before" "$attestations"
    fi
    if [[ -f $held_event ]]; then
      rm -f "$event_source"
      mv "$held_event" "$event_source"
    fi
    chown vlab:vlab "$event_source" 2>/dev/null || true
    chmod 600 "$event_source" 2>/dev/null || true
    systemctl start "$service" || true
  fi
  exit "$code"
}
trap cleanup EXIT

systemctl stop "$service"
! systemctl is-active --quiet "$service"
rm -f "$shared_db-wal" "$shared_db-shm"

cp -a "$shared_db" "$backup/openclaw.sqlite.before"
cp -a "$attestations" "$backup/workspace-attestations.before"
cp -a "$config" "$backup/openclaw.json.before"
sha256sum "$event_source" > "$backup/events.sha256.before"
sqlite3 "$backup/openclaw.sqlite.before" 'PRAGMA integrity_check;' | grep -qx ok
mv "$event_source" "$held_event"

# Prove the exact official migration against a byte-for-byte database copy
# while the unrelated Memory Core legacy source is outside the workspace.
cp -a "$backup/openclaw.sqlite.before" "$simulation/state/openclaw.sqlite"
cp -a "$backup/workspace-attestations.before/." "$simulation/workspace-attestations/"
OPENCLAW_STATE_DIR="$simulation" OPENCLAW_CONFIG_PATH="$config" \
  "$node_bin" "$migration_script" \
  --config "$config" --openclaw-root "$openclaw_root" \
  --state-dir "$simulation" --expected-source-count 4 --apply \
  > "$backup/simulation.json"

[[ $(sqlite3 "$simulation/state/openclaw.sqlite" 'select count(*) from workspace_setup_state;') -eq 4 ]]
[[ $(sqlite3 "$simulation/state/openclaw.sqlite" 'select count(*) from workspace_path_aliases;') -eq 4 ]]
[[ $(sqlite3 "$simulation/state/openclaw.sqlite" 'select count(*) from workspace_generated_bootstrap_hashes;') -eq 18 ]]
[[ $(find "$simulation/workspace-attestations" -type f -name '*.attested' | wc -l) -eq 0 ]]
sqlite3 "$simulation/state/openclaw.sqlite" 'PRAGMA integrity_check;' | grep -qx ok

live_touched=1
OPENCLAW_STATE_DIR="$state_dir" OPENCLAW_CONFIG_PATH="$config" \
  "$node_bin" "$migration_script" \
  --config "$config" --openclaw-root "$openclaw_root" \
  --state-dir "$state_dir" --expected-source-count 4 --apply \
  > "$backup/migration.json"

[[ $(sqlite3 "$shared_db" 'select count(*) from workspace_setup_state;') -eq 4 ]]
[[ $(sqlite3 "$shared_db" 'select count(*) from workspace_path_aliases;') -eq 4 ]]
[[ $(sqlite3 "$shared_db" 'select count(*) from workspace_generated_bootstrap_hashes;') -eq 18 ]]
[[ $(find "$attestations" -type f -name '*.attested' | wc -l) -eq 0 ]]
sqlite3 "$shared_db" 'PRAGMA integrity_check;' | grep -qx ok

mv "$held_event" "$event_source"
chown vlab:vlab "$event_source"
chmod 600 "$event_source"
sha256sum -c "$backup/events.sha256.before"
test ! -e "$event_source.migrated"

started=$(date --iso-8601=seconds)
systemctl start "$service"
for _ in $(seq 1 40); do
  journalctl -u "$service" --since "$started" --no-pager | grep -q '\[gateway\] ready' && break
  sleep 2
done
systemctl is-active --quiet "$service"
journalctl -u "$service" --since "$started" --no-pager | grep -q '\[gateway\] ready'
success=1
printf 'WORKSPACE_MIGRATION_OK backup=%s started=%s\n' "$backup" "$started"
