// Adds [firsttext-gap.1] stage marks (see release-files/firsttext-gap-marks/firsttext-gap-marks.mjs)
// to V's agent-command and embedded-agent chunks, covering the Worker gap between
// worker-command-enter and prompt-prep-observer start. Marks only; no control-flow change.
function once(source, before, after, label) {
  if (source.split(before).length - 1 !== 1) throw new Error(`${label} anchor mismatch`);
  return source.replace(before, after);
}

export const GAP_MARKER = 'OPENCLAW_FIRSTTEXT_GAP_MARKS_V1';
const IMPORT = `import { firsttextGapMark } from "./firsttext-gap-marks.mjs"; // ${GAP_MARKER}\n`;

export function patchAgentCommandChunk(source) {
  if (source.includes(GAP_MARKER)) throw new Error('already patched');
  source = once(source,
    'import { randomUUID } from "node:crypto";\n',
    'import { randomUUID } from "node:crypto";\n' + IMPORT,
    'imports');
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
