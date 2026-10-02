import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import vm from "node:vm";
import { withGatewayCompletionContext } from "./gpt-live-completion-context.mjs";
import { patchGptLiveCompletionContextWorker } from "./patch-gpt-live-completion-context.mjs";
import { patchGptLiveContinuationTaskSdk } from "./patch-gpt-live-consult-continuation.mjs";
import { createGptLiveConsultContinuationRegistry } from "./gpt-live-consult-continuation.mjs";
import { startSubagentCompletionRelays } from "../release/captured/v2026.9.1-db91.6-db91-shrink-reuse-20261002.worker/dist/subagent-completion-relay.mjs";

const base = "../release/captured/v2026.9.1-db91.6-db91-shrink-reuse-20261002.worker/dist/";
const fixture = name => readFileSync(new URL(`./fixtures/gpt-live-completion-context/${name}`, import.meta.url), "utf8");
const before = readFileSync(new URL(base + "index.mjs", import.meta.url), "utf8");
const patched = patchGptLiveCompletionContextWorker(before);
const parent = "agent:makaron:explicit:voice-fixture";
const child = "agent:makaron:subagent:child-fixture";
const spawn = { status: "accepted", runId: "child-run", childSessionKey: child, cleanup: "keep" };
const nativeCode = source => source.replace(/^import[^;]*;\s*$/gmu, "").replace(/^export \{[^\n]*\};?\s*$/gmu, "");

function range(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `native source anchors unavailable: ${start}`);
  return source.slice(first, last);
}

// Real native functions run together in one VM so their WeakMap/WeakSet and
// AsyncLocalStorage identities match. Only storage and Gateway RPC boundaries
// are controlled fakes; no rewritten scope implementation is used here.
function nativeHarness() {
  const trace = [], singletons = new Map();
  const context = vm.createContext({
    AsyncLocalStorage, randomUUID, setTimeout, clearTimeout,
    GATEWAY_CLIENT_IDS: { GATEWAY_CLIENT: "gateway-client" },
    GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
    ADMIN_SCOPE: "operator.admin",
    normalizeOptionalString: value => typeof value === "string" && value.trim() || undefined,
    normalizeDeliveryContext: value => value,
    resolveGlobalSingleton: (key, create) => {
      if (!singletons.has(key)) singletons.set(key, create());
      return singletons.get(key);
    },
    resolveGlobalMap: key => {
      if (!singletons.has(key)) singletons.set(key, new Map());
      return singletons.get(key);
    },
    getActivePluginRegistry: () => ({ plugins: [] }),
    resolvePluginRouteRuntimeOperatorScopes: () => assert.fail("plugin-auth routes must not read caller headers"),
  });
  for (const name of [
    "gateway-request-scope-CmMd3nUp.js", "agent-harness-task-runtime-scope-BNJRhh_H.js",
    "gateway-caller-context-CRUBJj3M.js", "server-plugin-runtime-client-CXu_O7BH.js",
  ]) vm.runInContext(nativeCode(fixture(name)), context, { filename: name });
  const dispatch = fixture("server-plugin-in-process-dispatch-BirRDL7L.js");
  vm.runInContext(nativeCode(dispatch), context, { filename: "native-in-process-dispatch.js" });
  const http = fixture("plugins-http-aNik4RkL.js");
  vm.runInContext(range(http, "function createPluginRouteRuntimeClient(", "function writeUpgradeUnauthorized("), context);
  vm.runInContext(range(http, "function createPluginRouteRuntimeScope(", "function createGatewayPluginRequestHandler("), context);
  vm.runInContext(range(fixture("server-plugins-Dr-GcAg-.js"), "function canTrustedOfficialPluginRequestScopes(", "async function dispatchTrustedPluginGatewayMethod("), context);
  vm.runInContext(range(fixture("server-plugins-Dr-GcAg-.js"), "const PLUGIN_SUBAGENT_SESSION_MESSAGES_MAX_LIMIT", "function createGatewayNodesRuntime("), context);
  const api = vm.runInContext(`({
    createPluginRouteRuntimeScope, withPluginRuntimeGatewayRequestScope,
    getPluginRuntimeGatewayRequestScope, withPluginRuntimeGatewayContextResolver,
    getGatewayContextResolver, bindGatewayContextResolver,
    createAgentHarnessTaskRuntimeScope, assertAgentHarnessTaskRuntimeScope,
    withoutGatewayToolCallerIdentity, withGatewayToolCallerIdentity, getGatewayToolCallerIdentity,
    createGatewaySubagentRuntime, dispatchGatewayMethodInProcess, resolveInProcessGatewayDispatch,
  })`, context);
  let live;
  const authorize = (method, client) => {
    const scopes = Array.from(client.connect.scopes);
    if (!scopes.includes("operator.write") && !scopes.includes("operator.admin")) {
      throw new Error("missing scope: operator.write");
    }
    assert.equal(scopes.includes("operator.admin"), false, "completion must not grant admin");
    assert.equal(api.getGatewayToolCallerIdentity(), undefined, "completion must detach the initiating tool identity");
    assert.equal(api.getPluginRuntimeGatewayRequestScope().client, undefined, "offer HTTP client must not survive");
    trace.push({ method, scopes, instance: live });
  };
  const instance = {
    async createAgentTurnFacade({ client, assertContextCurrent }) {
      return {
        async wait(params) {
          assertContextCurrent(); authorize("agent.wait", client);
          assert.equal(params.runId, spawn.runId);
          if (instance.onWait) await instance.onWait();
          return { status: "ok" };
        },
        async dispatch(params) {
          assertContextCurrent(); authorize("agent", client);
          assert.equal(params.sessionKey, parent);
          return { delivered: true };
        },
      };
    },
  };
  live = instance;
  // The raw RPC seam is replaced, while actual resolver/client selection and
  // actual runtime.subagent.getSessionMessages execute unchanged above it.
  context.dispatchGatewayRequestInProcessRaw = async (method, params, options) => {
    options.sessionMutationCommitGuard();
    authorize(method, options.client);
    assert.equal(method, "sessions.get"); assert.equal(params.key, child);
    return { ok: true, payload: { messages: [{ role: "assistant", text: "2026-10-02 17:53:36 CST +0800" }] } };
  };
  const resolver = () => live;
  const subagent = api.createGatewaySubagentRuntime(resolver);
  const scope = api.createAgentHarnessTaskRuntimeScope({ requesterSessionKey: parent, gatewayContextResolver: resolver });
  const pluginScope = api.createPluginRouteRuntimeScope({
    registry: {}, route: { auth: "plugin", pluginId: "openai" },
    req: { headers: { "x-openclaw-scopes": "operator.read,operator.write,operator.admin" } },
    gatewayRequestContext: instance,
    gatewayRequestOperatorScopes: ["operator.read", "operator.write", "operator.admin"],
  });
  assert.deepEqual(Array.from(pluginScope.client.connect.scopes), []);
  return { api, trace, instance, resolver, subagent, scope, pluginScope,
    expire: () => { live = undefined; },
    enter: run => api.withPluginRuntimeGatewayRequestScope(pluginScope, () => api.withGatewayToolCallerIdentity({ agentId: "makaron", sessionKey: parent }, run)),
  };
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const workerBoundary = new AsyncFunction(
  "params", "sessionKey", "acceptedSessionSpawns", "api", "agentHarnessTaskScopeRuntimePromise",
  "gatewayCallerRuntimePromise", "gatewayScopeRuntimePromise", "agentHarnessTaskRuntimePromise",
  "nativeSubagentCompletionRelays", "nativeHarnessStats", "startSubagentCompletionRelays",
  "withGatewayCompletionContext", "readNativeSession", "lastAssistantText", "messageChannel", "result",
  range(patched, "        // gpt-live-host-owned-completion-context-v2", "        workerMessagesSnapshot = result.attempt.messagesSnapshot;")
);

async function runWorker(harness, { scope = harness.scope, sessionKey = parent, spawns = [spawn], onRead,
  attempt = { yieldDetected: true }, runtime } = {}) {
  const stats = {}, warnings = [];
  let promises;
  await workerBoundary(
    { agentHarnessTaskRuntimeScope: scope, agentId: "makaron", runId: "parent-run" }, sessionKey, spawns,
    { runtime: { subagent: harness.subagent }, logger: { warn: text => warnings.push(text) } },
    Promise.resolve({ t: harness.api.assertAgentHarnessTaskRuntimeScope }),
    Promise.resolve({ o: harness.api.withoutGatewayToolCallerIdentity }),
    Promise.resolve({ r: harness.api.getGatewayContextResolver, s: harness.api.withPluginRuntimeGatewayContextResolver }),
    Promise.resolve(runtime ?? { deliverAgentHarnessTaskCompletion: async args => {
      assert.equal(args.scope, scope); assert.equal(args.childSessionKey, child);
      assert.equal(args.requesterTurnRunId, "parent-run"); assert.equal(args.childRunId, spawn.runId);
      assert.equal(args.result, "2026-10-02 17:53:36 CST +0800");
      return harness.api.dispatchGatewayMethodInProcess("agent", { sessionKey, message: args.result }, { resolveGatewayContext: harness.resolver });
    } }),
    new Map(), { subagentCompletionRelay: stats },
    options => { promises = startSubagentCompletionRelays(options); },
    withGatewayCompletionContext,
    (agentId, key) => {
      assert.equal(harness.api.getGatewayToolCallerIdentity(), undefined);
      assert.equal(harness.api.getPluginRuntimeGatewayRequestScope().client, undefined);
      assert.equal(agentId, "makaron"); assert.equal(key, child); onRead?.();
      return { exists: true, sessionId: "child-id" };
    }, messages => messages.at(-1)?.text, "webchat", { attempt },
  );
  await Promise.all(promises);
  return { stats, warnings };
}

test("real plugin-auth HTTP scope overrides supplied scopes, reproducing agent.wait failure", async () => {
  const h = nativeHarness();
  await h.enter(async () => {
    const selected = h.api.resolveInProcessGatewayDispatch("agent.wait", { resolveGatewayContext: h.resolver });
    assert.equal(selected.client, h.pluginScope.client);
    await assert.rejects(h.subagent.waitForRun({ runId: spawn.runId }), /missing scope: operator.write/);
    assert.equal(h.trace.length, 0);
  });
});

test("patched Worker wait, child history and delivery use the same host-owned instance without admin", async () => {
  const h = nativeHarness();
  await h.enter(async () => {
    const caller = h.api.getGatewayToolCallerIdentity();
    const result = await runWorker(h);
    assert.equal(result.stats.delivered, 1, result.warnings.join("\n")); assert.equal(result.stats.failed, 0);
    assert.deepEqual(h.trace.map(row => row.method), ["agent.wait", "sessions.get", "agent"]);
    for (const row of h.trace) { assert.deepEqual(row.scopes, ["operator.write"]); assert.equal(row.instance, h.instance); }
    assert.equal(h.api.getPluginRuntimeGatewayRequestScope(), h.pluginScope);
    assert.equal(h.api.getGatewayToolCallerIdentity(), caller);
  });
});

test("missing or forged task scope rejects before wait and child history", async () => {
  for (const scope of [null, {}]) {
    const h = nativeHarness();
    const result = await h.enter(() => runWorker(h, { scope, onRead: () => assert.fail("child history must not be read") }));
    assert.equal(result.stats.failed, 1); assert.equal(h.trace.length, 0);
    assert.match(result.warnings[0], /host-issued/);
  }
});

test("a valid scope cannot continue a different requester session", async () => {
  const h = nativeHarness();
  const result = await h.enter(() => runWorker(h, { sessionKey: "agent:makaron:explicit:other" }));
  assert.equal(result.stats.failed, 1); assert.equal(h.trace.length, 0);
  assert.match(result.warnings[0], /does not own the requester/);
});

test("host scope with no resolver uses the existing subagent instance binding", async () => {
  const h = nativeHarness();
  const scope = h.api.createAgentHarnessTaskRuntimeScope({ requesterSessionKey: parent });
  const result = await h.enter(() => runWorker(h, { scope }));
  assert.equal(result.stats.delivered, 1);
  assert.equal(h.trace.every(row => row.instance === h.instance), true);
});

test("an expired task resolver never falls through to a newer subagent instance", async () => {
  const h = nativeHarness();
  h.api.bindGatewayContextResolver(h.scope, () => undefined);
  const result = await h.enter(() => runWorker(h));
  assert.equal(result.stats.failed, 1); assert.equal(h.trace.length, 0);
  assert.match(result.warnings[0], /binding is unavailable/);
});

test("instance expiry during wait rejects before history and delivery", async () => {
  const h = nativeHarness(); h.instance.onWait = h.expire;
  const result = await h.enter(() => runWorker(h, { onRead: () => assert.fail("expired instance must not read child history") }));
  assert.equal(result.stats.failed, 1);
  assert.deepEqual(h.trace.map(row => row.method), ["agent.wait"]);
});

test("wait failure restores original HTTP scope and caller identity", async () => {
  const h = nativeHarness(); h.instance.onWait = () => { throw new Error("fixture wait failed"); };
  await h.enter(async () => {
    const caller = h.api.getGatewayToolCallerIdentity();
    const result = await runWorker(h);
    assert.equal(result.stats.failed, 1); assert.match(result.warnings[0], /fixture wait failed/);
    assert.equal(h.api.getPluginRuntimeGatewayRequestScope(), h.pluginScope);
    assert.equal(h.api.getGatewayToolCallerIdentity(), caller);
  });
});

test("concurrent read-only request keeps its own scopes while completion detaches", async () => {
  const h = nativeHarness(); const readScope = { client: { connect: { scopes: ["operator.read"] } } };
  const [completed] = await Promise.all([
    h.enter(() => runWorker(h)),
    h.api.withPluginRuntimeGatewayRequestScope(readScope, async () => {
      await Promise.resolve();
      assert.equal(h.api.getPluginRuntimeGatewayRequestScope(), readScope);
      assert.deepEqual(Array.from(readScope.client.connect.scopes), ["operator.read"]);
      assert.equal(h.api.getGatewayToolCallerIdentity(), undefined);
    }),
  ]);
  assert.equal(completed.stats.delivered, 1);
});

test("duplicate accepted spawn still waits and delivers once", async () => {
  const h = nativeHarness();
  const result = await h.enter(() => runWorker(h, { spawns: [spawn, { ...spawn }] }));
  assert.equal(result.stats.started, 1); assert.equal(result.stats.delivered, 1);
  assert.equal(h.trace.length, 3);
});

test("Worker binds host receipts before any wait, including Gateway-owned children", async () => {
  const h = nativeHarness(); const order = [];
  const gatewaySpawn = { ...spawn, runId: "gateway-child-run", childSessionKey: "agent:makaron:subagent:gateway-child", vlabGatewayOwned: true };
  const spawns = [spawn, gatewaySpawn];
  h.instance.onWait = () => order.push("wait");
  const runtime = {
    bindGptLiveAgentHarnessVoiceSpawns(args) {
      order.push("bind");
      assert.equal(h.api.assertAgentHarnessTaskRuntimeScope(args.scope), h.scope);
      assert.equal(args.requesterTurnRunId, "parent-run");
      assert.equal(args.acceptedSessionSpawns, spawns);
      assert.equal(args.requesterYielded, true);
      return false; // Ordinary nonvoice receipts continue through the old relay.
    },
    async deliverAgentHarnessTaskCompletion(args) {
      order.push("deliver");
      assert.equal(args.requesterTurnRunId, "parent-run"); assert.equal(args.childRunId, spawn.runId);
      return h.api.dispatchGatewayMethodInProcess("agent", { sessionKey: parent, message: args.result }, { resolveGatewayContext: h.resolver });
    },
  };
  const result = await h.enter(() => runWorker(h, { runtime, spawns }));
  assert.equal(result.stats.delivered, 1); assert.equal(result.stats.started, 1);
  assert.deepEqual(order, ["bind", "wait", "deliver"]);
});

test("Worker forwards actual yieldDetected and compatibility yielded without truthy coercion", async () => {
  for (const [attempt, yielded] of [[{ yieldDetected: true }, true], [{ yielded: true }, true],
    [{ yieldDetected: false, yielded: false }, false], [{ yieldDetected: "true", yielded: 1 }, false]]) {
    const h = nativeHarness(); let received;
    await runWorker(h, { attempt, spawns: [], runtime: {
      bindGptLiveAgentHarnessVoiceSpawns(args) { received = args; return false; },
    } });
    assert.equal(received.requesterYielded, yielded);
    assert.equal(received.requesterTurnRunId, "parent-run");
  }
});

test("a rejected trusted SDK binding propagates before compatibility relays start", async () => {
  const h = nativeHarness();
  await assert.rejects(h.enter(() => runWorker(h, { runtime: {
    bindGptLiveAgentHarnessVoiceSpawns() { throw new Error("fixture causal identity changed"); },
    deliverAgentHarnessTaskCompletion: () => assert.fail("unbound receipts must never deliver"),
  } })), /causal identity changed/);
  assert.equal(h.trace.length, 0);
});

test("actual SDK binder and voice registry receive Worker parent/child identities under the real HTTP scope", async (t) => {
  const h = nativeHarness(); const listeners = new Map();
  const registry = createGptLiveConsultContinuationRegistry({
    getLifecycleGeneration: () => "fixture-generation", isLifecycleCurrent: value => value === "fixture-generation",
    subscribeRun: (id, callback) => { listeners.set(id, callback); return () => listeners.delete(id); },
    createProgressObserver: () => ({ close() {}, onPartialReply() {}, onAgentEvent() {} }),
  });
  const owner = registry.createOwner({ runId: "parent-run", sessionKey: parent, sessionId: "parent-id", agentId: "makaron", timeoutMs: 60000,
    continuationContext: { identity: { delegationItemId: "delegate-fixture", delegationGeneration: 1 },
      ownerConnId: "owner-fixture", voiceSessionId: "voice-fixture", ownerGeneration: "owner-generation", isCurrent: () => true },
    collectVisibleText: payloads => payloads.map(value => value.text).join("\n") });
  t.after(() => owner.abort(new Error("fixture cleanup")));
  const sdkSource = readFileSync(new URL("./fixtures/gpt-live-continuation/plugin-sdk/agent-harness-task-runtime.js", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(sdkSource).digest("hex"), "60913341429e7b6811d2dead24e0c9eaff49408f66d7049f026840f22fef9086");
  const sdk = patchGptLiveContinuationTaskSdk(sdkSource);
  const bind = new Function("assertAgentHarnessTaskRuntimeScope", "bindGptLiveHarnessVoiceSpawns", "loadRequesterSessionEntry",
    `${range(sdk, "function bindGptLiveAgentHarnessVoiceSpawns", "export {")}; return bindGptLiveAgentHarnessVoiceSpawns;`
  )(h.api.assertAgentHarnessTaskRuntimeScope, registry.bindHarnessSpawns,
    key => ({ entry: key === parent ? { sessionId: "parent-id" } : key === child ? { sessionId: "child-id" } : undefined }));
  assert.throws(() => bind({ scope: { ...h.scope }, requesterTurnRunId: "parent-run", acceptedSessionSpawns: [spawn] }), /host-issued/);
  let finished = false; const final = owner.wait().then(value => { finished = true; return value; });
  h.instance.onWait = async () => {
    assert.equal(listeners.has(spawn.runId), true, "accepted child listener must attach before waiting");
    owner.finishInitial({ meta: { yielded: true }, payloads: [{ text: "已交办" }] });
    await Promise.resolve(); assert.equal(finished, false, "initial acknowledgment is not the final");
  };
  const result = await h.enter(() => runWorker(h, { runtime: {
    bindGptLiveAgentHarnessVoiceSpawns: bind,
    async deliverAgentHarnessTaskCompletion(args) {
      const capability = registry.resolveHarnessCompletion({ ...args, requesterSessionKey: parent, requesterSessionId: "parent-id" });
      assert(capability, "only the exact accepted Worker child may resume this voice");
      assert.throws(() => registry.resolveHarnessCompletion({ ...args, requesterSessionKey: parent,
        requesterSessionId: "parent-id", childRunId: "unrelated-child" }), /causal identity changed/);
      capability.assertCurrent({ sessionKey: parent, sessionId: "parent-id" });
      capability.onAccepted({ runId: "resumed-parent-run" });
      const delivered = await h.api.dispatchGatewayMethodInProcess("agent", { sessionKey: parent, message: args.result }, { resolveGatewayContext: h.resolver });
      capability.finish({ meta: {}, payloads: [{ text: args.result }] });
      return delivered;
    },
  } }));
  assert.equal(result.stats.delivered, 1, result.warnings.join("\n"));
  assert.deepEqual(await final, { text: "2026-10-02 17:53:36 CST +0800" });
  assert.deepEqual(h.trace.map(row => row.method), ["agent.wait", "sessions.get", "agent"]);
  assert.equal(listeners.size, 0, "completed voice removes accepted child/resumed listeners");
});

test("patch and generated artifacts preserve all other Worker source", () => {
  assert.equal(patchGptLiveCompletionContextWorker(patched), patched);
  assert.throws(() => patchGptLiveCompletionContextWorker(before.replace("        startSubagentCompletionRelays({", "        drifted({")), /anchor drifted/);
  assert.equal(readFileSync(new URL("./release-files/gpt-live-completion-context/index.mjs", import.meta.url), "utf8"), patched);
  assert.equal(readFileSync(new URL("./release-files/gpt-live-completion-context/gateway-completion-context.mjs", import.meta.url), "utf8"), readFileSync(new URL("./gpt-live-completion-context.mjs", import.meta.url), "utf8"));
  const baseline = JSON.parse(readFileSync(new URL("./gpt-live-completion-context-baseline.json", import.meta.url)));
  for (const [name, hash] of Object.entries(baseline.fixtureSha256)) {
    assert.equal(createHash("sha256").update(fixture(name)).digest("hex"), hash);
  }
});
