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
      { abortSignal: signal, catalogMode: "static" },
    );
    if (typeof commandRuntime.prewarmAgentCommandRuntimes !== "function") {
      throw new Error("OpenClaw Agent command runtime prewarm is unavailable");
    }
    const commandPreparation =
      await commandRuntime.prewarmAgentCommandRuntimes({
        config,
        agentId,
        workspaceDir,
        pluginMetadataSnapshot:
          lease.pluginGeneration?.pluginMetadataSnapshot,
      });
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
    lease?.release();
  }
}
