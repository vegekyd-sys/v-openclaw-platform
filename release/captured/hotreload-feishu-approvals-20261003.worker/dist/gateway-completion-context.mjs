// Preserve the host-issued task scope while binding detached work to the
// lifecycle-fenced Gateway instance already owned by the plugin runtime.
export function withGatewayCompletionContext({scope, subagentRuntime, getResolver, withResolver, withoutCaller}, deliver) {
  const resolver = getResolver(scope) ?? getResolver(subagentRuntime);
  if (typeof resolver !== "function") throw new Error("Native completion Gateway instance binding is unavailable");
  return withoutCaller(() => withResolver(resolver, deliver));
}
