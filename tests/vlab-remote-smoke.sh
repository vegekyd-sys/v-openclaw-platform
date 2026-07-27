#!/usr/bin/env bash
set -euo pipefail

TARGET="${VLAB_SSH_TARGET:-root@43.133.80.6}"
IDENTITY_FILE="${VLAB_SSH_IDENTITY:-$HOME/.ssh/id_rsa}"

ssh \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$TARGET" \
  'set -eu
   sleep 8
   systemctl is-active --quiet openclaw-vlab-gateway.service
   systemctl is-active --quiet --user openclaw-gateway.service
   test "$(systemctl show openclaw-vlab-gateway.service -p SubState --value)" = "running"
   test "$(systemctl show openclaw-vlab-gateway.service -p MainPID --value)" -gt 0
   gateway_token="$(cat /srv/vlab/state/gateway-token)"
   sudo -u vlab env \
     HOME=/srv/vlab \
     OPENCLAW_HOME=/srv/vlab \
     OPENCLAW_STATE_DIR=/srv/vlab/state \
     OPENCLAW_CONFIG_PATH=/srv/vlab/state/openclaw.json \
     OPENCLAW_WORKSPACE_DIR=/srv/vlab/workspace \
     /opt/vlab/node/bin/node \
     /opt/vlab/current/node_modules/openclaw/openclaw.mjs \
     gateway status --json --require-rpc --token "$gateway_token" >/dev/null
   test "$(stat -c %U /srv/vlab/state)" = "vlab"
   test "$(stat -c %U /srv/vlab/workspace)" = "vlab"
   test -s /srv/vlab/state/gateway-token
   jq -e ".gateway.port == 23793 and .gateway.bind == \"loopback\" and (.channels | length) == 0" /srv/vlab/state/openclaw.json >/dev/null
   ss -ltn | grep -q "127.0.0.1:23793"
   ! ss -ltn | grep -q "0.0.0.0:23793"
   test "$(find /srv/vlab/state/agents/makaron/sessions -maxdepth 1 -type f -name \"*.jsonl\" | wc -l)" -gt 0
   test "$(find /srv/vlab/workspace/memory -type f | wc -l)" -gt 0
   echo "vLab remote isolation smoke passed"'
