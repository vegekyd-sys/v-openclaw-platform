#!/usr/bin/env bash
set -euo pipefail

TARGET="${V_PRODUCTION_SSH_TARGET:-ubuntu@100.82.39.107}"
IDENTITY_FILE="${V_PRODUCTION_SSH_IDENTITY:-/Users/tianyicai/.ssh/v-zkda-20260719}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_DIR="${REPO_ROOT}/experiments/agent-worker-isolation-v1"
PLATFORM_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
TEMP_DIR="$(mktemp -d)"
ARCHIVE="${TEMP_DIR}/v-agent-worker-isolation-v1.tar.gz"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "commit the release before production deployment" >&2
  exit 1
fi

tar -czf "$ARCHIVE" -C "$EXPERIMENT_DIR" .
ARTIFACT_SHA256="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"

scp \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$ARCHIVE" \
  "${REPO_ROOT}/scripts/activate-agent-worker-production.sh" \
  "${REPO_ROOT}/scripts/rollback-agent-worker-production.sh" \
  "${TARGET}:/tmp/"

ssh \
  -i "$IDENTITY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  "$TARGET" \
  "sudo env PLATFORM_COMMIT=${PLATFORM_COMMIT} ARTIFACT_SHA256=${ARTIFACT_SHA256} /bin/bash /tmp/activate-agent-worker-production.sh"
