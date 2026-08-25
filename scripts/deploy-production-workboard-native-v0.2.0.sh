#!/usr/bin/env bash
set -euo pipefail

artifact=${1:-}
expected_sha=${2:-}
release_root=/home/openclaw/releases/nightshift-workboard
backup_root=/home/openclaw/.openclaw/backups/workboard-native-dispatch-v0.2.0
gateway_config=/home/openclaw/.openclaw/openclaw.json
worker_config=/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
gateway_dist=/opt/openclaw-2026.7.1/node_modules/openclaw/dist
gateway_service=openclaw-gateway.service
workboard_service=nightshift-workboard.service
workboard_unit=/etc/systemd/system/nightshift-workboard.service

if [[ ${EUID} -ne 0 || ! -f "$artifact" || ! "$expected_sha" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Usage: sudo $0 <artifact.tgz> <sha256>" >&2
  exit 2
fi
echo "$expected_sha  $artifact" | sha256sum -c -
release_id=$(tar -xOf "$artifact" ./RELEASE_COMMIT | tr -d '\r\n')
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || { echo "Artifact has an invalid RELEASE_COMMIT" >&2; exit 1; }
release="$release_root/$release_id"
[[ ! -e "$release" ]] || { echo "Immutable release already exists: $release" >&2; exit 1; }

status_file=$(mktemp)
sudo -u openclaw env HOME=/home/openclaw OPENCLAW_HOME=/home/openclaw \
  OPENCLAW_STATE_DIR=/home/openclaw/.openclaw OPENCLAW_CONFIG_PATH="$gateway_config" \
  /opt/node-v22.23.1/bin/node /opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js \
  gateway call vlab.workers.status --json --timeout 10000 >"$status_file"
node -e 'const s=require(process.argv[1]);const active=s.workers.reduce((n,w)=>n+w.activeCount,0);const queued=s.workers.reduce((n,w)=>n+w.queued,0);if(active||queued||s.pending)process.exit(3)' "$status_file" || {
  echo "Production Worker pool is not idle; refusing to restart" >&2
  exit 3
}

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$backup_root/$timestamp"
install -d -o openclaw -g openclaw -m 700 "$backup"
install -o root -g root -m 700 "$(dirname "$0")/rollback-production-workboard-native-v0.2.0.sh" "$backup/rollback.sh"
install -d -o openclaw -g openclaw -m 755 "$release_root"
install -d -o openclaw -g openclaw -m 700 "$release"
cp -a "$gateway_config" "$backup/openclaw.json.before"
cp -a "$worker_config" "$backup/worker-openclaw.json.before"
mapfile -t runtime_bundles < <(grep -l 'workboard.cards.dispatch' "$gateway_dist"/runtime-api-*.js)
[[ ${#runtime_bundles[@]} -eq 1 ]] || { echo "Expected one Workboard runtime-api bundle" >&2; exit 1; }
runtime_bundle=${runtime_bundles[0]}
cp -a "$runtime_bundle" "$backup/$(basename "$runtime_bundle").before"
if [[ -f "$workboard_unit" ]]; then cp -a "$workboard_unit" "$backup/workboard.service.before"; fi
if [[ -L "$release_root/current" ]]; then readlink -f "$release_root/current" >"$backup/current.before"; fi
cp -a "$status_file" "$backup/workers.before.json"

tar -xzf "$artifact" -C "$release"
chown -R openclaw:openclaw "$release"
sudo -u openclaw env PATH=/opt/node-v22.23.1/bin:/usr/local/bin:/usr/bin:/bin \
  /opt/node-v22.23.1/bin/npm --prefix "$release" ci --omit=dev --ignore-scripts

systemctl stop "$workboard_service"
/opt/node-v22.23.1/bin/node "$release/scripts/apply-workboard-owner-concurrency-patch.mjs" \
  --dist="$gateway_dist" --backup-dir="$backup" --max-per-owner=36 --max-total=36
/opt/node-v22.23.1/bin/node "$release/scripts/configure-worker-capacity.mjs" \
  --gateway-config="$gateway_config" --worker-config="$worker_config" \
  --max-workers=15 --sessions-per-worker=3 \
  --max-concurrent=45 --subagents-max-concurrent=45
install -o root -g root -m 644 "$release/systemd/nightshift-workboard.service" "$workboard_unit"
ln -sfn "$release" "$release_root/current"
chown -h openclaw:openclaw "$release_root/current"
systemctl daemon-reload
systemctl restart "$gateway_service"
for _ in {1..45}; do systemctl is-active --quiet "$gateway_service" && break; sleep 1; done
systemctl is-active --quiet "$gateway_service"
systemctl enable --now "$workboard_service"
for _ in {1..30}; do curl -fsS --max-time 5 http://127.0.0.1:24879/api/health >"$backup/workboard-health.json" && break; sleep 1; done
curl -fsS --max-time 5 http://127.0.0.1:24879/api/health >"$backup/workboard-health.json"

sudo -u openclaw env HOME=/home/openclaw OPENCLAW_HOME=/home/openclaw \
  OPENCLAW_STATE_DIR=/home/openclaw/.openclaw OPENCLAW_CONFIG_PATH="$gateway_config" \
  /opt/node-v22.23.1/bin/node /opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js cron add \
  --name "Night Shift native dispatch pulse" --cron '*/30 * * * * *' --exact \
  --command-argv '["/opt/node-v22.23.1/bin/node","/home/openclaw/releases/nightshift-workboard/current/scripts/nightshift-scheduler-pulse.mjs","http://127.0.0.1:24879/api/internal/scheduler/run"]' \
  --command-cwd /home/openclaw/releases/nightshift-workboard/current \
  --no-deliver --timeout-seconds 30 \
  --declaration-key nightshift-native-dispatch-v0.2-prod --json >"$backup/cron.add.json"

cron_id=$(/opt/node-v22.23.1/bin/node -e 'const x=require(process.argv[1]);process.stdout.write(x.id??x.job?.id??"")' "$backup/cron.add.json")
sudo -u openclaw env HOME=/home/openclaw OPENCLAW_HOME=/home/openclaw \
  OPENCLAW_STATE_DIR=/home/openclaw/.openclaw OPENCLAW_CONFIG_PATH="$gateway_config" \
  /opt/node-v22.23.1/bin/node /opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js cron run \
  "$cron_id" --wait --wait-timeout 60s >"$backup/cron.first-run.json"
sudo -u openclaw env HOME=/home/openclaw OPENCLAW_HOME=/home/openclaw \
  OPENCLAW_STATE_DIR=/home/openclaw/.openclaw OPENCLAW_CONFIG_PATH="$gateway_config" \
  /opt/node-v22.23.1/bin/node /opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js \
  gateway call vlab.workers.status --json --timeout 10000 >"$backup/workers.after.json"
/opt/node-v22.23.1/bin/node -e 'const s=require(process.argv[1]);if(s.maxWorkers!==15||s.maxActiveSessions!==45||s.openClawConcurrency?.maxConcurrent!==45||s.openClawConcurrency?.subagentsMaxConcurrent!==45||s.integration?.productionPromotionBlocked)process.exit(2)' "$backup/workers.after.json"

printf '%s\n' \
  "release=$release" \
  "backup=$backup" \
  "rollback=sudo $backup/rollback.sh $backup"
