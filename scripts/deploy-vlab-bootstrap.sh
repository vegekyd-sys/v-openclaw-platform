#!/usr/bin/env bash
set -euo pipefail

TARGET="${VLAB_SSH_TARGET:-root@43.133.80.6}"
IDENTITY_FILE="${VLAB_SSH_IDENTITY:-$HOME/.ssh/id_rsa}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

scp \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "${REPO_ROOT}/systemd/openclaw-vlab-gateway.service" \
  "${TARGET}:/tmp/openclaw-vlab-gateway.service"

scp \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "${REPO_ROOT}/scripts/bootstrap-vlab.sh" \
  "${TARGET}:/tmp/bootstrap-vlab.sh"

ssh \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$TARGET" \
  "chmod 0700 /tmp/bootstrap-vlab.sh && /tmp/bootstrap-vlab.sh"

