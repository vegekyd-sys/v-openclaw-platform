#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_DIR="${REPO_ROOT}/experiments/agent-worker-isolation-v1"

node --check "${EXPERIMENT_DIR}/worker-pool.mjs"
node --check "${EXPERIMENT_DIR}/worker.mjs"
node --check "${EXPERIMENT_DIR}/index.mjs"
node --check "${EXPERIMENT_DIR}/self-test.mjs"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-remote.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-soak.sh"

jq -e '.id == "vlab-agent-worker-isolation"' \
  "${EXPERIMENT_DIR}/openclaw.plugin.json" >/dev/null
jq -e \
  '.configSchema.properties.minWorkers.minimum == 1
   and .configSchema.properties.maxWorkers.maximum == 16
   and .configSchema.properties.idleTimeoutMs.maximum == 3600000' \
  "${EXPERIMENT_DIR}/openclaw.plugin.json" >/dev/null
jq -e '.openclaw.extensions == ["./index.mjs"]' \
  "${EXPERIMENT_DIR}/package.json" >/dev/null

if rg -n \
  '(^|[^[:alnum:]_])(token|secret|password|api[_-]?key)[[:space:]]*[:=][[:space:]]*["'\''][^"'\'']+["'\'']' \
  "$EXPERIMENT_DIR"; then
  echo "possible secret-like literal found in experiment files" >&2
  exit 1
fi

node "${EXPERIMENT_DIR}/self-test.mjs"
