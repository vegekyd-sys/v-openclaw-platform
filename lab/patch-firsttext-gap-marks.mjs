// Adds [firsttext-gap.1] stage marks (see release-files/firsttext-gap-marks/firsttext-gap-marks.mjs)
// to V's agent-command and embedded-agent chunks, covering the Worker gap between
// worker-command-enter and prompt-prep-observer start. Marks only; no control-flow change.
function once(source, before, after, label) {
  if (source.split(before).length - 1 !== 1) throw new Error(`${label} anchor mismatch`);
  return source.replace(before, after);
}

export const GAP_MARKER = 'OPENCLAW_FIRSTTEXT_GAP_MARKS_V1';
const IMPORT = `import { firsttextGapMark } from "./firsttext-gap-marks.mjs"; // ${GAP_MARKER}\n`;
const COMMAND_IMPORT = `import { firsttextGapMark, firsttextSkillDetail, firsttextWatchSkillsBumps } from "./firsttext-gap-marks.mjs"; // ${GAP_MARKER}\n` +
  'import { i as firsttextRegisterSkillsChange } from "./refresh-state-DHnXO3IV.js";\n' +
  'firsttextWatchSkillsBumps(firsttextRegisterSkillsChange);\n';
// Round 3: sub-stages of prepareAgentCommandExecution (cmd-prepare-end held 1.7-2.2 s in some warm
// runs) and the skills snapshot resolve (about 1.2 s once per Worker), with why it rebuilt.
const PREPARE_MARKS = [
  ['\tconst cfg = await resolveAgentRuntimeConfig(runtime, {', 'getActiveSecretsRuntimeConfigSnapshot() ? "cmd-prep:secrets-warm" : "cmd-prep:secrets-cold"'],
  ['\tconst normalizedSpawned = normalizeSpawnedRunMetadata({', '"cmd-prep:config-resolved"'],
  ['\tconst { sessionId, sessionKey, sessionEntry: sessionEntryRaw, storePath, isNewSession, previousSessionId, persistedThinking, persistedVerbose } = resolveSession({', '"cmd-prep:recipient-resolved"'],
  ['\tconst harnessSessionError = sessionKey ? resolveAgentHarnessSessionContextError', '"cmd-prep:session-resolved"'],
  ['\tconst { getAcpSessionManager } = await loadAcpManagerRuntime();', '"cmd-prep:acp-start"'],
  ['\tconst modelManifestContext = { manifestPlugins: manifestMetadataSnapshot ?? [] };', 'preparedMetadataSnapshot ? "cmd-prep:plugin-metadata-prepared" : "cmd-prep:plugin-metadata-resolved"'],
  ['\tconst configuredThinkingRuntime = resolveEffectiveAgentRuntime({', '"cmd-prep:model-catalog"'],
  ['\tconst resolvedCwd = cwd ? resolveUserPath(cwd) : void 0;', '"cmd-prep:thinking"'],
  ['\tconst runLease = worktreeId ? await acquireWorktreeRunLease(worktreeId) : void 0;', '"cmd-prep:worktree-resolved"'],
  ['\t\tlet promptMessage = message;', '"cmd-prep:workspace-ensured"'],
  ['\t\tconst body = !isRawModelRun && acpResolution', '"cmd-prep:skill-commands"'],
];

export function patchAgentCommandChunk(source) {
  if (source.includes(GAP_MARKER)) throw new Error('already patched');
  source = once(source,
    'import { randomUUID } from "node:crypto";\n',
    'import { randomUUID } from "node:crypto";\n' + COMMAND_IMPORT,
    'imports');
  for (const [anchor, stage] of PREPARE_MARKS) {
    const indent = anchor.startsWith('\t\t') ? '\t\t' : '\t';
    source = once(source, anchor, `${indent}firsttextGapMark(${stage}, opts.runId);\n${anchor}`, `prepare ${stage}`);
  }
  source = once(source,
    '\tconst runLease = worktreeId ? await acquireWorktreeRunLease(worktreeId) : void 0;\n',
    '\tconst runLease = worktreeId ? await acquireWorktreeRunLease(worktreeId) : void 0;\n\tfirsttextGapMark("cmd-prep:run-lease", opts.runId);\n',
    'prepare run lease');
  source = once(source,
    '\tconst skillSnapshotState = resolveReusableWorkspaceSkillSnapshot({',
    '\tfirsttextGapMark("cmd-session-state:skills-resolve", params.runId);\n\tconst skillSnapshotState = resolveReusableWorkspaceSkillSnapshot({',
    'session state skills resolve');
  source = once(source,
    '\tconst executeIngress = () => withAgentRunLifecycleGeneration(lifecycleGeneration, async () => {\n\t\tlet preparedAgentDir;\n',
    '\tconst executeIngress = () => withAgentRunLifecycleGeneration(lifecycleGeneration, async () => {\n\t\tfirsttextGapMark("cmd-ingress-enter", opts.runId);\n\t\tlet preparedAgentDir;\n',
    'ingress enter');
  source = once(source,
    '\t\t\tprepare: async (preparedOpts) => await prepareAgentCommandExecution(preparedOpts, runtime, runtimeContext),\n',
    '\t\t\tprepare: async (preparedOpts) => {\n\t\t\t\tfirsttextGapMark("cmd-prepare-enter", opts.runId);\n\t\t\t\ttry {\n\t\t\t\t\treturn await prepareAgentCommandExecution(preparedOpts, runtime, runtimeContext);\n\t\t\t\t} finally {\n\t\t\t\t\tfirsttextGapMark("cmd-prepare-end", opts.runId);\n\t\t\t\t}\n\t\t\t},\n',
    'prepare');
  source = once(source,
    '\t\t\trun: async (prepared) => {\n\t\t\t\tpreparedAgentDir = prepared.agentDir;\n',
    '\t\t\trun: async (prepared) => {\n\t\t\t\tfirsttextGapMark("cmd-recovery-owner-claimed", opts.runId);\n\t\t\t\tpreparedAgentDir = prepared.agentDir;\n',
    'recovery owner run');
  source = once(source,
    '\t\tconst sessionStoreRuntime = storePath && sessionKey ? await loadSessionStoreRuntime() : void 0;\n\t\tsessionWorkAdmission = await beginSessionWorkAdmission({\n',
    '\t\tfirsttextGapMark("cmd-internal-enter", prepared.runId);\n\t\tconst sessionStoreRuntime = storePath && sessionKey ? await loadSessionStoreRuntime() : void 0;\n\t\tsessionWorkAdmission = await beginSessionWorkAdmission({\n',
    'session work admission begin');
  source = once(source,
    '\t\treturn await sessionWorkAdmission.run(async () => {\n\t\t\tpreparedRunAdmission = prepareAgentCommandExecutionIdentity({\n',
    '\t\tfirsttextGapMark("cmd-session-work-admission-begun", prepared.runId);\n\t\treturn await sessionWorkAdmission.run(async () => {\n\t\t\tfirsttextGapMark("cmd-session-work-admitted", prepared.runId);\n\t\t\tpreparedRunAdmission = prepareAgentCommandExecutionIdentity({\n',
    'session work admitted');
  source = once(source,
    '\t\t\tconst embeddedSessionState = await measureAgentStartup("session-state", () => prepareEmbeddedSessionState({\n',
    '\t\t\tfirsttextGapMark("cmd-session-state-enter", prepared.runId);\n\t\t\tconst embeddedSessionState = await measureAgentStartup("session-state", () => prepareEmbeddedSessionState({\n',
    'session state');
  source = once(source,
    '\t\t\tconst modelSelection = await measureAgentStartup("model-selection", () => resolveEmbeddedModelSelection({\n',
    '\t\t\tfirsttextGapMark("cmd-model-selection-enter", prepared.runId);\n\t\t\tconst modelSelection = await measureAgentStartup("model-selection", () => resolveEmbeddedModelSelection({\n',
    'model selection');
  source = once(source,
    '\t\t\tconst embeddedAttempt = await runEmbeddedAgentAttempt({\n',
    '\t\t\tfirsttextGapMark("cmd-embedded-attempt-enter", prepared.runId);\n\t\t\tconst embeddedAttempt = await runEmbeddedAgentAttempt({\n',
    'embedded attempt');
  source = once(source,
    '\tconst needsSkillsSnapshot = params.isNewSession',
    '\tfirsttextGapMark("cmd-session-state:skills-snapshot", params.runId, firsttextSkillDetail(params.isNewSession, currentSkillsSnapshot, skillSnapshotState));\n\tconst needsSkillsSnapshot = params.isNewSession',
    'session state skills');
  source = once(source,
    '\tconst shouldPersistInitialSessionTouch = ',
    '\tfirsttextGapMark("cmd-session-state:skills-persisted", params.runId);\n\tconst shouldPersistInitialSessionTouch = ',
    'session state skills persist');
  source = once(source,
    '\tif (params.sessionKey && !params.isSubagentLaneTurn) recordSessionHumanDirectMessage({',
    '\tfirsttextGapMark("cmd-session-state:touch-persisted", params.runId);\n\tif (params.sessionKey && !params.isSubagentLaneTurn) recordSessionHumanDirectMessage({',
    'session state touch persist');
  return source;
}

export function patchEmbeddedAgentChunk(source) {
  if (source.includes(GAP_MARKER)) throw new Error('already patched');
  source = once(source,
    'import { isContextOverflow } from "@openclaw/ai/internal/runtime";\n',
    'import { isContextOverflow } from "@openclaw/ai/internal/runtime";\n' + IMPORT,
    'imports');
  source = once(source,
    'async function runEmbeddedAgentInternal(paramsInput) {\n',
    'async function runEmbeddedAgentInternal(paramsInput) {\n\tfirsttextGapMark("emb-enter", paramsInput.runId);\n',
    'embedded enter');
  source = once(source,
    '\tlet params = withExecutionPhaseDiagnostics({\n\t\t...paramsBase,\n',
    '\tfirsttextGapMark("emb-session-target", paramsInput.runId);\n\tlet params = withExecutionPhaseDiagnostics({\n\t\t...paramsBase,\n',
    'session target');
  source = once(source,
    '\treturn enqueueSession(async () => {\n\t\tthrowIfAborted();\n\t\tif (!params.sessionManager || params.sessionManager.getSessionTarget()) {\n',
    '\tfirsttextGapMark("emb-session-lane-enqueue", params.runId);\n\treturn enqueueSession(async () => {\n\t\tfirsttextGapMark("emb-session-lane-admitted", params.runId);\n\t\tthrowIfAborted();\n\t\tif (!params.sessionManager || params.sessionManager.getSessionTarget()) {\n',
    'session lane');
  source = once(source,
    '\t\tthrowIfAborted();\n\t\treturn enqueueGlobal(async () => {\n\t\t\tthrowIfAborted();\n',
    '\t\tfirsttextGapMark("emb-deferred-maintenance-done", params.runId);\n\t\tthrowIfAborted();\n\t\treturn enqueueGlobal(async () => {\n\t\t\tfirsttextGapMark("emb-global-lane-admitted", params.runId);\n\t\t\tthrowIfAborted();\n',
    'global lane');
  // Every existing startup stage (workspace, harness-selection, prepared-runtime, runtime-context,
  // runtime-plugins, context-engine, attempt dispatch stages) also emits a gap mark.
  source = once(source,
    '\t\t\tconst startupStages = createEmbeddedRunStageTracker();\n',
    '\t\t\tconst startupStages = createEmbeddedRunStageTracker();\n' +
    '\t\t\t{\n\t\t\t\tconst markStartupStage = startupStages.mark;\n\t\t\t\tstartupStages.mark = (name) => {\n\t\t\t\t\tmarkStartupStage(name);\n\t\t\t\t\tfirsttextGapMark(`emb-stage:${name}`, params.runId);\n\t\t\t\t};\n\t\t\t}\n',
    'startup stages');
  return source;
}

export function patchBuiltinChunk(source) {
  if (source.includes(GAP_MARKER)) throw new Error('already patched');
  source = once(source,
    'import { setImmediate as setImmediate$1 } from "node:timers/promises";\n',
    'import { setImmediate as setImmediate$1 } from "node:timers/promises";\n' + IMPORT,
    'imports');
  source = once(source,
    '\tlet params = globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")]?.prepare(input) ?? input;\n',
    '\tlet params = globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")]?.prepare(input) ?? input;\n\tfirsttextGapMark("att-enter", params.runId);\n',
    'attempt enter');
  // Each attempt preparation stage: queued (behind the process-wide stage chain), started, ended.
  source = once(source,
    '\treturn async (stage, run) => {\n\t\tconst start = nextPreparationStart.then(() => setImmediate$1());\n\t\tnextPreparationStart = start;\n\t\tawait start;\n\t\toptions.assertCurrent();\n\t\treturn measureEmbeddedAgentPreparation(stage, run, { config: options.config });\n\t};\n',
    '\treturn async (stage, run) => {\n\t\tfirsttextGapMark(`att-queued:${stage}`, options.runId);\n\t\tconst start = nextPreparationStart.then(() => setImmediate$1());\n\t\tnextPreparationStart = start;\n\t\tawait start;\n\t\toptions.assertCurrent();\n\t\tfirsttextGapMark(`att-start:${stage}`, options.runId);\n\t\ttry {\n\t\t\treturn await measureEmbeddedAgentPreparation(stage, run, { config: options.config });\n\t\t} finally {\n\t\t\tfirsttextGapMark(`att-end:${stage}`, options.runId);\n\t\t}\n\t};\n',
    'attempt preparation');
  source = once(source,
    '\tconst prepare = createEmbeddedAttemptPreparation({\n\t\tconfig: params.config,\n',
    '\tconst prepare = createEmbeddedAttemptPreparation({\n\t\trunId: params.runId,\n\t\tconfig: params.config,\n',
    'attempt preparation runId');
  source = once(source,
    '\t\tconst corePluginToolStages = createEmbeddedRunStageTracker();\n',
    '\t\tconst corePluginToolStages = createEmbeddedRunStageTracker();\n' +
    '\t\t{\n\t\t\tconst markCorePluginToolStage = corePluginToolStages.mark;\n\t\t\tcorePluginToolStages.mark = (name) => {\n\t\t\t\tmarkCorePluginToolStage(name);\n\t\t\t\tfirsttextGapMark(`att-tool:${name}`, params.runId);\n\t\t\t};\n\t\t}\n',
    'core plugin tool stages');
  return source;
}

// Agent DB process writer lease: log waits and holds of 20 ms or more, in every process.
export function patchCoordinator(source) {
  if (source.includes(GAP_MARKER)) throw new Error('already patched');
  source = once(source,
    "import {AsyncLocalStorage} from 'node:async_hooks';\n",
    "import {AsyncLocalStorage} from 'node:async_hooks';\n" +
    `// ${GAP_MARKER}: [firsttext-lease.1] lines (pid, mode, wait, hold, short caller chain; no data).\n` +
    "function firsttextLeaseLog(mode, waitMs, holdMs, attempts) {\n" +
    "  try {\n" +
    "    if (process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES !== '1' || process.env.OPENCLAW_FIRSTTEXT_GAP_MARKS === '0') return;\n" +
    "    if (waitMs < 20 && holdMs < 20) return;\n" +
    "    const callers = String(new Error().stack ?? '').split('\\n').slice(2, 10)\n" +
    "      .map(line => /at (?:async )?([A-Za-z0-9_$.<>]+) /.exec(line)?.[1]).filter(Boolean).slice(0, 6);\n" +
    "    console.error('[firsttext-lease.1] ' + JSON.stringify({v: 1, mode, pid: process.pid, atMs: Date.now(), waitMs, holdMs, attempts, callers}));\n" +
    "  } catch { /* Observation must not alter runtime control flow. */ }\n" +
    "}\n",
    'imports');
  source = once(source,
    "  const waitMs = Math.max(0, now() - startedAt);\n  params.onAcquired?.({attempts: attempt + 1, coordinatorPath, waitMs});\n  let operationError;\n  try {\n    return await runWithHeldLease(params.databasePath, suffix, params.fn);\n  } catch (error) {\n    operationError = error;\n    throw error;\n  } finally {\n",
    "  const waitMs = Math.max(0, now() - startedAt);\n  params.onAcquired?.({attempts: attempt + 1, coordinatorPath, waitMs});\n  const firsttextHeldAt = Date.now();\n  let operationError;\n  try {\n    return await runWithHeldLease(params.databasePath, suffix, params.fn);\n  } catch (error) {\n    operationError = error;\n    throw error;\n  } finally {\n    firsttextLeaseLog('async', waitMs, Date.now() - firsttextHeldAt, attempt + 1);\n",
    'async lease');
  source = once(source,
    "  params.onAcquired?.({attempts: attempt + 1, coordinatorPath, waitMs: Math.max(0, now() - startedAt)});\n  let operationError;\n  try {\n    return runWithHeldLease(params.databasePath, suffix, params.fn);\n  } catch (error) {\n    operationError = error;\n    throw error;\n  } finally {\n",
    "  const firsttextWaitMs = Math.max(0, now() - startedAt);\n  params.onAcquired?.({attempts: attempt + 1, coordinatorPath, waitMs: firsttextWaitMs});\n  const firsttextHeldAt = Date.now();\n  let operationError;\n  try {\n    return runWithHeldLease(params.databasePath, suffix, params.fn);\n  } catch (error) {\n    operationError = error;\n    throw error;\n  } finally {\n    firsttextLeaseLog('sync', firsttextWaitMs, Date.now() - firsttextHeldAt, attempt + 1);\n",
    'sync lease');
  return source;
}
