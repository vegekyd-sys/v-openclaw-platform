import assert from 'node:assert/strict';

// Worker first-turn preparation before `ready`, on V's 2026.9.1 db91.6 bytes.
//
// V keeps minWorkers=5 resident, but a resident Worker is only a booted process: the
// first turn it serves still pays the one-time preparation. Production V 2026-10-05
// 11:06 (first-token-regression-20261005): two Workers idle since the 10:40 restart took
// 4.0 s acquiring the prepared model runtime, then 4.1 s from command entry to bundle
// preparation (the Agent command chunk's fourteen lazy module loaders), first text at
// 13.3-13.5 s after entering the Worker; Workers that had served one turn needed
// 1.6-3.2 s. Workers turn cold after every restart, every memory recycle and every scale-up.
//
// The 2026-09-12 VLab candidates (docs/worker-runtime-readiness-20260912.md,
// docs/worker-command-readiness-20260912.md) did this preparation before readiness but
// were never accepted or shipped; V moved to the db91 release bytes. This ports the same
// two steps onto the bytes V runs today:
//   1. the Worker acquires and releases the same static prepared-model lease a turn takes;
//   2. the Agent command chunk exposes prewarmAgentCommandRuntimes(), which imports its
//      existing lazy runtimes, opens the process's agent database and resolves one session
//      read-only through it; the Worker calls it through the semantic facade. Until a
//      process has its agent database open, every read-only lookup opens a fresh handle
//      and repeats the canonical session-key scan over all sessions (two scans, 2.9 s over
//      3742 sessions on VLab, inside a Worker's first turn); after this, reads reuse the
//      open handle and the scan has run once.
// No session is opened, no transcript written, no model or tool called. On by default,
// OPENCLAW_WORKER_EAGER_PREPARE=0 turns it off; bounded (default 60 s, 1-180 s); any
// failure reports `deferred-to-normal-turn` and the Worker is ready exactly as before.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const COMMAND_PREWARM = `/** Prepare what the first embedded Agent attempt in this process would otherwise pay for:
 * import every lazy runtime, and (given a config and agent) resolve one session read-only,
 * which opens the agent database and runs its one-time canonical session-key scan for this
 * process. Nothing is written: no session created, no model invoked, no tool run, no
 * transcript touched. A Worker calls this before reporting ready. */
async function prewarmAgentCommandRuntimes(params) {
	await Promise.all([
		loadAttemptExecutionRuntime(),
		loadAcpManagerRuntime(),
		loadAcpPolicyRuntime(),
		loadAcpRuntimeErrorsRuntime(),
		loadAcpSessionIdentifiersRuntime(),
		loadDeliveryRuntime(),
		loadSessionStoreRuntime(),
		loadCliCompactionRuntime(),
		loadAgentRunnerMemoryRuntime(),
		loadTranscriptResolveRuntime(),
		loadTranscriptAppendRuntime(),
		cliDepsRuntimeLoader.load(),
		loadExecDefaultsRuntime(),
		loadSkillsRuntime()
	]);
	if (!params?.config || !params.agentId) return { sessionStorePrepared: false };
	// Open this process's agent database the way a turn's first write does, so the
	// read-only lookups below and in later turns reuse it: on a fresh read-only handle the
	// canonical session-key scan runs again on every read.
	openOpenClawAgentDatabase({ agentId: normalizeAgentId(params.agentId) });
	resolveSession({
		cfg: params.config,
		sessionKey: \`agent:\${normalizeAgentId(params.agentId)}:main\`,
		agentId: params.agentId
	});
	return { sessionStorePrepared: true };
}
`;

export function patchAgentCommandChunk(source) {
  let out = replaceExactlyOnce(
    source,
    'import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";\n',
    'import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";\nimport { g as openOpenClawAgentDatabase } from "./openclaw-agent-db-CUTe8BX6.js";\n',
    'agent id import',
  );
  out = replaceExactlyOnce(
    out,
    'async function resolveAgentCommandDeps(deps) {\n',
    `${COMMAND_PREWARM}async function resolveAgentCommandDeps(deps) {\n`,
    'command deps resolver',
  );
  out = replaceExactlyOnce(
    out,
    'export { agentCommandFromSystem as i, agentCommandFromGatewayIngress as n, agentCommandFromIngress as r, agentCommand as t };',
    'export { agentCommandFromSystem as i, agentCommandFromGatewayIngress as n, prewarmAgentCommandRuntimes, agentCommandFromIngress as r, agentCommand as t };',
    'command chunk exports',
  );
  return out;
}

export function patchAgentCommandFacade(source) {
  let out = replaceExactlyOnce(
    source,
    'import { i as agentCommandFromSystem, n as agentCommandFromGatewayIngress, r as agentCommandFromIngress, t as agentCommand } from "./agent-command-DPfawBbr.js";',
    'import { i as agentCommandFromSystem, n as agentCommandFromGatewayIngress, prewarmAgentCommandRuntimes, r as agentCommandFromIngress, t as agentCommand } from "./agent-command-DPfawBbr.js";',
    'facade import',
  );
  out = replaceExactlyOnce(
    out,
    'export { agentCommand, agentCommandFromGatewayIngress, agentCommandFromIngress, agentCommandFromSystem };',
    'export { agentCommand, agentCommandFromGatewayIngress, agentCommandFromIngress, agentCommandFromSystem, prewarmAgentCommandRuntimes };',
    'facade export',
  );
  return out;
}

const WORKER_PREWARM = `// Prepare the first turn before reporting ready (worker-prewarm-v). A resident Worker is
// otherwise only a booted process and its first turn pays the prepared model runtime and
// the Agent command imports. Preparation only: no session, transcript, model or tool.
let runtimePrewarm = { status: "disabled" };
if (process.env.OPENCLAW_WORKER_EAGER_PREPARE !== "0") {
  const configuredTimeoutMs = Number(process.env.OPENCLAW_WORKER_EAGER_PREPARE_TIMEOUT_MS ?? 60_000);
  const timeoutMs = Number.isFinite(configuredTimeoutMs)
    ? Math.min(180_000, Math.max(1_000, configuredTimeoutMs))
    : 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const started = performance.now();
  let lease;
  try {
    const agentRuntime = await loadAgentRuntime();
    const { configRuntime, commandRuntime, preparedRuntime } = await loadCompactionRuntime();
    const config = configRuntime.loadConfig();
    const agentId = process.env.OPENCLAW_WORKER_EAGER_PREPARE_AGENT || "makaron";
    const workspaceDir = agentRuntime.resolveAgentWorkspaceDir(config, agentId);
    lease = await preparedRuntime.acquireAgentRunPreparedModelRuntime(
      {
        config,
        agentId,
        agentDir: agentRuntime.resolveAgentDir(config, agentId),
        allowGatewaySubagentBinding: true,
        workspaceDir,
      },
      { abortSignal: controller.signal, catalogMode: "static" },
    );
    const preparedMs = Math.round(performance.now() - started);
    const command = typeof commandRuntime.prewarmAgentCommandRuntimes === "function"
      ? await commandRuntime.prewarmAgentCommandRuntimes({ config, agentId })
      : undefined;
    runtimePrewarm = {
      status: "ready",
      ms: Math.round(performance.now() - started),
      preparedMs,
      commandModules: command ? "loaded" : "unavailable",
      sessionStorePrepared: command?.sessionStorePrepared === true,
    };
  } catch (error) {
    runtimePrewarm = {
      status: "deferred-to-normal-turn",
      errorCategory: error?.name === "AbortError" || controller.signal.aborted ? "abort" : "other",
      error: String(error?.message ?? error).slice(0, 200),
      ms: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
    try { lease?.release(); } catch {}
  }
  process.stderr.write(\`[worker-runtime-prewarm.3] \${JSON.stringify({ pid: process.pid, ...runtimePrewarm })}\\n\`);
}

process.send?.({
  type: "ready",
  gatewayOwnedToolProxy: gatewayOwnedToolProxy.status(),
  pid: process.pid,
  memory: memoryReport(),
  sessionHotset: getSessionHotsetStatus(),
  skillUsageTelemetry: { ...skillUsageTelemetryStats },
  runtimePrewarm,
});`;

export function patchWorker(source) {
  return replaceExactlyOnce(
    source,
    `process.send?.({
  type: "ready",
  gatewayOwnedToolProxy: gatewayOwnedToolProxy.status(),
  pid: process.pid,
  memory: memoryReport(),
  sessionHotset: getSessionHotsetStatus(),
  skillUsageTelemetry: { ...skillUsageTelemetryStats },
});`,
    WORKER_PREWARM,
    'worker ready message',
  );
}
