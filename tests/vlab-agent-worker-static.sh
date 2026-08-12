#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_DIR="${REPO_ROOT}/experiments/agent-worker-isolation-v1"

node --check "${EXPERIMENT_DIR}/worker-pool.mjs"
node --check "${EXPERIMENT_DIR}/worker.mjs"
node --check "${EXPERIMENT_DIR}/harness-event-contract.mjs"
node --check "${EXPERIMENT_DIR}/harness-event-contract.test.mjs"
node --check "${EXPERIMENT_DIR}/worker-stream-parity.test.mjs"
node --check "${EXPERIMENT_DIR}/worker-gateway-events.mjs"
node --check "${EXPERIMENT_DIR}/worker-gateway-events.test.mjs"
node --check "${EXPERIMENT_DIR}/worker-detached-event.test.mjs"
node --check "${EXPERIMENT_DIR}/fake-detached-event-worker.mjs"
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
node --check "${EXPERIMENT_DIR}/session-hotset.mjs"
node --check "${EXPERIMENT_DIR}/session-hotset.test.mjs"
node --check "${EXPERIMENT_DIR}/gateway-owned-tool-proxy.mjs"
node --check "${EXPERIMENT_DIR}/gateway-owned-tool-proxy.test.mjs"
node --check "${EXPERIMENT_DIR}/skill-workshop-subprocess-runner.mjs"
node --check "${EXPERIMENT_DIR}/patch-openclaw-skill-workshop-worker-proxy.mjs"
node --check "${EXPERIMENT_DIR}/patch-openclaw-skill-workshop-worker-proxy.test.mjs"
node --check "${REPO_ROOT}/scripts/patch-openclaw-session-hotset.mjs"
node --check "${REPO_ROOT}/scripts/patch-openclaw-media-completion-relay.mjs"
node --check "${REPO_ROOT}/scripts/prune-openclaw-session-hotset.mjs"
node --check "${REPO_ROOT}/tests/patch-openclaw-session-hotset.test.mjs"
node --check "${REPO_ROOT}/tests/patch-openclaw-media-completion-relay.test.mjs"
node --check "${REPO_ROOT}/tests/prune-openclaw-session-hotset.test.mjs"
node --check "${REPO_ROOT}/tests/vlab-session-hotset-benchmark.mjs"
node --check "${REPO_ROOT}/tests/vlab-session-hotset-cross-session.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-tool-parity.mjs"
node --check "${REPO_ROOT}/tests/vlab-workshop-scale-fixture.mjs"
node --check "${EXPERIMENT_DIR}/stubborn-worker.mjs"
node --check "${EXPERIMENT_DIR}/silent-worker.mjs"
node --check "${EXPERIMENT_DIR}/index.mjs"
node --check "${EXPERIMENT_DIR}/self-test.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-native-dispatch.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-stream-parity.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-config-domain.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-harness-parity.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-five-main-five-subagents.mjs"
node --check "${REPO_ROOT}/tests/vlab-agent-worker-long-timeout.mjs"
node "${EXPERIMENT_DIR}/runtime-path.test.mjs"
node "${EXPERIMENT_DIR}/exec-env.test.mjs"
node "${EXPERIMENT_DIR}/worker-timeout-isolation.test.mjs"
node --test \
  "${EXPERIMENT_DIR}/harness-event-contract.test.mjs" \
  "${EXPERIMENT_DIR}/harness-result.test.mjs" \
  "${EXPERIMENT_DIR}/session-rollover-retry.test.mjs" \
  "${EXPERIMENT_DIR}/fast-compaction-provider.test.mjs" \
  "${EXPERIMENT_DIR}/session-hotset.test.mjs" \
  "${EXPERIMENT_DIR}/gateway-owned-tool-proxy.test.mjs" \
  "${EXPERIMENT_DIR}/patch-openclaw-skill-workshop-worker-proxy.test.mjs" \
  "${EXPERIMENT_DIR}/worker-stream-parity.test.mjs" \
  "${EXPERIMENT_DIR}/worker-gateway-events.test.mjs" \
  "${EXPERIMENT_DIR}/worker-detached-event.test.mjs" \
  "${EXPERIMENT_DIR}/worker-agent.test.mjs" \
  "${REPO_ROOT}/tests/patch-openclaw-session-hotset.test.mjs" \
  "${REPO_ROOT}/tests/patch-openclaw-media-completion-relay.test.mjs" \
  "${REPO_ROOT}/tests/prune-openclaw-session-hotset.test.mjs"
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
grep -q 'api.registerAgentHarness' "${EXPERIMENT_DIR}/index.mjs"
grep -q 'nativeAgentHarnessDispatchAttached: true' "${EXPERIMENT_DIR}/index.mjs"
grep -q 'lane: message.lane ?? message.sessionKey' \
  "${EXPERIMENT_DIR}/worker.mjs"
grep -q 'allowGatewaySubagentBinding: true' \
  "${EXPERIMENT_DIR}/worker.mjs"
grep -q 'agentCommandFromIngress' \
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
grep -q 'nativeHarnessEventParity' "${EXPERIMENT_DIR}/index.mjs"
grep -q '"stream-event"' "${EXPERIMENT_DIR}/worker.mjs"
grep -q '"stream-event-ack"' "${EXPERIMENT_DIR}/worker-pool.mjs"
grep -q '"worker-gateway-event"' "${EXPERIMENT_DIR}/worker.mjs"
grep -q '"worker-gateway-event-ack"' "${EXPERIMENT_DIR}/worker-pool.mjs"
grep -q 'mediaCompletionRelay' "${EXPERIMENT_DIR}/index.mjs"
grep -q 'onPartialReply' \
  "${REPO_ROOT}/tests/vlab-agent-worker-stream-parity.mjs"
grep -q 'OPENCLAW_SESSION_HOTSET_ENABLED=1' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'SESSION_HOTSET_PATCHER.*--restore' \
  "${REPO_ROOT}/scripts/rollback-agent-worker-experiment.sh"
grep -q 'MEDIA_COMPLETION_PATCHER.*--restore' \
  "${REPO_ROOT}/scripts/rollback-agent-worker-experiment.sh"
grep -q 'applyVersaSessionHotsetProjection' \
  "${REPO_ROOT}/scripts/patch-openclaw-session-hotset.mjs"
grep -q 'ExecStartPre=.*SESSION_HOTSET_PRUNER' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'OPENCLAW_SESSION_HOTSET_ENABLED=1' \
  "${REPO_ROOT}/scripts/activate-agent-worker-production.sh"
grep -q 'SESSION_HOTSET_PATCHER.*--restore' \
  "${REPO_ROOT}/scripts/rollback-agent-worker-production.sh"
grep -q 'ExecStartPre=.*SESSION_HOTSET_PRUNER' \
  "${REPO_ROOT}/scripts/activate-agent-worker-production.sh"
grep -q 'patch-openclaw-session-hotset.mjs' \
  "${REPO_ROOT}/scripts/deploy-agent-worker-production.sh"
grep -q 'patch-feishu-active-run-steering.mjs' \
  "${REPO_ROOT}/scripts/deploy-agent-worker-production.sh"
grep -q 'V_FEISHU_STEER_CHAT_IDS' \
  "${REPO_ROOT}/scripts/deploy-agent-worker-production.sh"
grep -q 'activeRunSteer' \
  "${REPO_ROOT}/scripts/rollback-agent-worker-production.sh"
grep -q 'previousActiveManifest' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'previousSessionHotset' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'previous_active_manifest' \
  "${REPO_ROOT}/scripts/rollback-agent-worker-experiment.sh"
grep -q 'previous_hotset_module' \
  "${REPO_ROOT}/scripts/rollback-agent-worker-experiment.sh"
grep -q 'node_modules/@openclaw/feishu/package.json' \
  "${REPO_ROOT}/scripts/activate-agent-worker-experiment.sh"
grep -q 'patchedPackageRoots' \
  "${REPO_ROOT}/scripts/activate-agent-worker-production.sh"
grep -q 'prune-openclaw-session-hotset.mjs' \
  "${REPO_ROOT}/scripts/deploy-agent-worker-production.sh"
grep -q 'workerIsolationVersion == "0.2.3"' \
  "${REPO_ROOT}/scripts/activate-agent-worker-production.sh"
grep -q 'patch-openclaw-skill-workshop-worker-proxy.mjs' \
  "${REPO_ROOT}/scripts/activate-agent-worker-production.sh"
grep -q 'gatewayOwnedToolIsolation.preExisting' \
  "${REPO_ROOT}/scripts/rollback-agent-worker-production.sh"
grep -q 'mediaCompletionRelay.preExisting' \
  "${REPO_ROOT}/scripts/rollback-agent-worker-production.sh"
grep -q 'sessionHotset: getSessionHotsetStatus()' \
  "${EXPERIMENT_DIR}/worker.mjs"

jq -e '.id == "vlab-agent-worker-isolation"' \
  "${EXPERIMENT_DIR}/openclaw.plugin.json" >/dev/null
jq -e \
  '.configSchema.properties.minWorkers.minimum == 1
   and .configSchema.properties.maxWorkers.maximum == 3
   and .configSchema.properties.sessionsPerWorker.maximum == 3
   and .configSchema.properties.idleTimeoutMs.maximum == 3600000
   and .configSchema.properties.requestTimeoutMs.maximum == 172800000
   and .configSchema.properties.requestStallTimeoutMs.minimum == 30000
   and .configSchema.properties.gatewayOwnedToolTimeoutMs.minimum == 30000
   and .configSchema.properties.workerConfigPath.minLength == 1
   and .configSchema.properties.gatewayConfigPath.minLength == 1
   and .configSchema.properties.fastCompactionMaxQualityRetries.maximum == 1' \
  "${EXPERIMENT_DIR}/openclaw.plugin.json" >/dev/null
jq -e '.openclaw.extensions == ["./index.mjs"]' \
  "${EXPERIMENT_DIR}/package.json" >/dev/null
jq -e '.version == "0.2.3"' \
  "${EXPERIMENT_DIR}/package.json" >/dev/null
grep -q 'requestTimeoutMs: attemptTimeoutMs' "${EXPERIMENT_DIR}/index.mjs"

if rg -n \
  '(^|[^[:alnum:]_])(token|secret|password|api[_-]?key)[[:space:]]*[:=][[:space:]]*["'\''][^"'\'']+["'\'']' \
  "$EXPERIMENT_DIR"; then
  echo "possible secret-like literal found in experiment files" >&2
  exit 1
fi

node "${EXPERIMENT_DIR}/self-test.mjs"
