#!/usr/bin/env bash
set -euo pipefail

artifact=${1:-}
expected_sha=${2:-}
release_root=/srv/vlab/releases/nightshift-workboard
backup_root=/srv/vlab/backups/workboard-native-dispatch-v0.2.0
gateway_config=/srv/vlab/state/openclaw.json
worker_config=/srv/vlab/experiments/agent-worker-isolation-v1/worker-openclaw.json
gateway_dist=/opt/vlab/current/node_modules/openclaw/dist
gateway_service=openclaw-vlab-gateway.service
workboard_service=nightshift-vlab-workboard.service
workboard_unit=/etc/systemd/system/nightshift-vlab-workboard.service
capacity_dropin=/etc/systemd/system/openclaw-vlab-gateway.service.d/zz-worker-capacity-45.conf

if [[ ${EUID} -ne 0 || ! -f "$artifact" || ! "$expected_sha" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Usage: sudo $0 <artifact.tgz> <sha256>" >&2
  exit 2
fi
echo "$expected_sha  $artifact" | sha256sum -c -
release_id=$(tar -xOf "$artifact" ./RELEASE_COMMIT | tr -d '\r\n')
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || { echo "Artifact has an invalid RELEASE_COMMIT" >&2; exit 1; }
release="$release_root/$release_id"
[[ ! -e "$release" ]] || { echo "Immutable release already exists: $release" >&2; exit 1; }

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$backup_root/$timestamp"
install -d -m 700 "$backup"
install -d -o vlab -g vlab -m 700 /srv/vlab/nightshift
install -d -o vlab -g vlab -m 755 "$release_root"
install -d -o vlab -g vlab -m 700 "$release"
cp -a "$gateway_config" "$backup/openclaw.json.before"
cp -a "$worker_config" "$backup/worker-openclaw.json.before"
mapfile -t runtime_bundles < <(grep -l 'workboard.cards.dispatch' "$gateway_dist"/runtime-api-*.js)
[[ ${#runtime_bundles[@]} -eq 1 ]] || { echo "Expected one Workboard runtime-api bundle" >&2; exit 1; }
runtime_bundle=${runtime_bundles[0]}
cp -a "$runtime_bundle" "$backup/$(basename "$runtime_bundle").before"
systemctl cat "$gateway_service" >"$backup/gateway.service.before"
if [[ -f "$workboard_unit" ]]; then cp -a "$workboard_unit" "$backup/workboard.service.before"; fi
if [[ -f "$capacity_dropin" ]]; then cp -a "$capacity_dropin" "$backup/capacity.conf.before"; fi
if [[ -L "$release_root/current" ]]; then readlink -f "$release_root/current" >"$backup/current.before"; fi

tar -xzf "$artifact" -C "$release"
chown -R vlab:vlab "$release"
sudo -u vlab env PATH=/opt/vlab/node/bin:/usr/local/bin:/usr/bin:/bin \
  /opt/vlab/node/bin/npm --prefix "$release" ci --omit=dev --ignore-scripts

/opt/vlab/node/bin/node "$release/scripts/apply-workboard-owner-concurrency-patch.mjs" \
  --dist="$gateway_dist" --backup-dir="$backup" --max-per-owner=36 --max-total=36
/opt/vlab/node/bin/node "$release/scripts/configure-worker-capacity.mjs" \
  --gateway-config="$gateway_config" \
  --worker-config="$worker_config" \
  --max-workers=15 --sessions-per-worker=3 \
  --max-concurrent=45 --subagents-max-concurrent=45

install -o root -g root -m 644 "$release/systemd/openclaw-vlab-gateway-capacity-45.conf" "$capacity_dropin"
install -o root -g root -m 644 "$release/systemd/nightshift-vlab-workboard.service" "$workboard_unit"
ln -sfn "$release" "$release_root/current"
chown -h vlab:vlab "$release_root/current"
systemctl daemon-reload
systemctl restart "$gateway_service"

for _ in {1..30}; do
  if systemctl is-active --quiet "$gateway_service"; then break; fi
  sleep 1
done
systemctl is-active --quiet "$gateway_service"
systemctl enable --now "$workboard_service"
for _ in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:24880/api/health >"$backup/workboard-health.json"; then break; fi
  sleep 1
done
curl -fsS --max-time 5 http://127.0.0.1:24880/api/health >"$backup/workboard-health.json"

cron_output="$backup/cron.add.json"
sudo -u vlab env HOME=/srv/vlab OPENCLAW_HOME=/srv/vlab OPENCLAW_STATE_DIR=/srv/vlab/state \
  OPENCLAW_CONFIG_PATH="$gateway_config" OPENCLAW_WORKSPACE_DIR=/srv/vlab/workspace \
  OPENCLAW_GATEWAY_PORT=23793 TMPDIR=/srv/vlab/tmp \
  /opt/vlab/node/bin/node /opt/vlab/current/node_modules/openclaw/dist/index.js cron add \
  --name "Night Shift native dispatch pulse" \
  --cron '*/30 * * * * *' --exact \
  --command-argv '["/opt/vlab/node/bin/node","/srv/vlab/releases/nightshift-workboard/current/scripts/nightshift-scheduler-pulse.mjs","http://127.0.0.1:24880/api/internal/scheduler/run"]' \
  --command-cwd /srv/vlab/releases/nightshift-workboard/current \
  --no-deliver --timeout-seconds 30 \
  --declaration-key nightshift-native-dispatch-v0.2 \
  --json >"$cron_output"

curl -fsS -X POST --max-time 30 http://127.0.0.1:24880/api/internal/scheduler/run >"$backup/first-pulse.json"
sudo -u vlab env HOME=/srv/vlab OPENCLAW_HOME=/srv/vlab OPENCLAW_STATE_DIR=/srv/vlab/state \
  OPENCLAW_CONFIG_PATH="$gateway_config" OPENCLAW_WORKSPACE_DIR=/srv/vlab/workspace \
  OPENCLAW_GATEWAY_PORT=23793 TMPDIR=/srv/vlab/tmp \
  /opt/vlab/node/bin/node /opt/vlab/current/node_modules/openclaw/dist/index.js gateway call \
  vlab.workers.status --json --timeout 10000 >"$backup/workers.after.json"

printf '%s\n' \
  "release=$release" \
  "backup=$backup" \
  "rollback=sudo $release/scripts/rollback-vlab-workboard-native-v0.2.0.sh $backup"
