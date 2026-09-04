// The opaque turn capability remains in the admitting Gateway. Build the
// message tool with native host binding, policy, caller identity and revocation.
// Worker RPC may supply tool arguments, but never construction/identity options.
export function createGatewayMessageToolRelay(params) {
  let active = true;
  let tools;
  const pending = new Set();
  const invalidate = () => {
    for (const controller of pending) controller.abort(new Error("Gateway tool generation retired"));
    tools = undefined;
  };
  const assertActive = () => {
    if (!active || params.abortSignal?.aborted) throw new Error("Gateway message owner is no longer active");
    params.hostCapabilities.assertActive();
  };
  return {
    close() { active = false; invalidate(); },
    invalidate,
    async execute(request) {
      assertActive();
      if (request.kind !== "native-message" || typeof request.toolCallId !== "string" || !request.toolCallId) {
        throw new Error("Invalid native message request");
      }
      tools ??= params.hostCapabilities.createToolSurface({
        ...params,
        sessionKey: params.sessionKey,
        runSessionKey: params.sessionKey,
        messageChannel: params.messageChannel ?? params.messageProvider,
        messageProvider: params.messageChannel ?? params.messageProvider,
        modelProvider: params.provider,
        modelId: params.modelId,
        cwd: params.cwd ?? params.workspaceDir,
        runtimeToolAllowlist: params.toolsAllow,
      }, { cwd: params.cwd ?? params.workspaceDir });
      const tool = tools.find(t => t.name === "message");
      if (!tool?.execute) throw new Error("Native Gateway policy does not allow the message tool");
      const controller = new AbortController();
      pending.add(controller);
      const abort = () => controller.abort(params.abortSignal.reason);
      params.abortSignal?.addEventListener("abort", abort, {once:true});
      try {
        const result = await tool.execute(request.toolCallId, request.args, controller.signal);
        assertActive();
        if (controller.signal.aborted) throw controller.signal.reason;
        return result;
      } finally {
        pending.delete(controller);
        params.abortSignal?.removeEventListener("abort", abort);
      }
    },
  };
}
