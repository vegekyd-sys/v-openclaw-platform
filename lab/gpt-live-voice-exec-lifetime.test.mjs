import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGptLiveVoiceExecLifetime } from "./gpt-live-voice-exec-lifetime.mjs";
import { createGptLiveConsultContinuationRegistry } from "./gpt-live-consult-continuation.mjs";
import * as patch from "./patch-gpt-live-voice-exec-lifetime.mjs";

const openclaw = new URL("../release/captured/v2026.9.1-db91.6-memory-search-guards-20261002/dist/", import.meta.url);
const worker = new URL("../release/captured/v2026.9.1-db91.6-memory-search-weighted-20261002.worker/dist/", import.meta.url);
const targets = [
  [openclaw, "host-capability-Dq3cEEWF.js", "4535cb192dff71e0d3602f19ebbba6191f98a2f21013c2fa33e0b87386eaa5ce", "patchGptLiveVoiceExecHostCapability"],
  [openclaw, "bash-tools-DiAfkLAC.js", "8bda4a91e8e742308d2aecbd8914996b4ddd0f1af0cfc1018064f4a7a3cd8d28", "patchGptLiveVoiceExecBashTools"],
  [worker, "native-attempt-bridge.mjs", "6482f3d27a0f7e019a1f65faaa6e7bbdb28a999250ff5d1d6ab871d9ba65a813", "patchGptLiveVoiceExecNativeAttemptBridge"],
  [worker, "gateway-message-tool.mjs", "2ae673d4eae9dfd0f350e07d1106a78c95c9259d698e2a9b42fdbaeab2078472", "patchGptLiveVoiceExecGatewayRelay"],
  [worker, "worker-pool.mjs", "a9f718d0c9ca1f209aba9a9a55d86181b84f2ab1afa8b65cc86bde96bc3b5ea3", "patchGptLiveVoiceExecWorkerPool"],
];
const sources = Object.fromEntries(targets.map(([dir, name, sha, fn]) => {
  const source = readFileSync(new URL(name, dir), "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), sha, `${name} captured identity`);
  return [name, patch[fn](source)];
}));
const extract = (source, from, until, deps, name) => {
  const start = source.indexOf(from), end = source.indexOf(until, start);
  assert(start >= 0 && end > start, `actual function boundary ${from}`);
  return new Function("deps", `with(deps) { ${source.slice(start, end).replace(/^export /gm, "")}; return ${name}; }`)(deps);
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const command = ms => `${JSON.stringify(process.execPath)} -e 'setTimeout(()=>console.log("actual-terminal"),${ms})'`;

function fixture(t, { voice = true, identity = {}, rpcTimeoutMs, gatewayTimeoutMs } = {}) {
  const callers = new AsyncLocalStorage(), preparers = new WeakMap();
  const controller = new AbortController(); let current = true;
  const attempt = { runId: "parent", sessionId: "canonical-parent", sessionKey: "agent:actor:voice", agentId: "actor",
    cwd: process.cwd(), workspaceDir: process.cwd(), abortSignal: controller.signal, ...identity };
  const instance = { runId: attempt.runId, instanceId: "admitted-instance" };
  attempt.admittedRunContext = { operationalRunInstance: instance, authority: { operationalRunInstance: instance, lifecycleGeneration: "life" } };
  const admitted = new WeakMap([[attempt.admittedRunContext, attempt.admittedRunContext.authority]]);
  const registry = createGptLiveConsultContinuationRegistry({
    getLifecycleGeneration: () => "life", isLifecycleCurrent: () => true, subscribeRun: () => () => {},
    createProgressObserver: () => ({ close() {}, onPartialReply() {}, onAgentEvent() {} }),
    resolveSessionIdentity: key => ({ sessionId: key === attempt.sessionKey ? attempt.sessionId : "canonical-child", agentId: key === attempt.sessionKey ? attempt.agentId : "other" }),
  });
  const owner = voice ? registry.createOwner({ ...attempt, timeoutMs: 10000, collectVisibleText: payloads => payloads.map(x => x.text).join("\n"),
    continuationContext: { identity: { delegationItemId: "d", delegationGeneration: 1 }, ownerConnId: "c", voiceSessionId: "v", ownerGeneration: "g", isCurrent: () => current } }) : undefined;
  const lifetime = createGptLiveVoiceExecLifetime(registry.resolveOwnedExecSource, {
    getAuthority: context => admitted.get(context),
    copyMetadata: (a, b) => { b.metadata = a.metadata; }, getPreparer: a => preparers.get(a), attachPreparer: (a, p) => preparers.set(a, p),
  });
  const runs = [], defaultsSeen = [], calls = [];
  // OS boundary fake only. The actual patched createExecTool below retains its
  // own run.promise race, yield timer, abort listener, run.kill and final result.
  const runExecProcess = async params => {
    const child = spawn("/bin/sh", ["-c", params.command], { cwd: params.workdir, env: process.env, detached: true });
    let output = "", kills = 0; const startedAt = Date.now();
    child.stdout.on("data", chunk => { output += chunk; });
    const session = { id: `os-${runs.length}`, pid: child.pid, cwd: params.workdir, aggregated: "", tail: "", totalOutputChars: 0, backgrounded: false };
    const promise = new Promise((resolve, reject) => {
      child.once("error", reject); child.once("close", (code, signal) => {
        session.aggregated = output; session.totalOutputChars = output.length;
        const outcome = { status: code === 0 ? "completed" : "failed", exitCode: code, signal, aggregated: output };
        params.onSettledBeforeNotify?.(outcome); resolve(outcome);
      });
    });
    const run = { session, promise, startedAt, disableUpdates() {}, kill() {
      kills++; try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }, get kills() { return kills; }, params };
    runs.push(run); return run;
  };
  function execFactory(bridge) {
    const deps = {
      globalThis: { [Symbol.for("versa.vlab.native-attempt-91-v1")]: bridge },
      logInfo() {}, describeExecTool: () => "actual exec",
      requireGptLiveVoiceExecForeground: lifetime.requireForeground, getGptLiveExecCallerIdentity: () => callers.getStore(),
      isSecretEgressProxyActive: () => false, resolveExecPreparedRunEnvironment: () => ({}),
      clampWithDefault: (value, fallback, min, max) => Math.min(max, Math.max(min, value ?? fallback)), readEnvInt: () => undefined,
      normalizePathPrepend: () => [], resolveExecSafeBinRuntimePolicy: () => ({ unprofiledSafeBins: [], unprofiledInterpreterSafeBins: [] }),
      resolveNotifyOnExitEmptySuccess: () => false, normalizeOptionalString: x => x, normalizeDeliveryContext: x => x,
      resolveApprovalRunningNoticeMs: () => 0, parseAgentSessionKey: () => undefined, createExecHostResolver: () => () => "gateway",
      createExecRequestPreparation: () => ({ normalizeParams: x => ({ ...x }), isResolveExecEnvPrepared: () => false,
        getExecHookContext: () => ({}), getResolvedExecWorkdirPreparedState: () => undefined,
        prepareParamsWithResolvedExecEnv: async x => x, getResolvedExecEnvPreparedState: () => undefined }),
      EXEC_TOOL_DISPLAY_SUMMARY: "exec", execSchema: {}, assertSupportedExecParams: args => assert.equal(typeof args.command, "string"),
      DEFAULT_MAX_OUTPUT: 1024, DEFAULT_PENDING_MAX_OUTPUT: 1024, resolveExecElevatedMode: () => "off", requireValidExecTarget: x => x,
      resolveExecTarget: () => ({ effectiveHost: "gateway" }), resolveExecModePolicy: () => ({ security: "full", ask: "off" }),
      loadExecApprovals: () => ({}), resolveExecApprovalsFromFile: () => ({ agent: { security: "full", ask: "off" } }),
      minSecurity: x => x, normalizeExecAsk: x => x, maxAsk: () => "off", rejectUnsafeExecControlShellCommand: async () => {},
      resolveExecWorkdir: async ({ defaultCwd }) => ({ kind: "local", hostCwd: defaultCwd }),
      rejectUnsafeExecLiveStateSqliteShellCommand: async () => {}, resolveStateDir: () => "/unused",
      createExecProcessSettlement: () => { const settlement = { settle(outcome) { settlement.outcome = outcome; } }; return settlement; },
      resolvePreparedExecEnvironment: () => ({ env: process.env, requestedEnv: {} }),
      processGatewayAllowlist: async () => ({}), shouldSkipExecScriptPreflight: () => true, runExecProcess,
      ExecProcessPreflightError: { unwrap: error => { throw error; } }, withoutGatewayToolCallerIdentity: fn => fn(),
      createDeferredCore: () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; },
      markBackgrounded: session => { session.backgrounded = true; }, createBackgroundExecTask: () => ({}),
      BACKGROUND_EXEC_FOLLOW_UP: "ordinary process follow-up", attachExecApprovalReview: result => result,
      buildExecForegroundResult: ({ outcome, cwd }) => ({ content: [{ type: "text", text: outcome.aggregated }], details: { ...outcome, cwd } }),
      createAbortError$1: (message, opts) => Object.assign(new Error(message, opts), { name: "AbortError" }),
    };
    const source = sources["bash-tools-DiAfkLAC.js"].replace('import("./secret-store-BB5xwYim.js")', 'Promise.resolve({readSecretStoreExecEnvironment:()=>({})})');
    const create = extract(source, "function createExecTool(defaults)", "/** Default exec tool", deps, "createExecTool");
    return options => { defaultsSeen.push(options); return create({ autoReviewer: () => {}, ...options }); };
  }
  let createExec = execFactory();
  const wrapIdentity = (tool, caller) => ({ ...tool, execute: (...args) => callers.run(caller, () => tool.execute(...args)) });
  const hostDeps = {
    hasGptLiveVoiceExecSource: lifetime.hasSource, bindGptLiveVoiceExecTool: lifetime.bindTool,
    getInstallationTarget: () => ({}), installationTargetEnv: () => undefined,
    getAdmittedRunDelegatedAuthority: context => admitted.get(context), getGatewayToolCallerIdentity: () => undefined,
    createBoundCallerIdentity: (a, check) => ({ agentId: a.agentId, sessionKey: a.sessionKey, operationalRunInstance: a.admittedRunContext.operationalRunInstance, receiptAuthority: check }),
    prepareGitHubToolEnvironment: () => ({}), getActiveSecretsRuntimeConfigSnapshot: () => undefined,
    buildAgentHookContextChannelFields: () => ({}), getActiveDiagnosticTraceContext: () => undefined,
    resolveToolLoopDetectionConfig: () => ({}), cloneSnapshot: x => structuredClone(x), retainedBeforeToolCallRunners: new WeakMap(),
    bindAgentToolSourceExecutionGuard: tool => tool, rewrapToolWithBeforeToolCallHook: tool => tool,
    wrapToolWithGatewayCallerIdentity: wrapIdentity,
    wrapToolWithAbortSignal: (tool, signal) => ({ ...tool, execute: (id, args, toolSignal, ...rest) => tool.execute(id, args, toolSignal ? AbortSignal.any([signal, toolSignal]) : signal, ...rest) }),
    gateBoundTool: tool => tool, withInstallationTarget: (_, fn) => fn(), normalizeNativeOperationCwd: x => x,
    createOpenClawCodingTools: options => [createExec({ ...options, agentId: "permission-policy", processToolAvailabilityRef: { value: true } })],
    registerAgentHarnessTtsProvenanceTransferCapability: () => {}, registerAgentHarnessScheduledToolProjectionCapability: () => {},
  };
  const createHost = extract(sources["host-capability-Dq3cEEWF.js"], "function createAgentHarnessHostCapabilities(params)", "//#endregion", hostDeps, "createAgentHarnessHostCapabilities");
  const host = createHost({ attempt, requiredNodeCommands: [] });
  // Include the closing function brace in this single-function module.
  const relayFactory = new Function("process", `${sources["gateway-message-tool.mjs"].replace("export function", "function")};return createGatewayMessageToolRelay;`)({ env: {
    ...process.env, ...(gatewayTimeoutMs ? { VLAB_GATEWAY_OWNED_TOOL_TIMEOUT_MS: String(gatewayTimeoutMs) } : {}),
  } });
  const relay = relayFactory({ ...attempt, hostCapabilities: host.capabilities });
  const bridgeFactory = new Function("AsyncLocalStorage", `${sources["native-attempt-bridge.mjs"].slice(sources["native-attempt-bridge.mjs"].indexOf("export function createNativeAttemptBridge")).replace("export function", "function")};return createNativeAttemptBridge;`)(AsyncLocalStorage);
  const bridge = bridgeFactory();
  const workerInstance = { runId: attempt.runId, instanceId: "worker-admission" };
  const workerAttempt = { ...attempt, admittedRunContext: { operationalRunInstance: workerInstance } };
  const unregister = bridge.register({ id: "request-parent", runId: attempt.runId, sessionId: attempt.sessionId, sessionKey: attempt.sessionKey, agentId: attempt.agentId }, controller.signal, () => {},
    request => {
      calls.push(request); const execution = relay.execute(request);
      if (rpcTimeoutMs && request.kind === "native-voice-exec") {
        // Transport boundary expiration, while the actual Gateway tool is live.
        return Promise.race([execution, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("original RPC timeout"),
          { code: "VLAB_GATEWAY_TOOL_TIMEOUT" })), rpcTimeoutMs))]);
      }
      return execution;
    });
  bridge.bind(workerAttempt, { isStopped: () => false }, () => current, () => {});
  const workerCreate = execFactory(bridge);
  const workerTool = wrapIdentity(workerCreate({ ...workerAttempt, operationalRunInstance: workerInstance, cwd: attempt.cwd, processToolAvailabilityRef: { value: true } }),
    { operationalRunInstance: workerInstance, agentId: attempt.agentId, sessionKey: attempt.sessionKey });
  t.after(async () => {
    controller.abort(); owner?.abort(new Error("test cleanup")); host.close(); relay.close(); unregister();
    for (const run of runs) { run.kill(); await run.promise; }
  });
  return { attempt, instance, controller, owner, registry, lifetime, host, relay, bridge, workerTool, workerInstance, runs, calls, defaultsSeen, preparers,
    setCurrent: value => { current = value; }, execFactory, wrapIdentity, unregister, createHost, relayFactory, admitted,
    setGatewayBridge: value => { createExec = execFactory(value); } };
}

test("five captured transforms are strict and idempotent; runtime source is self contained", () => {
  for (const [dir, name, , fn] of targets) {
    assert.equal(patch[fn](sources[name]), sources[name]);
    assert.throws(() => patch[fn]("function drifted() {}"), /anchor drifted/);
  }
  assert.match(patch.createGptLiveVoiceExecLifetimeRuntimeSource(), /resolveGptLiveVoiceExecSource/);
});

test("actual Worker→Gateway→host→bash stays foreground despite background true; original model loop receives terminal result", async t => {
  const f = fixture(t); let modelContinued = false;
  // A Gateway process might also have the Worker symbol; issued ALS must prevent recursion.
  f.setGatewayBridge({ executeVoiceExec() { throw new Error("recursive proxy"); } });
  const args = { command: command(90), background: true, yieldMs: 1 };
  const pending = f.workerTool.execute("original-call", args).then(result => { modelContinued = true; return result; });
  await wait(25); assert.equal(modelContinued, false); assert.equal(f.runs[0].session.backgrounded, false);
  const result = await pending;
  assert.equal(result.details.status, "completed"); assert.match(result.content[0].text, /actual-terminal/);
  assert.equal(modelContinued, true); assert.equal(f.runs[0].params.processContinuationAvailable, false);
  assert.equal(f.calls[0].toolCallId, "original-call"); assert.equal(f.calls[0].args, args);
  assert.equal(f.defaultsSeen.at(-1).cwd, f.attempt.cwd); assert.equal(f.defaultsSeen.at(-1).agentId, "permission-policy");
});

test("ordinary actual native run still returns real running result and keeps process continuation", async t => {
  const f = fixture(t, { voice: false });
  const result = await f.workerTool.execute("ordinary-call", { command: command(90), background: true });
  assert.equal(result.details.status, "running"); assert.equal(f.runs[0].session.backgrounded, true);
  assert.equal(f.runs[0].params.processContinuationAvailable, true);
});

test("actual host bindToolSurface and createToolSurface both issue foreground lifetime", async t => {
  const f = fixture(t); const defaults = { ...f.attempt, operationalRunInstance: f.instance, processToolAvailabilityRef: { value: true } };
  const direct = f.execFactory()(defaults);
  const [bound] = f.host.capabilities.bindToolSurface([direct]);
  const one = await bound.execute("bind-call", { command: command(20), background: true });
  const [created] = f.host.capabilities.createToolSurface(f.attempt);
  const two = await created.execute("create-call", { command: command(20), background: true });
  assert.equal(one.details.status, "completed"); assert.equal(two.details.status, "completed");
});

test("Worker tool abort sends same admitted relay revoke and awaits real process kill", async t => {
  const f = fixture(t); const local = new AbortController();
  const promise = f.workerTool.execute("abort-call", { command: command(5000), background: true }, local.signal);
  const rejected = assert.rejects(promise, error => error.name === "AbortError");
  while (!f.runs.length) await tick(); local.abort(new Error("actual tool abort"));
  await rejected; assert.equal(f.runs[0].kills, 1); assert.equal(f.runs[0].session.backgrounded, false);
  assert.equal(f.calls.filter(x => x.kind === "native-voice-exec-cancel").length, 1);
});

test("Worker active run cancel signal revokes Gateway command rather than awaiting original RPC forever", async t => {
  const f = fixture(t);
  const promise = f.workerTool.execute("owner-cancel-call", { command: command(5000), background: true });
  const rejected = assert.rejects(promise);
  while (!f.runs.length) await tick(); f.controller.abort(new Error("Worker request cancel handler"));
  await rejected; assert.equal(f.runs[0].kills, 1); assert(f.calls.some(x => x.kind === "native-voice-exec-cancel"));
});

test("known voice identity conflict and stale owner fail closed without ordinary execution", async t => {
  const f = fixture(t);
  assert.throws(() => f.registry.resolveOwnedExecSource({ ...f.attempt, agentId: "wrong" }), /identity mismatch/);
  f.setCurrent(false);
  await assert.rejects(f.workerTool.execute("stale-call", { command: command(20), background: true }), /retired owner/);
  assert.equal(f.runs.length, 0);
});

test("admitted object spoof, canonical session conflict and final-settled voice run cannot degrade to background", async t => {
  const f = fixture(t);
  await assert.rejects(f.bridge.executeVoiceExec({ runId: f.attempt.runId, operationalRunInstance: { ...f.workerInstance },
    callerRunInstance: f.workerInstance, sessionId: f.attempt.sessionId, agentSessionKey: f.attempt.sessionKey, agentId: f.attempt.agentId }, "spoof", {}), /source mismatch/);
  assert.throws(() => f.registry.resolveOwnedExecSource({ ...f.attempt, sessionId: "wrong" }), /identity mismatch/);
  await f.owner.finishInitial({ meta: {}, payloads: [{ text: "actual complete final" }] });
  await assert.rejects(f.workerTool.execute("late-call", { command: command(20), background: true }), /already settled/);
  assert.equal(f.runs.length, 0);
});

test("relay cancel rejects cross relay, settled and reused call ids", async t => {
  const f = fixture(t);
  await assert.rejects(f.relay.execute({ kind: "native-voice-exec-cancel", toolCallId: "guessed" }), /No pending exec/);
  await f.workerTool.execute("finished-call", { command: command(20), background: true });
  await assert.rejects(f.relay.execute({ kind: "native-voice-exec-cancel", toolCallId: "finished-call" }), /No pending exec/);
  await assert.rejects(f.workerTool.execute("finished-call", { command: command(20), background: true }), /already used/);
  assert.equal(f.runs.length, 1);
});

test("original IPC timeout revokes the actual Gateway exec and preserves the timeout failure", async t => {
  const f = fixture(t, { rpcTimeoutMs: 15 });
  await assert.rejects(f.workerTool.execute("timeout-call", { command: command(5000), background: true }), error => error.code === "VLAB_GATEWAY_TOOL_TIMEOUT");
  assert.equal(f.runs.length, 1); assert.equal(f.runs[0].kills, 1);
  assert(f.calls.some(x => x.kind === "native-voice-exec-cancel" && x.toolCallId === "timeout-call"));
  assert.equal(f.runs[0].session.aggregated, "");
});

test("ordinary legacy unregistered Worker has no new RPC; known retired native admission rejects", async t => {
  const f = fixture(t);
  const reply = await f.bridge.executeVoiceExec({ runId: "unregistered-ordinary" }, "ordinary", {}, undefined);
  assert.deepEqual(reply, { handled: false }); assert.equal(f.calls.length, 0);
  const legacy = f.execFactory(f.bridge)({ runId: "unregistered-ordinary", cwd: f.attempt.cwd });
  const result = await legacy.execute("legacy-call", { command: command(25), background: true });
  assert.equal(result.details.status, "running"); assert.equal(f.calls.length, 0);
  f.unregister();
  await assert.rejects(f.bridge.executeVoiceExec({ runId: f.attempt.runId }, "late", {}), /owner has retired/);
});

test("internal prepared execution keeps real foreground lifetime and metadata; inherited ALS is revoked after return", async t => {
  const f = fixture(t); const caller = { operationalRunInstance: f.instance, sessionKey: f.attempt.sessionKey, agentId: f.attempt.agentId };
  const defaults = { ...f.attempt, operationalRunInstance: f.instance };
  const raw = f.wrapIdentity(f.execFactory()(defaults), caller);
  raw.metadata = { original: true };
  f.preparers.set(raw, async params => ({ kind: "ready", args: params.args,
    execute: async start => { start(); return await raw.execute(params.toolCallId, params.args, params.signal); }, dispose() {} }));
  const bound = f.lifetime.bindTool(raw, { attempt: f.attempt, operationalRunInstance: f.instance, assertActive: f.host.capabilities.assertActive });
  assert.equal(bound.metadata, raw.metadata);
  const prepared = await f.preparers.get(bound)({ toolCallId: "prepared-call", args: { command: command(25), background: true } });
  let started = false; const result = await prepared.execute(() => { started = true; });
  assert.equal(started, true); assert.equal(result.details.status, "completed");
  let resolveLate;
  const late = new Promise(resolve => { resolveLate = resolve; });
  const check = f.lifetime.bindTool({ name: "exec", execute: () => {
    setImmediate(() => { try { f.lifetime.requireForeground(defaults, caller); resolveLate("unexpected valid"); } catch (e) { resolveLate(e.message); } });
    return "done";
  } }, { attempt: f.attempt, operationalRunInstance: f.instance, assertActive: f.host.capabilities.assertActive });
  await check.execute(); assert.equal(await late, "Unissued voice exec capability");
});

test("actual Worker pool routes exec to exact admitted relay; cancelled owner can only revoke", async () => {
  const source = sources["worker-pool.mjs"];
  const start = source.indexOf('    if (message?.type === "gateway-tool-request"');
  const end = source.indexOf('    if (message?.type === "stream-event"', start);
  const replies = [], routed = []; let globalCalls = 0;
  const handle = new Function("message", "worker", "sendLateWorkerReply", "toError", source.slice(start, end));
  const owner = { onGatewayToolRequest: request => { routed.push(request); return { result: request.kind }; } };
  const workerState = { active: new Map([["original-owner", owner]]), child: {} };
  const call = async (kind, ownerRequestId = "original-owner") => {
    handle.call({ onGatewayToolRequest: () => { globalCalls++; } }, { type: "gateway-tool-request", requestId: "rpc", request: { kind, ownerRequestId, toolCallId: "call" } },
      workerState, (_, reply) => replies.push(reply), error => error);
    await tick(); return replies.at(-1);
  };
  assert.equal((await call("native-voice-exec")).ok, true);
  owner.cancelRequested = true;
  assert.equal((await call("native-voice-exec")).ok, false);
  assert.equal((await call("native-gateway-identity")).ok, false);
  assert.equal((await call("native-voice-exec-cancel")).ok, true);
  owner.timeoutError = new Error("timeout");
  assert.equal((await call("native-voice-exec-cancel")).ok, true);
  assert.equal((await call("native-voice-exec-cancel", "other-owner")).ok, false);
  assert.equal(globalCalls, 0); assert.equal(routed.length, 3);
});

test("a Gateway policy denial or IPC failure does not execute a local background fallback", async t => {
  const f = fixture(t); const broken = f.execFactory({ executeVoiceExec() { throw new Error("actual IPC unavailable"); } });
  const tool = broken({ ...f.attempt, operationalRunInstance: f.workerInstance });
  await assert.rejects(tool.execute("broken-call", { command: command(20), background: true }), /IPC unavailable/);
  assert.equal(f.runs.length, 0);
});

test("Gateway's original RPC deadline aborts actual exec if Worker cancellation cannot arrive", async t => {
  const f = fixture(t, { gatewayTimeoutMs: 1000 });
  await assert.rejects(f.workerTool.execute("deadline-call", { command: command(5000), background: true }), /Tool execution was aborted/);
  assert.equal(f.runs.length, 1); assert.equal(f.runs[0].kills, 1);
  assert.equal(f.runs[0].session.backgrounded, false);
});

test("actual accepted cross-agent child preserves its own canonical admission/cwd and foreground terminal result", async t => {
  const f = fixture(t);
  const entry = { runId: "accepted-child", taskRunId: "child-task", childSessionKey: "agent:other:child", requesterSessionKey: f.attempt.sessionKey,
    requesterAgentId: f.attempt.agentId, requesterTurnRunId: f.attempt.runId, generation: 1,
    execution: { status: "running", lifecycleGeneration: "life" }, delivery: { status: "pending" } };
  f.registry.attachAcceptedChild({ entry, getCurrentEntry: () => entry });
  const controller = new AbortController();
  const source = { ...f.attempt, runId: entry.runId, sessionKey: entry.childSessionKey, sessionId: "canonical-child", agentId: "other", abortSignal: controller.signal };
  const instance = { runId: source.runId, instanceId: "child-admission" };
  source.admittedRunContext = { operationalRunInstance: instance };
  f.admitted.set(source.admittedRunContext, { operationalRunInstance: instance, lifecycleGeneration: "life" });
  const host = f.createHost({ attempt: source, requiredNodeCommands: [] });
  const relay = f.relayFactory({ ...source, hostCapabilities: host.capabilities });
  const workerInstance = { runId: source.runId, instanceId: "child-worker" };
  const unregister = f.bridge.register({ id: "child-owner", ...source }, controller.signal, () => {}, request => relay.execute(request));
  f.bridge.bind({ ...source, admittedRunContext: { operationalRunInstance: workerInstance } }, {}, () => true, () => {});
  const raw = f.execFactory(f.bridge)({ ...source, operationalRunInstance: workerInstance });
  const tool = f.wrapIdentity(raw, { operationalRunInstance: workerInstance, sessionKey: source.sessionKey, agentId: source.agentId });
  t.after(() => { controller.abort(); unregister(); host.close(); relay.close(); });
  const result = await tool.execute("child-original-call", { command: command(25), background: true });
  assert.equal(result.details.status, "completed"); assert.equal(result.details.cwd, source.cwd);
  assert.equal(f.defaultsSeen.at(-1).operationalRunInstance, instance);
  assert.equal(f.defaultsSeen.at(-1).agentId, "permission-policy");
  assert.equal(f.defaultsSeen.at(-1).sessionId, "canonical-child");
});

test("JSON lookalike attempt with known voice strings cannot mint an admitted host capability", async t => {
  const f = fixture(t); const forged = { ...f.attempt, admittedRunContext: { operationalRunInstance: f.instance } };
  assert.throws(() => f.lifetime.hasSource({ attempt: forged, operationalRunInstance: f.instance, assertActive() {} }), /no admitted delegated authority/);
  assert.equal(f.runs.length, 0);
});
