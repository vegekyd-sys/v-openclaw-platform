#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_DIR="${REPO_ROOT}/experiments/agent-worker-isolation-v1"

node --check "${EXPERIMENT_DIR}/worker-pool.mjs"
node --check "${EXPERIMENT_DIR}/worker.mjs"
node --check "${EXPERIMENT_DIR}/gateway-subagent-bridge.mjs"
node --check "${EXPERIMENT_DIR}/gateway-subagent-bridge.test.mjs"
node --check "${EXPERIMENT_DIR}/exec-env.mjs"
node --check "${EXPERIMENT_DIR}/exec-env.test.mjs"
node --check "${EXPERIMENT_DIR}/runtime-path.mjs"
node --check "${EXPERIMENT_DIR}/runtime-path.test.mjs"
node --check "${EXPERIMENT_DIR}/harness-result.mjs"
node --check "${EXPERIMENT_DIR}/harness-result.test.mjs"
node --check "${EXPERIMENT_DIR}/harness-failure.mjs"
node --check "${EXPERIMENT_DIR}/session-rollover-retry.mjs"
node --check "${EXPERIMENT_DIR}/session-rollover-retry.test.mjs"
node --check "${EXPERIMENT_DIR}/worker-agent.test.mjs"
node --check "${EXPERIMENT_DIR}/fast-compaction-provider.mjs"
node --check "${EXPERIMENT_DIR}/fast-compaction-provider.test.mjs"
node --check "${EXPERIMENT_DIR}/stubborn-worker.mjs"
node --check "${EXPERIMENT_DIR}/index.mjs"
node --check "${EXPERIMENT_DIR}/self-test.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-native-dispatch.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-config-domain.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-harness-parity.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-five-main-five-subagents.mjs"
node "${EXPERIMENT_DIR}/runtime-path.test.mjs"
node "${EXPERIMENT_DIR}/exec-env.test.mjs"
node --test \
  "${EXPERIMENT_DIR}/harness-result.test.mjs" \
  "${EXPERIMENT_DIR}/session-rollover-retry.test.mjs" \
  "${EXPERIMENT_DIR}/fast-compaction-provider.test.mjs" \
  "${EXPERIMENT_DIR}/gateway-subagent-bridge.test.mjs" \
  "${EXPERIMENT_DIR}/worker-agent.test.mjs"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-remote.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-soak.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-faults.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-subagents.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-native-dispatch.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-native-faults.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-config-domain.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-compaction.sh"
bash -n "${REPO_ROOT}/tests/vlab-agent-worker-harness-parity.sh"
bash -n "${REPO_ROOT}/scripts/activate-agent-worker-production.sh"
bash -n "${REPO_ROOT}/scripts/deploy-agent-worker-production.sh"
bash -n "${REPO_ROOT}/scripts/rollback-agent-worker-production.sh"
grep -q 'visibility = "all"' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q '.agents.defaults.maxConcurrent = $agent_max_concurrent' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q '.agents.defaults.subagents.maxConcurrent = $subagent_max_concurrent' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'id: "vlab-worker"' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'id: "openclaw"' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'api.registerAgentHarness' "${EXPERIMENT_DIR}/index.mjs"
grep -q 'nativeAgentHarnessDispatchAttached: true' "${EXPERIMENT_DIR}/index.mjs"
grep -q 'lane: message.lane ?? message.sessionKey' \
  "${EXPERIMENT_DIR}/worker.mjs"
grep -q 'allowGatewaySubagentBinding: true' \
  "${EXPERIMENT_DIR}/worker.mjs"
grep -q 'installGatewaySubagentBridge' \
  "${EXPERIMENT_DIR}/worker.mjs"
grep -q 'api.on(' "${EXPERIMENT_DIR}/index.mjs"
grep -q '"resolve_exec_env"' "${EXPERIMENT_DIR}/index.mjs"
grep -q 'gatewayConfigPath: $gateway_config_path' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q '.agents.defaults.compaction.provider = "versa-fast-quality-v1"' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'sessionRolloverRebindRetry: true' "${EXPERIMENT_DIR}/index.mjs"
grep -q 'api.registerCompactionProvider' "${EXPERIMENT_DIR}/index.mjs"
grep -q 'allowModelOverride' "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'allowedModels' "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"

jq -e '.id == "vlab-agent-worker-isolation"' \
  "${EXPERIMENT_DIR}/openclaw.plugin.json" >/dev/null
jq -e \
  '.configSchema.properties.minWorkers.minimum == 1
   and .configSchema.properties.maxWorkers.maximum == 3
   and .configSchema.properties.sessionsPerWorker.maximum == 3
   and .configSchema.properties.idleTimeoutMs.maximum == 3600000
   and .configSchema.properties.workerConfigPath.minLength == 1
   and .configSchema.properties.gatewayConfigPath.minLength == 1
   and .configSchema.properties.fastCompactionMaxQualityRetries.maximum == 1' \
  "${EXPERIMENT_DIR}/openclaw.plugin.json" >/dev/null
jq -e '.openclaw.extensions == ["./index.mjs"]' \
  "${EXPERIMENT_DIR}/package.json" >/dev/null
jq -e '.version == "0.1.5-p1"' \
  "${EXPERIMENT_DIR}/package.json" >/dev/null

if rg -n \
  '(^|[^[:alnum:]_])(token|secret|password|api[_-]?key)[[:space:]]*[:=][[:space:]]*["'\''][^"'\'']+["'\'']' \
  "$EXPERIMENT_DIR"; then
  echo "possible secret-like literal found in experiment files" >&2
  exit 1
fi

node "${EXPERIMENT_DIR}/self-test.mjs"
