// Detached completion remains owned by the native task and its Gateway instance.
// The offer HTTP client and the initiating tool invocation have ended by now.
export function withGatewayCompletionContext({
  scope, requesterSessionKey, assertScope, subagentRuntime,
  getResolver, withResolver, withoutCaller,
}, run) {
  if (!scope || typeof assertScope !== "function") {
    throw new Error("OpenClaw Agent Harness host-issued task runtime scope is unavailable");
  }
  const issued = assertScope(scope);
  if (!requesterSessionKey || issued.requesterSessionKey !== requesterSessionKey) {
    throw new Error("Native completion task scope does not own the requester session");
  }
  // An expired task resolver must never fall through to a newer instance.
  const resolver = getResolver(issued) ?? getResolver(subagentRuntime);
  if (typeof resolver !== "function" || !resolver()) {
    throw new Error("Native completion Gateway instance binding is unavailable");
  }
  return withoutCaller(() => withResolver(resolver, run, { inheritRequestScope: false }));
}
