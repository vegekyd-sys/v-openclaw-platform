#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_DIR="${REPO_ROOT}/experiments/agent-worker-isolation-v1"

node --check "${EXPERIMENT_DIR}/worker-pool.mjs"
node --check "${EXPERIMENT_DIR}/worker.mjs"
node --check "${EXPERIMENT_DIR}/stubborn-worker.mjs"
node --check "${EXPERIMENT_DIR}/index.mjs"
node --check "${EXPERIMENT_DIR}/self-test.mjs"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-remote.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-soak.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-faults.sh"
grep -q 'visibility = "agent"' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q '.agents.defaults.maxConcurrent = $sessions_per_worker' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q '.agents.defaults.subagents.maxConcurrent = 1' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"

jq -e '.id == "vlab-agent-worker-isolation"' \
  "${EXPERIMENT_DIR}/openclaw.plugin.json" >/dev/null
jq -e \
  '.configSchema.properties.minWorkers.minimum == 1
   and .configSchema.properties.maxWorkers.maximum == 3
   and .configSchema.properties.sessionsPerWorker.maximum == 3
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
