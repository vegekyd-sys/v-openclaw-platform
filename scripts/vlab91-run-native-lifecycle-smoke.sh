#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(hostname) == VM-0-4-ubuntu ]]
candidate=/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902
smoke=${1:-vlab91-native-lifecycle-smoke.mjs}
case "$smoke" in vlab91-native-lifecycle-smoke.mjs|vlab91-approval-cancel-smoke.mjs|vlab91-active-cancel-smoke.mjs) ;; *) exit 1 ;; esac
systemd-run --quiet --wait --pipe --collect --unit="vlab91-native-lifecycle-$$" \
 --property=User=vlab --property=Group=vlab --property=WorkingDirectory="$candidate" \
 --property=MemoryHigh=3G --property=MemoryMax=4G \
 --property=EnvironmentFile="-$candidate/state/.env.production-mirror" \
 --property=EnvironmentFile="-$candidate/state/gateway.systemd.env.production-mirror" \
 --property=EnvironmentFile=-/srv/vlab/state/feishu.env \
 --setenv=HOME="$candidate" --setenv=OPENCLAW_HOME="$candidate" \
 --setenv=OPENCLAW_STATE_DIR="$candidate/state" --setenv=OPENCLAW_CONFIG_PATH="$candidate/state/openclaw.json" \
 --setenv=OPENCLAW_WORKSPACE_DIR="$candidate/workspace" --setenv=OPENCLAW_GATEWAY_PORT=24993 \
 --setenv=PATH="$candidate/runtime/npm-global/bin:/opt/vlab/node-v22.23.1-linux-x64/bin:/usr/local/bin:/usr/bin:/bin" \
 /opt/vlab/node-v22.23.1-linux-x64/bin/node "/srv/vlab/staging/$smoke"
