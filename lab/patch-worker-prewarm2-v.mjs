import assert from 'node:assert/strict';

// Worker first-turn preparation, second step (worker-prewarm2-v), on top of the
// worker-prewarm-v release bytes V runs today.
//
// worker-prewarm-v (#198) moved the prepared model runtime and the Agent command chunk's
// lazy loaders before `ready`. A Worker's first turn still costs about six times a warm
// one: VLab candidate 2026-10-06 (1 Worker, V-sized session metadata, closed model port),
// worker-command-enter -> model-call-enter cold 2.57-2.72 s vs warm 0.38-0.45 s. The cold
// CPU profile of that window: the workspace skill snapshot built from scratch (~250 ms
// under resolveReusableWorkspaceSkillSnapshot -> cachedRebuild -> loadSkillEntries), first
// imports (~190 ms under getModuleJobForImport; 192 scripts first parsed in the window,
// none in warm turns: the secrets runtime, ACP workspace provisioning, auth profiles, the
// bundle MCP runtime with the MCP SDK, ajv and zod, and memory-core's lazy modules), tool
// construction (~150 ms) and the prepared model runtime snapshot (~170 ms).
//
// This adds, to the same bounded, fail-open, write-free preparation:
//   1. the workspace skill snapshot, built through resolveReusableWorkspaceSkillSnapshot
//      with the inputs prepareEmbeddedSessionState derives for a session without its own
//      skill state (workspace, execution skills dir, effective skill filter, node and
//      remote eligibility, config), so the turn's cachedRebuild finds the process cache
//      entry instead of loading every skill again. Nothing is persisted: the snapshot only
//      lives in the process cache, the same place a turn puts it. The cache key does not
//      include the plugin metadata snapshot (a turn uses its lease's), so the Worker passes
//      the metadata of the lease it holds during preparation;
//   2. the modules a first turn imports between command entry and the model call, each
//      imported on its own so a missing one never fails the rest.
// Not done here, on purpose:
//   - tool construction: createOpenClawCodingTools takes the turn's run id, session key,
//     abort signal and delivery context and registers per-run cleanups and MCP/plugin tool
//     factories; building it without a run would either need a fake run context or start
//     process-global resources early. Its first imports are covered by (2).
//   - the prepared model runtime snapshot: a warm turn rebuilds it too (buildSnapshotBatch
//     ~56 ms per warm turn), so a prewarm build is not reused; keeping it would mean holding
//     a lease across turns, which pins a generation. Separate change.
// OPENCLAW_WORKER_EAGER_PREPARE=0 still turns all preparation off;
// OPENCLAW_WORKER_EAGER_PREPARE_SKILLS=0 turns off only the steps added here.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// dist-relative modules a cold first turn parses between worker-command-enter and the
// model call (VLab candidate-97b373de, Debugger.scriptParsed); their dependencies follow
export const FIRST_TURN_MODULES = [
  './runtime-BA_TxOCt.js',
  './acp-workspace-provisioning-BeD_7yxe.js',
  './agents/auth-profiles.runtime.js',
  './agents/agent-bundle-mcp-runtime.js',
  './runtime-provider-DmF-o7D_.js',
  './standing-intents-yez9uPGn.js',
  './workspace-path-classifier-CPYVZ-qj.js',
  './dreaming-state-C8InVCcK.js',
  './extensions/memory-core/manager-runtime.js',
];

const SESSION_STORE_PREPARED = `	return { sessionStorePrepared: true };
}
async function resolveAgentCommandDeps(deps) {`;

const FIRST_TURN_PREWARM = `	if (process.env.OPENCLAW_WORKER_EAGER_PREPARE_SKILLS === "0") return { sessionStorePrepared: true };
	return {
		sessionStorePrepared: true,
		...prewarmWorkspaceSkillSnapshot(params, skillsRuntime, execDefaultsRuntime),
		...await prewarmFirstTurnModules()
	};
}
/** Build the workspace skill snapshot a turn of a session without its own skill state
 * resolves in prepareEmbeddedSessionState, so that turn's cachedRebuild hits the process
 * cache. Nothing is persisted. */
function prewarmWorkspaceSkillSnapshot(params, { getRemoteSkillEligibility, resolveReusableWorkspaceSkillSnapshot }, { resolveNodeExecEligibility }) {
	try {
		const cfg = params.config;
		const agentId = normalizeAgentId(params.agentId);
		const sessionKey = params.sessionKey ?? \`agent:\${agentId}:feishu:group:worker-prewarm\`;
		const workspaceDir = resolveUserPath(resolveAgentWorkspaceDir(cfg, agentId));
		const cwd = resolveAgentRunCwd(cfg, agentId);
		const pluginsEnabled = cfg.plugins?.enabled !== false;
		const pluginMetadataSnapshot = pluginsEnabled ? params.pluginMetadataSnapshot ?? resolvePluginMetadataSnapshot({
			config: cfg,
			env: process.env,
			workspaceDir
		}) : void 0;
		const nodeSkillsEligibility = resolveNodeExecEligibility({
			cfg,
			sessionEntry: void 0,
			sessionKey,
			agentId
		});
		const state = resolveReusableWorkspaceSkillSnapshot({
			workspaceDir,
			executionSkillsDir: path.join(cwd ?? workspaceDir, "skills"),
			config: cfg,
			agentId,
			existingSnapshot: void 0,
			librarySelections: void 0,
			skillFilter: resolveEffectiveAgentSkillFilter(cfg, agentId),
			eligibility: {
				nodeSkills: nodeSkillsEligibility,
				remote: getRemoteSkillEligibility({ advertiseExecNode: nodeSkillsEligibility.canExec })
			},
			watch: false,
			...pluginMetadataSnapshot ? { pluginMetadataSnapshot } : {}
		});
		return { skillSnapshotPrepared: Boolean(state.snapshot) };
	} catch (error) {
		return { skillSnapshotPrepared: false, skillSnapshotError: String(error?.message ?? error).slice(0, 200) };
	}
}
/** Import the modules a first turn would import between command entry and the model call. */
async function prewarmFirstTurnModules() {
	const results = await Promise.allSettled([
${'%MODULES%'}
	]);
	return { firstTurnModules: \`\${results.filter((r) => r.status === "fulfilled").length}/\${results.length}\` };
}
async function resolveAgentCommandDeps(deps) {`;

export function patchAgentCommandChunk(source) {
  let out = replaceExactlyOnce(
    source,
    `		loadExecDefaultsRuntime(),
		loadSkillsRuntime()
	]);
	if (!params?.config || !params.agentId) return { sessionStorePrepared: false };`,
    `		loadExecDefaultsRuntime(),
		loadSkillsRuntime()
	]);
	const execDefaultsRuntime = await loadExecDefaultsRuntime();
	const skillsRuntime = await loadSkillsRuntime();
	if (!params?.config || !params.agentId) return { sessionStorePrepared: false };`,
    'prewarm loader list',
  );
  out = replaceExactlyOnce(
    out,
    SESSION_STORE_PREPARED,
    FIRST_TURN_PREWARM.replace('%MODULES%', FIRST_TURN_MODULES.map((m) => `\t\timport(${JSON.stringify(m)})`).join(',\n')),
    'session store prewarm return',
  );
  return out;
}

export function patchWorker(source) {
  let out = replaceExactlyOnce(
    source,
    `      ? await commandRuntime.prewarmAgentCommandRuntimes({ config, agentId })`,
    `      ? await commandRuntime.prewarmAgentCommandRuntimes({
        config,
        agentId,
        pluginMetadataSnapshot: lease?.pluginGeneration?.pluginMetadataSnapshot,
      })`,
    'worker command prewarm call',
  );
  out = replaceExactlyOnce(
    out,
    `      sessionStorePrepared: command?.sessionStorePrepared === true,
`,
    `      sessionStorePrepared: command?.sessionStorePrepared === true,
      skillSnapshotPrepared: command?.skillSnapshotPrepared === true,
      ...(command?.skillSnapshotError ? { skillSnapshotError: command.skillSnapshotError } : {}),
      ...(command?.firstTurnModules ? { firstTurnModules: command.firstTurnModules } : {}),
`,
    'worker prewarm report',
  );
  return out;
}
