import assert from 'node:assert/strict';
import { HEAD_HELPER, HEAD_MARKER } from './run-start-phases.mjs';

// run-start-phases-v1 (see lab/run-start-phases.mjs). Three V chunks, all logging only:
//   core get-reply      a head starts at getReplyFromConfig entry and rides on the reply options (opts.vRunHead,
//                       the same way opts.vInterSession already does); every traceGetReplyPhase is marked
//   core agent-runner   runReplyAgent entry, every traceAgentPhase, the run id bound to the head, turn media,
//                       the model-fallback start, the embedded run call; onAgentRunStart closes the head and logs
//                       the [run-start-phases.1] line
//   codex run-attempt   every stage of runCodexAppServerAttempt before startCodexAttemptRuntime. That function first
//                       emits the codex_app_server.lifecycle startup event, and agent-runner takes any agent event as
//                       the run start (onAgentRunStart), so the later stages fall outside dispatch -> run start
// A run without a head (heartbeats, follow-up drains, workboard and cron runs) marks nothing and logs nothing.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function withHeadHelper(source) {
  assert(!source.includes(HEAD_MARKER), `already carries ${HEAD_MARKER}`);
  const at = source.indexOf('\n//#region');
  assert(at > 0, 'no //#region to insert the helper before');
  return `${source.slice(0, at + 1)}${HEAD_HELPER}${source.slice(at + 1)}`;
}

const tracedPhase = (tracer, configExpr, headExpr) => ({
  before: `\tconst ${tracer} = (name, run) => ${tracer === 'traceGetReplyPhase' ? 'resolverTiming.measure(name, () => ' : ''}measureDiagnosticsTimelineSpan(name, run, {\n\t\tphase: "agent-turn",\n\t\tconfig: ${configExpr},\n\t\tattributes: traceAttributes\n\t})${tracer === 'traceGetReplyPhase' ? ')' : ''};\n`,
  after: `\tconst ${tracer} = (name, run) => {
\t\t__vRunHead().mark(${headExpr}, ">" + name); // V ${HEAD_MARKER}
\t\treturn ${tracer === 'traceGetReplyPhase' ? 'resolverTiming.measure(name, () => ' : ''}measureDiagnosticsTimelineSpan(name, async () => {
\t\t\ttry {
\t\t\t\treturn await run();
\t\t\t} finally {
\t\t\t\t__vRunHead().mark(${headExpr}, name);
\t\t\t}
\t\t}, {
\t\t\tphase: "agent-turn",
\t\t\tconfig: ${configExpr},
\t\t\tattributes: traceAttributes
\t\t})${tracer === 'traceGetReplyPhase' ? ')' : ''};
\t};
`,
});

export function patchGetReply(source) {
  let out = withHeadHelper(source);
  out = replaceExactlyOnce(out, 'async function getReplyFromConfig(ctx, opts, configOverride) {\n',
    `async function getReplyFromConfig(ctx, opts, configOverride) {
\tconst vRunHead = opts && typeof opts === "object" && opts.isHeartbeat !== true ? __vRunHead().begin() : void 0; // V ${HEAD_MARKER}
\tif (vRunHead) opts.vRunHead = vRunHead;
`, 'getReplyFromConfig entry');
  const traced = tracedPhase('traceGetReplyPhase', 'cfg', 'vRunHead');
  out = replaceExactlyOnce(out, traced.before, traced.after, 'traceGetReplyPhase');
  return out;
}

export function patchAgentRunner(source) {
  let out = withHeadHelper(source);
  out = replaceExactlyOnce(out, '\tconst turnAdoptionLifecycle = opts?.turnAdoptionLifecycle;\n\tconst releaseAdmissionTicket',
    `\t__vRunHead().mark(opts?.vRunHead, "run-reply-agent"); // V ${HEAD_MARKER}
\tconst turnAdoptionLifecycle = opts?.turnAdoptionLifecycle;
\tconst releaseAdmissionTicket`, 'runReplyAgent entry');
  const traced = tracedPhase('traceAgentPhase', 'followupRun.run.config', 'opts?.vRunHead');
  out = replaceExactlyOnce(out, traced.before, traced.after, 'traceAgentPhase');
  out = replaceExactlyOnce(out, '\tconst runId = params.opts?.runId ?? crypto.randomUUID();\n\tconst agentTurnTiming = createAgentTurnTimingTracker(',
    `\tconst runId = params.opts?.runId ?? crypto.randomUUID();
\t__vRunHead().bind(params.opts?.vRunHead, runId); // V ${HEAD_MARKER}
\t__vRunHead().markRun(runId, "agent-turn");
\tconst agentTurnTiming = createAgentTurnTimingTracker(`, 'agent turn run id');
  out = replaceExactlyOnce(out, '\t} catch (error) {\n\t\tclearAgentRunContext(runId, lifecycleGeneration);\n\t\tthrow error;\n\t}\n\tlet didNotifyAgentRunStart = false;\n',
    `\t} catch (error) {
\t\tclearAgentRunContext(runId, lifecycleGeneration);
\t\tthrow error;
\t}
\t__vRunHead().markRun(runId, "turn-media"); // V ${HEAD_MARKER}
\tlet didNotifyAgentRunStart = false;
`, 'turn media end');
  out = replaceExactlyOnce(out, '\tconst notifyAgentRunStart = () => {\n\t\tif (didNotifyAgentRunStart) return;\n\t\tdidNotifyAgentRunStart = true;\n',
    `\tconst notifyAgentRunStart = () => {
\t\tif (didNotifyAgentRunStart) return;
\t\tdidNotifyAgentRunStart = true;
\t\ttry {
\t\t\tconst vHead = __vRunHead().finish(runId); // V ${HEAD_MARKER}
\t\t\tif (vHead) agentTurnTimingLog.info(\`[run-start-phases.1] \${JSON.stringify(vHead)}\`);
\t\t} catch {}
`, 'notifyAgentRunStart');
  out = replaceExactlyOnce(out, '\t\tmilestone: "before_model_fallback"\n\t});\n',
    `\t\tmilestone: "before_model_fallback"\n\t});\n\t__vRunHead().markRun(params.runId, "fallback-start"); // V ${HEAD_MARKER}\n`, 'model fallback start');
  out = replaceExactlyOnce(out, '\t\t\treturn runEmbeddedAgent(embeddedRunParams);\n',
    `\t\t\t__vRunHead().markRun(params.runId, "embedded-call"); // V ${HEAD_MARKER}\n\t\t\treturn runEmbeddedAgent(embeddedRunParams);\n`, 'embedded run call');
  return out;
}

const CODEX_HEAD_BEFORE = `async function runCodexAppServerAttempt(params, options) {
\tconst connection = await prepareCodexAttemptConnection({
\t\tparams,
\t\toptions
\t});
\tconst runtime = await prepareCodexAttemptRuntime(connection);
\tconst attemptTools = await prepareCodexAttemptTools(runtime);
\tconst resources = prepareCodexAttemptResources(await prepareCodexAttemptPrompt(await prepareCodexAttemptContext(runtime, attemptTools)));
\tattemptTools.runtimeYieldCompletionClaim.current = () => resources.state.nativeHookRelay?.hasClaimedDirectChild() ?? false;
\tawait startCodexAttemptRuntime(resources);
`;

export function patchCodexRunAttempt(source) {
  let out = withHeadHelper(source);
  out = replaceExactlyOnce(out, CODEX_HEAD_BEFORE, `async function runCodexAppServerAttempt(params, options) {
\tconst vHeadRunId = params?.runId; // V ${HEAD_MARKER}
\t__vRunHead().markRun(vHeadRunId, "codex-enter");
\tconst connection = await prepareCodexAttemptConnection({
\t\tparams,
\t\toptions
\t});
\t__vRunHead().markRun(vHeadRunId, "codex-connection");
\tconst runtime = await prepareCodexAttemptRuntime(connection);
\t__vRunHead().markRun(vHeadRunId, "codex-runtime");
\tconst attemptTools = await prepareCodexAttemptTools(runtime);
\t__vRunHead().markRun(vHeadRunId, "codex-tools");
\tconst vHeadContext = await prepareCodexAttemptContext(runtime, attemptTools);
\t__vRunHead().markRun(vHeadRunId, "codex-context");
\tconst resources = prepareCodexAttemptResources(await prepareCodexAttemptPrompt(vHeadContext));
\t__vRunHead().markRun(vHeadRunId, "codex-prompt");
\tattemptTools.runtimeYieldCompletionClaim.current = () => resources.state.nativeHookRelay?.hasClaimedDirectChild() ?? false;
\tawait startCodexAttemptRuntime(resources);
`, 'codex attempt head');
  return out;
}
