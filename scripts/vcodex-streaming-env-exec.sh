#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=/srv/vlab-vcodex-streaming

set -a
source "${ROOT_DIR}/secrets/runtime.env"
set +a

export HOME="${ROOT_DIR}/home"
export CODEX_HOME="${ROOT_DIR}/codex-home"
export OPENCLAW_HOME="${ROOT_DIR}/home"
export OPENCLAW_STATE_DIR="${ROOT_DIR}/state"
export OPENCLAW_CONFIG_PATH="${ROOT_DIR}/state/openclaw.json"
export OPENCLAW_WORKSPACE_DIR="${ROOT_DIR}/workspace"
export OPENCLAW_GATEWAY_PORT=24993
export TMPDIR="${ROOT_DIR}/tmp"
export PATH="/opt/vlab/node/bin:/usr/bin:/bin"

exec "$@"
