export const SUBAGENT_COMPLETION_ADMISSION_ORIGIN = "vlab-worker:subagent-completion";

// Preserve the host-issued task scope while binding detached work to the
// lifecycle-fenced Gateway instance already owned by the plugin runtime.
// The relay is started inside the parent turn's root-work admission and
// outlives it: once the parent yields, that inherited root is released and
// 9.6 refuses every subordinate enqueue from it ("Gateway is draining; new
// tasks are not accepted"). Like native `subagents:completion`, delivery takes
// its own root through the host's detached continuation, which still refuses
// during restart drain and waits out host suspension.
export function withGatewayCompletionContext({scope, subagentRuntime, getResolver, withResolver, withoutCaller, runDetached}, deliver) {
  const resolver = getResolver(scope) ?? getResolver(subagentRuntime);
  if (typeof resolver !== "function") throw new Error("Native completion Gateway instance binding is unavailable");
  const admitted = typeof runDetached === "function"
    ? run => runDetached(async () => await run(), SUBAGENT_COMPLETION_ADMISSION_ORIGIN)
    : run => run();
  return withoutCaller(() => admitted(() => withResolver(resolver, deliver)));
}
