#!/usr/bin/env bash
# Install V's storage controllers: data-disk autogrow v2, the daily flow monitor and the
# nightly tier archiver (enabled only once /etc/v-storage/archive-bucket names the bucket).
#
#   scripts/install-v-storage.sh v            install, run --check / --report, enable timers
#   scripts/install-v-storage.sh v --dry-run  stage and run --check / --report only
#
# Replaces autogrow v1 (/usr/local/lib/v-disk-autogrow, never in git); the v1 files
# are kept under /var/lib/v-disk-autogrow/v1-backup-<ts>/. Alerts use sentinel.py's
# direct Feishu path, so the sentinel must already be installed.
set -euo pipefail

host=${1:?usage: install-v-storage.sh <ssh-host> [--dry-run]}
mode=${2:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

ssh "$host" 'test -f /opt/v-sentinel/sentinel.py' \
  || { echo "v-sentinel is not installed on $host; install it first" >&2; exit 1; }
ssh "$host" 'sudo grep -q "^TENCENTCLOUD_SECRET_ID=" /home/openclaw/.openclaw/gateway.systemd.env' \
  || { echo "gateway.systemd.env on $host has no TENCENTCLOUD_SECRET_ID" >&2; exit 1; }

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "sudo rm -rf -- $stage"' EXIT
scp -q "$repo_root"/scripts/v-storage/{tc.py,cos.py,autogrow.py,flow.py,archive.py,policy.json} "$host:$stage/"
scp -q "$repo_root"/systemd/v-disk-autogrow.{service,timer} "$repo_root"/systemd/v-storage-flow.{service,timer} \
  "$repo_root"/systemd/v-archive.{service,timer} "$host:$stage/"

run_env="sudo systemd-run --quiet --wait --pipe -p EnvironmentFile=/home/openclaw/.openclaw/gateway.systemd.env"
if [[ "$mode" == --dry-run ]]; then
  echo '--- dry run: autogrow --check (private state dir, buys nothing) ---'
  ssh "$host" "$run_env -E V_AUTOGROW_STATE_DIR=$stage/ag -E V_STORAGE_POLICY=$stage/policy.json /usr/bin/python3 $stage/autogrow.py --check"
  echo '--- dry run: flow --report (records nothing, sends nothing) ---'
  ssh "$host" "$run_env -E V_FLOW_STATE_DIR=$stage/fl -E V_STORAGE_POLICY=$stage/policy.json /usr/bin/python3 $stage/flow.py --report"
  echo '--- dry run: archive --dry-run (moves nothing, uploads nothing) ---'
  ssh "$host" "sudo test -s /etc/v-storage/archive-bucket || echo 'no /etc/v-storage/archive-bucket yet: archive timer would stay off'"
  ssh "$host" "$run_env -E V_ARCHIVE_STATE_DIR=$stage/ar -E V_STORAGE_POLICY=$stage/policy.json /usr/bin/python3 $stage/archive.py --dry-run 2>&1 | head -80" || true
  exit 0
fi

ts=$(date +%Y%m%dT%H%M%S)
ssh "$host" "set -e
sudo systemctl stop v-disk-autogrow.timer || true
if [ -d /usr/local/lib/v-disk-autogrow ]; then
  sudo install -d -m 0700 /var/lib/v-disk-autogrow/v1-backup-$ts
  sudo cp -a /usr/local/lib/v-disk-autogrow /etc/systemd/system/v-disk-autogrow.service /etc/systemd/system/v-disk-autogrow.timer /var/lib/v-disk-autogrow/v1-backup-$ts/ 2>/dev/null || true
  sudo cp -a /var/lib/v-disk-autogrow/state.json /var/lib/v-disk-autogrow/v1-backup-$ts/ 2>/dev/null || true
fi
sudo install -d -m 0755 /opt/v-storage /etc/v-storage
for f in tc.py cos.py autogrow.py flow.py archive.py; do sudo install -m 0755 -o root -g root $stage/\$f /opt/v-storage/\$f; done
sudo install -m 0644 -o root -g root $stage/policy.json /etc/v-storage/policy.json
for u in v-disk-autogrow.service v-disk-autogrow.timer v-storage-flow.service v-storage-flow.timer v-archive.service v-archive.timer; do
  sudo install -m 0644 -o root -g root $stage/\$u /etc/systemd/system/\$u
done
sudo systemctl daemon-reload"

echo '--- autogrow --check ---'
ssh "$host" "$run_env /usr/bin/python3 /opt/v-storage/autogrow.py --check"
ssh "$host" 'sudo systemctl enable --now v-disk-autogrow.timer v-storage-flow.timer'
echo '--- flow --report ---'
ssh "$host" "$run_env /usr/bin/python3 /opt/v-storage/flow.py --report"
if ssh "$host" 'sudo test -s /etc/v-storage/archive-bucket'; then
  ssh "$host" 'sudo systemctl enable v-archive.timer && sudo systemctl start v-archive.timer'
else
  echo 'archive timer left off: write the bucket name to /etc/v-storage/archive-bucket first'
fi
ssh "$host" 'systemctl list-timers v-disk-autogrow.timer v-storage-flow.timer v-archive.timer --no-pager'
echo "v1 backup: /var/lib/v-disk-autogrow/v1-backup-$ts (rollback: copy it back, daemon-reload, restart the timer)"
