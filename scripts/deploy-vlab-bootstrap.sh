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
  "${REPO_ROOT}/scripts/apply-vlab-production-parity.sh" \
  "${REPO_ROOT}/scripts/rollback-vlab-production-parity.sh" \
  "${REPO_ROOT}/config/vlab-production-parity-v1.json" \
  "${REPO_ROOT}/tests/vlab-production-parity.sh" \
  "${TARGET}:/tmp/"

ssh \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$TARGET" \
  "chmod 0700 /tmp/bootstrap-vlab.sh /tmp/apply-vlab-production-parity.sh /tmp/rollback-vlab-production-parity.sh /tmp/vlab-production-parity.sh && /tmp/bootstrap-vlab.sh && VLAB_PARITY_PROFILE=/tmp/vlab-production-parity-v1.json VLAB_PARITY_UNIT_SOURCE=/tmp/openclaw-vlab-gateway.service /tmp/apply-vlab-production-parity.sh"
