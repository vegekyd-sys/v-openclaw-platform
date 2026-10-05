#!/bin/sh
# Copies the WeCom plugin directory that V runs (code and node_modules, without
# the bundled wecom CLI binaries; no state) to tmp/inputs/ for candidate tests.
set -eu
cd "$(dirname "$0")/../../.."
mkdir -p tmp/inputs
ssh v 'sudo -n bash -c "cd /home/openclaw/.openclaw/extensions/wecom-openclaw-plugin && tar czf - --exclude=node_modules/@wecom/cli-linux-x64 --exclude=node_modules/@wecom/cli ."' \
  > tmp/inputs/wecom-openclaw-plugin-2026.8.17-vlab.2-v.tgz
ls -l tmp/inputs/wecom-openclaw-plugin-2026.8.17-vlab.2-v.tgz
