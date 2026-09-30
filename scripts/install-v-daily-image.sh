#!/usr/bin/env bash
# Install the daily system-disk image job on V, beside the existing sentinel.
#
#   scripts/install-v-daily-image.sh v
#
# It calls the Tencent Cloud API with the credentials the Gateway already has and
# changes nothing about the Gateway or any service that serves traffic. The first
# run here is --check: it lists images and prints the plan, creating nothing.
set -euo pipefail

host=${1:?usage: install-v-daily-image.sh <ssh-host>}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# Failure alerts use sentinel.py's Feishu path, so it must already be there.
ssh "$host" 'test -f /opt/v-sentinel/sentinel.py' \
  || { echo "v-sentinel is not installed on $host; install it first" >&2; exit 1; }
ssh "$host" 'sudo grep -q "^TENCENTCLOUD_SECRET_ID=" /home/openclaw/.openclaw/gateway.systemd.env' \
  || { echo "gateway.systemd.env on $host has no TENCENTCLOUD_SECRET_ID" >&2; exit 1; }

stage=$(ssh "$host" 'mktemp -d')
trap 'ssh "$host" "rm -rf -- $stage"' EXIT
scp -q "${repo_root}/scripts/v-daily-image.py" "$host:$stage/daily-image.py"
scp -q "${repo_root}/systemd/v-daily-image.service" "${repo_root}/systemd/v-daily-image.timer" "$host:$stage/"

ssh "$host" "sudo install -m 0755 -o root -g root $stage/daily-image.py /opt/v-sentinel/daily-image.py
sudo install -m 0644 -o root -g root $stage/v-daily-image.service /etc/systemd/system/v-daily-image.service
sudo install -m 0644 -o root -g root $stage/v-daily-image.timer /etc/systemd/system/v-daily-image.timer
sudo systemctl daemon-reload
sudo systemctl enable --now v-daily-image.timer"

echo '--- first run (lists images and the plan, changes nothing) ---'
ssh "$host" 'sudo systemd-run --quiet --wait --pipe -p EnvironmentFile=/home/openclaw/.openclaw/gateway.systemd.env /usr/bin/python3 /opt/v-sentinel/daily-image.py --check'
ssh "$host" 'systemctl list-timers v-daily-image.timer --no-pager'
