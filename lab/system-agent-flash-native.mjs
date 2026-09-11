// Only the configured System Agent's DeepSeek Flash control-plane route.
// Ordinary chat, delegated owners, credentials, and approval policy stay intact.
export const BEFORE = '\t\t...policy.runtimeSource === "implicit" ? {} : { agentHarnessRuntimeOverride: policy.runtime },';
export const AFTER = '\t\t...(modelOwnerAgentId === resolveAmbientOwnerAgentId(runConfig) && selection.provider === "deepseek" && selection.modelId === "deepseek-flash" && policy.runtime === "vlab-worker" ? { agentHarnessRuntimeOverride: "openclaw" } : policy.runtimeSource === "implicit" ? {} : { agentHarnessRuntimeOverride: policy.runtime }),';

export function patchSystemAgentFlashNative(source) {
  if (source.includes(AFTER)) return source;
  if (source.split(BEFORE).length !== 2) {
    throw new Error('Unexpected system-agent inference-route source; refuse to patch');
  }
  return source.replace(BEFORE, AFTER);
}
