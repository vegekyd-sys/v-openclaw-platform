import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGptLiveVoiceExecLifetime } from "./gpt-live-voice-exec-lifetime.mjs";
import * as execPatch from "./patch-gpt-live-voice-exec-lifetime.mjs";
import * as patch from "./patch-gpt-live-voice-tool-order.mjs";

const read = name => readFileSync(new URL(name, import.meta.url), "utf8");
const hash = source => createHash("sha256").update(source).digest("hex");
const builtinBefore = read("fixtures/gpt-live-voice-tool-order/builtin-openclaw-zQV8Wwjr.js");
const sdkBefore = read("fixtures/gpt-live-voice-tool-order/agent-core-BxgCPa8O.js");
assert.equal(hash(builtinBefore), patch.GPT_LIVE_TOOL_ORDER_BUILTIN_BEFORE);
assert.equal(hash(sdkBefore), patch.GPT_LIVE_TOOL_ORDER_AGENT_CORE_BEFORE);
const builtinSource = patch.patchGptLiveVoiceToolOrderBuiltin(builtinBefore);
const workerRoot = "../release/captured/v2026.9.1-db91.6-memory-search-weighted-20261002.worker/dist/";
const hotreloadRoot = "../release/captured/v2026.9.1-db91.6-hotreload-feishu-approvals-20261003.worker/dist/";
const bridgeSource = patch.patchGptLiveVoiceToolOrderNativeAttemptBridge(
  execPatch.patchGptLiveVoiceExecNativeAttemptBridge(read(workerRoot + "native-attempt-bridge.mjs")));
const poolSource = patch.patchGptLiveVoiceToolOrderWorkerPool(
  execPatch.patchGptLiveVoiceExecWorkerPool(read(hotreloadRoot + "worker-pool.mjs")));
const indexSource = patch.patchGptLiveVoiceToolOrderGatewayIndex(read(hotreloadRoot + "index.mjs"));
const segment = (source, from, until) => {
  const start = source.indexOf(from), end = source.indexOf(until, start);
  assert(start >= 0 && end > start, `actual source boundary ${from}`);
  return source.slice(start, end);
};
const evaluate = (source, deps, expression) => new Function("deps", `with (deps) { ${source}; return ${expression}; }`)(deps);
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Actual captured SDK batch scheduler, lifecycle/result functions, Agent
// constructor and createLoopConfig. Only imported validation/metadata/runtime
// dependencies are supplied; no scheduler or tool outcome is reimplemented.
function loadActualSdk() {
  const syncGetters = new WeakMap();
  const deps = {
    getInternalSyncSteeringGetter: callback => syncGetters.get(callback),
    attachInternalSyncSteeringGetter: (callback, getter) => { syncGetters.set(callback, getter); return callback; },
    getInternalBeforeToolBatch: () => undefined,
    getInternalToolExecutionPreparer: () => undefined,
    runWithAgentToolExecutionContext: (_context, run) => run(),
    resolveAgentCoreStreamFn: () => undefined,
    resolveAgentReasoningOption: () => undefined,
    validateToolArguments: (_tool, call) => call.arguments,
    copyInternalToolResultState: (_original, result) => result,
    coerceErrorMessage: error => error instanceof Error ? error.message : String(error),
  };
  const loop = segment(sdkBefore, 'const TOOL_LOOP_RECOVERY_TERMINATED_MESSAGE =', '//#endregion');
  const agent = segment(sdkBefore, 'function defaultConvertToLlm(messages)', '//#endregion');
  return evaluate(loop + "\n" + agent, deps, "({ Agent: Agent$1, executeToolCalls })");
}
const sdk = loadActualSdk();

function gatewayAdmission({ voice = true } = {}) {
  const signal = new AbortController(); let active = true;
  const instance = { runId: "unprefixed-original-run", instanceId: "actual-admission" };
  const context = { operationalRunInstance: instance };
  const authority = { operationalRunInstance: instance };
  const authorities = new WeakMap([[context, authority]]);
  const attempt = { runId: instance.runId, agentId: "actor", sessionId: "canonical-session",
    sessionKey: "agent:actor:private-session", abortSignal: signal.signal, admittedRunContext: context };
  const assertActive = () => { if (!active || signal.signal.aborted) throw new Error("actual source retired"); };
  const lifetime = createGptLiveVoiceExecLifetime(() => voice ? {
    assertCurrent: assertActive, signal: signal.signal,
  } : undefined, { getAuthority: value => authorities.get(value) });
  // The existing generated host getter uses this exact sourceFor authority.
  const hostCapabilities = { assertActive,
    vlabHasVoiceExecLifetime: () => lifetime.hasSource({ attempt, operationalRunInstance: instance, assertActive }) };
  const arrow = segment(indexSource, "authorizeNativeVoiceToolOrder: () => {", "                },").slice("authorizeNativeVoiceToolOrder: ".length);
  const authorize = evaluate("", { params: { hostCapabilities } }, `(${arrow}})`);
  return { authorize, attempt, instance, context, signal, setActive: value => { active = value; } };
}

async function actualPoolAdmission(request, options = {}) {
  const submit = segment(poolSource, "  async submit(sessionKey, request, options = {}) {", "  async dispatch(")
    .replace("  async submit(", "async function submit(");
  const makeSubmit = evaluate(submit, { ocFirsttextWorkerMark() {}, nextPoolRequestId: 1 }, "submit");
  const pool = { started: true, pending: [], requestPump() {} };
  await makeSubmit.call(pool, request.sessionKey, request, options);
  assert.equal(pool.pending.length, 1);
  // Also execute actual pool IPC construction: the authorization function
  // remains Gateway-local and only the derived mode crosses this boundary.
  const drain = segment(poolSource, "  drain(worker) {", "  releaseSessionOwner(")
    .replace("  drain(worker)", "function drain(worker)");
  const makeDrain = evaluate(drain, { ocFirsttextWorkerMark() {}, requestTimeoutError: () => new Error("test deadline") }, "drain");
  const sent = [], worker = { ready: true, retiring: false, active: new Map(), queue: pool.pending,
    child: { send: value => sent.push(value) } };
  pool.sessionsPerWorker = 1; pool.requestTimeoutMs = 1000; pool.armStallWatchdog = () => {};
  makeDrain.call(pool, worker);
  for (const active of worker.active.values()) clearTimeout(active.timer);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].authorizeNativeVoiceToolOrder, undefined);
  assert.match(sent[0].id, /^request-\d+$/);
  return sent[0];
}

function boundWorker(message, { current = true, stopped = false } = {}) {
  const factory = evaluate(bridgeSource.slice(bridgeSource.indexOf("export function createNativeAttemptBridge"))
    .replace("export function", "function"), { AsyncLocalStorage }, "createNativeAttemptBridge");
  const bridge = factory(), signal = new AbortController();
  const workerInstance = { runId: message.runId, instanceId: "actual-worker-admission" };
  const attempt = { runId: message.runId, sessionId: message.sessionId, agentId: message.agentId,
    sessionKey: message.sessionKey, admittedRunContext: { operationalRunInstance: workerInstance } };
  const handle = { isStopped: () => stopped };
  const unregister = bridge.register(message, signal.signal, () => {}, () => {});
  const isCurrent = () => current;
  const actualBind = segment(builtinSource, '\tglobalThis[Symbol.for("versa.vlab.native-attempt-91-v1")]?.bind(attempt, queueHandle,', '\tif (attempt.deferTerminalLifecycle');
  const activeRuns = new Map([[attempt.runId, handle]]);
  function bindAgent(agent) {
    evaluate(actualBind, {
      globalThis: { [Symbol.for("versa.vlab.native-attempt-91-v1")]: bridge },
      attempt, queueHandle: handle, ACTIVE_EMBEDDED_RUNS_BY_RUN_ID: activeRuns,
      input: { activeSession: { agent } }, authorizeVlabNativePermission() {},
    }, "undefined");
  }
  return { bridge, attempt, workerInstance, handle, signal, unregister, bindAgent,
    setCurrent(value) { current = value; if (!value) activeRuns.delete(attempt.runId); },
    setStopped(value) { stopped = value; }, isCurrent };
}

const request = () => ({ kind: "agent", nativeAttempt91: true,
  runId: "unprefixed-original-run", agentId: "actor", sessionId: "canonical-session", sessionKey: "agent:actor:private-session" });
async function voiceAgent(t, options) {
  const admitted = gatewayAdmission(options);
  const message = await actualPoolAdmission(request(), { authorizeNativeVoiceToolOrder: admitted.authorize });
  const worker = boundWorker(message);
  const agent = new sdk.Agent(); worker.bindAgent(agent);
  t.after(() => worker.unregister());
  return { ...worker, agent, admitted, message };
}
async function runBatch(agent, tools, controller = new AbortController()) {
  agent.state.tools = tools;
  const events = [], config = agent.createLoopConfig();
  const context = { tools: agent.state.tools, messages: [] };
  const content = tools.map((tool, index) => ({ type: "toolCall", id: `actual-call-${index}`, name: tool.name, arguments: {} }));
  const completion = sdk.executeToolCalls(context, { role: "assistant", content }, config, controller.signal,
    async event => { events.push(event); }, false);
  return { completion, events, config };
}
const result = text => ({ content: [{ type: "text", text }] });

test("four strict transforms preserve actual preconditions and are idempotent", () => {
  assert.equal(hash(sdkBefore), patch.GPT_LIVE_TOOL_ORDER_AGENT_CORE_BEFORE);
  assert.equal(patch.patchGptLiveVoiceToolOrderBuiltin(builtinSource), builtinSource);
  assert.equal(patch.patchGptLiveVoiceToolOrderGatewayIndex(indexSource), indexSource);
  assert.equal(patch.patchGptLiveVoiceToolOrderWorkerPool(poolSource), poolSource);
  assert.equal(patch.patchGptLiveVoiceToolOrderNativeAttemptBridge(bridgeSource), bridgeSource);
  assert.throws(() => patch.patchGptLiveVoiceToolOrderBuiltin(builtinBefore + "\n"), /source drifted/);
  assert.throws(() => patch.patchGptLiveVoiceToolOrderGatewayIndex("drift"), /anchor drifted/);
  assert.throws(() => patch.patchGptLiveVoiceToolOrderWorkerPool("drift"), /anchor drifted/);
  assert.throws(() => patch.patchGptLiveVoiceToolOrderNativeAttemptBridge("drift"), /identity patch first/);
});

test("actual Gateway opaque source → pool private IPC → exact native bind changes only the new voice Agent", async t => {
  const f = await voiceAgent(t);
  assert.equal(f.message.gptLiveVoiceToolOrder, "sequential-v1");
  assert.equal(f.agent.toolExecution, "sequential");
  assert.equal(f.agent.createLoopConfig().toolExecution, "sequential");
  assert.equal(new sdk.Agent().toolExecution, "parallel");
  assert.equal(typeof f.handle.setToolExecution, "undefined");
  assert.equal(typeof f.handle.agent, "undefined");
});

test("actual SDK voice batch waits for Memory terminal result before Web execution starts", async t => {
  const f = await voiceAgent(t), memoryGate = deferred(), order = [];
  const batch = await runBatch(f.agent, [
    { name: "memory_search", async execute() { order.push("memory-start"); await memoryGate.promise; order.push("memory-result"); return result("actual-memory-value"); } },
    { name: "web_search", async execute() { order.push("web-start"); return result("actual-web-value"); } },
  ]);
  await tick(); assert.deepEqual(order, ["memory-start"]);
  assert.equal(batch.events.some(e => e.type === "tool_execution_start" && e.toolName === "web_search"), false);
  memoryGate.resolve(); const terminal = await batch.completion;
  assert.deepEqual(order, ["memory-start", "memory-result", "web-start"]);
  const memoryEnd = batch.events.findIndex(e => e.type === "tool_execution_end" && e.toolName === "memory_search");
  const webStart = batch.events.findIndex(e => e.type === "tool_execution_start" && e.toolName === "web_search");
  assert(memoryEnd >= 0 && webStart > memoryEnd);
  assert.deepEqual(terminal.messages.map(m => m.content[0].text), ["actual-memory-value", "actual-web-value"]);
});

test("actual SDK cancel retains Memory aborted result and never executes unstarted Web tail", async t => {
  const f = await voiceAgent(t), controller = new AbortController(), started = deferred(); let webCalls = 0;
  const batch = await runBatch(f.agent, [
    { name: "memory_search", execute(_id, _args, signal) { started.resolve(); return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); } },
    { name: "web_search", async execute() { webCalls++; return result("must-not-run"); } },
  ], controller);
  await started.promise; controller.abort(new Error("actual owner cancellation"));
  const terminal = await batch.completion;
  assert.equal(webCalls, 0); assert.equal(terminal.messages.length, 2);
  const webEnd = batch.events.find(e => e.type === "tool_execution_end" && e.toolName === "web_search");
  assert.equal(webEnd.executionStarted, false); assert.equal(webEnd.isError, true);
  assert.match(terminal.messages[1].content[0].text, /Operation aborted/);
});

test("ordinary admitted native run keeps actual SDK parallel execution", async t => {
  const f = await voiceAgent(t, { voice: false }), memoryGate = deferred(), order = [];
  assert.equal(f.message.gptLiveVoiceToolOrder, undefined); assert.equal(f.agent.toolExecution, "parallel");
  const batch = await runBatch(f.agent, [
    { name: "memory_search", async execute() { order.push("memory-start"); await memoryGate.promise; order.push("memory-result"); return result("memory"); } },
    { name: "web_search", async execute() { order.push("web-start"); return result("web"); } },
  ]);
  await tick(); assert.deepEqual(order, ["memory-start", "web-start"]);
  memoryGate.resolve(); await batch.completion;
});

test("normal SDK execution error remains a truthful result, not a fabricated dependency stop", async t => {
  const f = await voiceAgent(t); let webCalls = 0;
  const batch = await runBatch(f.agent, [
    { name: "memory_search", async execute() { throw new Error("actual memory failure"); } },
    { name: "web_search", async execute() { webCalls++; return result("actual web result"); } },
  ]);
  const terminal = await batch.completion;
  assert.equal(webCalls, 1); assert.equal(terminal.messages[0].isError, true);
  assert.equal(terminal.messages[1].isError, false);
});

test("JSON/model fields, nativeHarnessData, run prefix and a boolean option cannot mint sequential IPC", async () => {
  const untrusted = { ...request(), runId: "gpt-live-voice-prefix", gptLiveVoiceToolOrder: "sequential-v1",
    nativeHarnessData: { gptLiveVoiceToolOrder: "sequential-v1" }, agentCommandOptions: { voice: true } };
  for (const options of [{}, { authorizeNativeVoiceToolOrder: true }, { authorizeNativeVoiceToolOrder: () => false }]) {
    const output = await actualPoolAdmission(untrusted, options);
    assert.equal(output.gptLiveVoiceToolOrder, undefined);
  }
  assert.equal(untrusted.gptLiveVoiceToolOrder, "sequential-v1", "input was not mutated");
  const nonNative = await actualPoolAdmission({ ...request(), nativeAttempt91: false }, { authorizeNativeVoiceToolOrder: () => true });
  assert.equal(nonNative.gptLiveVoiceToolOrder, undefined);
});

test("Gateway authority lookalike and retired actual owner fail before pool admission", async () => {
  const f = gatewayAdmission(); f.attempt.admittedRunContext = { ...f.context };
  await assert.rejects(actualPoolAdmission(request(), { authorizeNativeVoiceToolOrder: f.authorize }), /admitted delegated authority/);
  const expired = gatewayAdmission(); expired.setActive(false);
  await assert.rejects(actualPoolAdmission(request(), { authorizeNativeVoiceToolOrder: expired.authorize }), /source retired/);
});

test("Worker exact source conflicts, stale/aborted admission and missing closure fail closed", async t => {
  const f = await voiceAgent(t);
  assert.throws(() => f.bridge.bind({ ...f.attempt, agentId: "other" }, f.handle, f.isCurrent, () => {}, () => true), /admitted source mismatch/);
  assert.throws(() => f.bridge.bind({ ...f.attempt, sessionKey: "neighbor" }, f.handle, f.isCurrent, () => {}, () => true), /admitted source mismatch/);
  assert.throws(() => f.bridge.bind({ ...f.attempt, admittedRunContext: { operationalRunInstance: { ...f.workerInstance } } }, f.handle, f.isCurrent, () => {}, () => true), /instance changed/);
  assert.throws(() => f.bridge.bind(f.attempt, f.handle, f.isCurrent, () => {}), /owner is unavailable/);
  f.setCurrent(false); assert.throws(() => f.bindAgent(new sdk.Agent()), /owner is unavailable/);
  f.signal.abort(); assert.throws(() => f.bindAgent(new sdk.Agent()), /no longer active/);
});

test("actual Builtin closure rejects a streaming Agent and a stopped owner", async t => {
  const admission = gatewayAdmission();
  const message = await actualPoolAdmission(request(), { authorizeNativeVoiceToolOrder: admission.authorize });
  const worker = boundWorker(message); t.after(worker.unregister);
  const streaming = new sdk.Agent(); streaming.state.isStreaming = true;
  assert.throws(() => worker.bindAgent(streaming), /already active/);
  assert.equal(streaming.toolExecution, "parallel");
  const runningTool = new sdk.Agent();
  runningTool.activeRun = { abortController: new AbortController() };
  assert.throws(() => worker.bindAgent(runningTool), /already active/);
  assert.equal(runningTool.toolExecution, "parallel");
  worker.setStopped(true); assert.throws(() => worker.bindAgent(new sdk.Agent()), /owner is unavailable/);
});

test("voice and neighboring ordinary SDK batches remain independently scoped", async t => {
  const voice = await voiceAgent(t), ordinary = await voiceAgent(t, { voice: false });
  const voiceGate = deferred(), ordinaryGate = deferred(), order = [];
  const voiceBatch = await runBatch(voice.agent, [
    { name: "memory_search", async execute() { order.push("voice-memory"); await voiceGate.promise; return result("voice-memory-result"); } },
    { name: "web_search", async execute() { order.push("voice-web"); return result("voice-web-result"); } },
  ]);
  const ordinaryBatch = await runBatch(ordinary.agent, [
    { name: "memory_search", async execute() { order.push("ordinary-memory"); await ordinaryGate.promise; return result("ordinary-memory-result"); } },
    { name: "web_search", async execute() { order.push("ordinary-web"); return result("ordinary-web-result"); } },
  ]);
  await tick();
  assert(order.includes("ordinary-web")); assert.equal(order.includes("voice-web"), false);
  ordinaryGate.resolve(); await ordinaryBatch.completion;
  assert.equal(voice.agent.toolExecution, "sequential"); assert.equal(ordinary.agent.toolExecution, "parallel");
  voiceGate.resolve(); await voiceBatch.completion;
});

test("known voice closure failure cannot claim application or continue as ordinary", async t => {
  const f = await voiceAgent(t);
  assert.throws(() => f.bridge.bind(f.attempt, f.handle, f.isCurrent, () => {}, () => false), /not applied/);
});

test("unknown Worker private mode cannot fall back to ordinary execution", () => {
  const worker = boundWorker({ ...request(), gptLiveVoiceToolOrder: true });
  try { assert.throws(() => worker.bindAgent(new sdk.Agent()), /Unknown Worker/); } finally { worker.unregister(); }
});

test("actual SDK snapshot timing and source order are preserved rather than reordered semantically", async t => {
  const f = await voiceAgent(t);
  const oldSnapshot = new sdk.Agent().createLoopConfig();
  assert.equal(oldSnapshot.toolExecution, "parallel");
  const order = [], batch = await runBatch(f.agent, [
    { name: "web_search", async execute() { order.push("web"); return result("web"); } },
    { name: "memory_search", async execute() { order.push("memory"); return result("memory"); } },
  ]);
  await batch.completion; assert.deepEqual(order, ["web", "memory"]);
});
