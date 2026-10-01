// Opt-in startup preparation only. Never issue an Agent/model/tool request.
export async function prewarmWorkerRuntime({
  enabled,
  agentId = "makaron",
  loadAgentRuntime,
  loadCompactionRuntime,
  preloadBuiltin = async () => {},
  signal,
}) {
  if (!enabled) return { status: "disabled" };
  const start = performance.now();
  let lease;
  try {
    const agentRuntime = await loadAgentRuntime();
    const { commandRuntime, configRuntime, preparedRuntime } =
      await loadCompactionRuntime();
    const config = configRuntime.loadConfig();
    const workspaceDir = agentRuntime.resolveAgentWorkspaceDir(config, agentId);
    lease = await preparedRuntime.acquireAgentRunPreparedModelRuntime(
      {
        config,
        agentId,
        agentDir: agentRuntime.resolveAgentDir(config, agentId),
        allowGatewaySubagentBinding: true,
        workspaceDir,
      },
      // Workers are long-lived runtimes without a Gateway lifecycle; 2026.9.5
      // retires idle run owners unless asked to retain them.
      { abortSignal: signal, catalogMode: "static", retainIdleRunOwner: true },
    );
    // The prepared model runtime above is the expensive part on 2026.9.5
    // (plugin generation capture, catalog, registries); the command runtime
    // prewarm only exists on some releases.
    const commandPreparation =
      typeof commandRuntime.prewarmAgentCommandRuntimes === "function"
        ? await commandRuntime.prewarmAgentCommandRuntimes({
            config,
            agentId,
            workspaceDir,
            pluginMetadataSnapshot:
              lease.pluginGeneration?.pluginMetadataSnapshot,
          })
        : undefined;
    await preloadBuiltin();
    return {
      status: "ready",
      ms: Math.round(performance.now() - start),
      skillSnapshotPrepared:
        commandPreparation?.skillSnapshotPrepared === true,
    };
  } catch (error) {
    return {
      status: "deferred-to-normal-turn",
      errorCategory: error?.name === "AbortError" ? "abort" : "other",
      ms: Math.round(performance.now() - start),
    };
  } finally {
    if (typeof lease?.[Symbol.asyncDispose] === "function") await lease[Symbol.asyncDispose]();
    else lease?.release?.();
  }
}
