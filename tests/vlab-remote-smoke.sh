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
   systemctl is-active --quiet openclaw-vlab-gateway.service
   systemctl is-active --quiet --user openclaw-gateway.service
   test "$(stat -c %U /srv/vlab/state)" = "vlab"
   test "$(stat -c %U /srv/vlab/workspace)" = "vlab"
   test -s /srv/vlab/state/gateway-token
   jq -e ".gateway.port == 23793 and .gateway.bind == \"loopback\" and (.channels | length) == 0" /srv/vlab/state/openclaw.json >/dev/null
   ss -ltn | grep -q "127.0.0.1:23793"
   ! ss -ltn | grep -q "0.0.0.0:23793"
   test "$(find /srv/vlab/state/agents/makaron/sessions -maxdepth 1 -type f -name \"*.jsonl\" | wc -l)" -gt 0
   test "$(find /srv/vlab/workspace/memory -type f | wc -l)" -gt 0
   echo "vLab remote isolation smoke passed"'

