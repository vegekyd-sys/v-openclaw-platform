import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { startSubagentCompletionRelays } from "../../release/captured/v2026.9.1-db91.6-db91-shrink-reuse-20261002.worker/dist/subagent-completion-relay.mjs";
import {
  PATCH_MARKER,
  patchSessionsSpawnGatewayProxy,
} from "./patch-openclaw-sessions-spawn-gateway-proxy.mjs";

const fixture = `
/** sessions_spawn built-in tool. */
function createSessionsSpawnTool(opts) {
\treturn {
\t\texecute: async (_toolCallId, args) => {
\t\t\tconst params = args;
\t\t\tconst result = { status: "accepted", runId: "child" };
\t\t\trecordAcceptedSessionSpawn(result, "isolated");
\t\t\treturn { opts, params };
\t\t}
\t};
}
//#endregion
`;

const openClaw81Fixture = `
function createSessionsSpawnTool(opts) {
\treturn {
\t\tname: "sessions_spawn",
\t\texecute: async (_toolCallId, args) => {
\t\t\tconst params = args;
\t\t\tif (args.runtime === "acp") {
\t\t\t\tconst result = { status: "accepted", runId: "acp-child" };
\t\t\t\trecordAcceptedSessionSpawn(result, "isolated");
\t\t\t\treturn result;
\t\t\t}
\t\t\tconst result = { status: "accepted", runId: "subagent-child" };
\t\t\trecordAcceptedSessionSpawn(result, result.context);
\t\t\treturn { opts, params };
\t\t}
\t};
}
//#endregion
`;

test("moves Worker completion delivery to the external Harness bridge", () => {
  const result = patchSessionsSpawnGatewayProxy(fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(result.source, /external-harness-task-bridge-v1/);
  assert.match(result.source, /external-harness-task-record-v1/);
  assert.match(result.source, /expectsCompletionMessage: false/);
  assert.doesNotThrow(() => new Function(result.source));
});

test("patches every OpenClaw 2026.8.1 sessions_spawn branch", () => {
  const result = patchSessionsSpawnGatewayProxy(openClaw81Fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(result.source, /expectsCompletionMessage: false/);
  assert.equal(
    result.source.match(/recordExternalAcceptedSessionSpawn\(result, params,/g)
      ?.length,
    2,
  );
  assert.doesNotThrow(() => new Function(result.source));
});

const nativeSpawnSource = readFileSync(new URL(
  "../../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/sessions-spawn-tool-1FQMTkIo.js", import.meta.url,
), "utf8");
const nativeYieldSource = readFileSync(new URL(
  "../../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/openclaw-tools-BODVdJQD.js", import.meta.url,
), "utf8");
function nativeFunction(source, name, dependencies) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("//#endregion", start);
  assert(start >= 0 && end > start);
  return new Function("deps", `with(deps) { ${source.slice(start, end)}; return ${name}; }`)(dependencies);
}

function nativeHarness(source, { childStatus = "accepted" } = {}) {
  const parent = "agent:makaron:explicit:parent", parentRun = "parent-consult-run";
  const nativeCalls = [], facts = [], accepted = [];
  const enabled = Symbol.for("versa.vlab.external-harness-task-bridge-v1");
  const recorder = Symbol.for("versa.vlab.external-harness-task-record-v1");
  const yieldClaim = Symbol.for("versa.vlab.external-harness-task-yield-v1");
  const owners = Symbol.for("versa.vlab.external-harness-task-owners-v1");
  globalThis[enabled] = true;
  globalThis[recorder] = fact => {
    facts.push(fact);
    if (fact.requesterTurnRunId === parentRun && fact.parentSessionKey === parent) accepted.push(fact);
  };
  globalThis[yieldClaim] = input => input.requesterTurnRunId === parentRun &&
    input.requesterSessionKey === parent && accepted.length > 0;
  const spawnResult = (branch, params, context) => {
    nativeCalls.push({ branch, params, context });
    return { status: childStatus, runId: `${branch}-run`,
      childSessionKey: `agent:makaron:${branch === "visible" ? "dashboard" : "subagent"}:${branch}-child`,
      mode: "run", cleanup: "keep", context: "isolated" };
  };
  const jsonResult = details => ({ details, content: [{ type: "text", text: JSON.stringify(details) }] });
  const deps = {
    isAcpRuntimeSpawnAvailable: () => true,
    resolveSessionsSpawnThreadAvailability: () => ({ subagent: false, acp: false }),
    hasAnyThreadAvailability: () => false,
    parseAgentSessionKey: () => ({ agentId: "makaron" }),
    resolveSwarmConfig: () => ({ enabled: true }),
    getRuntimeConfig: () => ({}),
    resolveEffectiveSessionToolsVisibility: () => "all",
    resolveSandboxedSessionToolContext: () => ({ restrictToSpawned: false }),
    SESSIONS_SPAWN_TOOL_DISPLAY_SUMMARY: "spawn",
    SESSIONS_SPAWN_SUBAGENT_TOOL_DISPLAY_SUMMARY: "spawn",
    describeSessionsSpawnTool: () => "spawn",
    createSessionsSpawnToolSchema: () => ({}),
    captureAgentToolSourceExecutionGuard: () => () => {},
    ToolInputError: Error,
    UNSUPPORTED_SESSIONS_SPAWN_PARAM_KEYS: [],
    resolveSnakeCaseParamKey: () => undefined,
    readToolStringParam: (args, key) => args[key],
    readNonNegativeIntegerParam: (args, key) => args[key],
    normalizeSubagentTaskName: () => ({ taskName: undefined }),
    normalizeToolModelOverride: value => value,
    getSubagentDeliveryBacklogPressure: () => ({ blocked: false }),
    maybeSpawnVisibleSession: async params => params.raw.visible === true ?
      spawnResult("visible", params, params.options) : undefined,
    recordAcceptedSessionSpawn: () => {},
    addRoleToFailureResult: result => result,
    jsonResult,
    findAcpUnsupportedInheritedToolDeny: () => undefined,
    findAcpUnsupportedInheritedToolAllow: () => undefined,
    getGatewayToolCallerIdentity: () => undefined,
    loadAcpSpawnModule: async () => ({ spawnAcpDirect: async (params, context) => spawnResult("acp", params, context) }),
    resolveAcpSessionsSpawnImageAttachments: () => undefined,
    withParentExecutionIdentity: context => context,
    spawnSubagentDirect: async (params, context) => spawnResult("hidden", params, context),
    SWARM_CODE_MODE_IDEMPOTENCY_KEY: Symbol("swarm-key"),
    SWARM_CODE_MODE_REQUEST_FINGERPRINT: Symbol("swarm-fingerprint"),
  };
  const spawn = nativeFunction(source, "createSessionsSpawnTool", deps)({
    agentSessionKey: parent, requesterTurnRunId: parentRun, completionOwnerKey: parent,
  });
  let yieldCalls = 0;
  const yieldTool = nativeFunction(nativeYieldSource, "createSessionsYieldTool", {
    SessionsYieldToolSchema: {}, readToolStringParam: deps.readToolStringParam, jsonResult,
    NO_PENDING_CHILD_COMPLETION_ERROR: "No pending child completion is owned by this turn.",
  })({ sessionId: "parent-session-id", requesterSessionKey: parent, requesterTurnRunId: parentRun,
    claimYield: async () => false, onYield: async () => { yieldCalls += 1; } });
  return { parent, parentRun, spawn, yieldTool, nativeCalls, facts, accepted,
    yieldCalls: () => yieldCalls,
    cleanup: () => { for (const key of [enabled, recorder, yieldClaim, owners]) delete globalThis[key]; },
  };
}

test("captured native visible spawn reproduces the rejected yield without its accepted bridge", async () => {
  const h = nativeHarness(nativeSpawnSource);
  try {
    const spawn = await h.spawn.execute("visible-call", { task: "read-only child", visible: true });
    assert.equal(spawn.details.status, "accepted");
    assert.equal(h.nativeCalls[0].params.expectsCompletionMessage, false);
    assert.equal(h.facts.length, 0);
    assert.equal((await h.yieldTool.execute("yield", {})).details.status, "error");
    assert.equal(h.yieldCalls(), 0);
  } finally { h.cleanup(); }
});

test("captured native visible, ACP and hidden branches preserve exact accepted ownership and allow native yield", async () => {
  const patched = patchSessionsSpawnGatewayProxy(nativeSpawnSource);
  assert.equal(patched.changed, true);
  assert.equal(patchSessionsSpawnGatewayProxy(patched.source).changed, false);
  for (const [branch, extra] of [["visible", { visible: true }], ["acp", { runtime: "acp" }], ["hidden", {}]]) {
    const h = nativeHarness(patched.source);
    try {
      const result = await h.spawn.execute(`${branch}-call`, { task: "read-only child", label: "child",
        parentSessionKey: "forged-parent", requesterTurnRunId: "forged-run", ...extra });
      assert.equal(h.nativeCalls.length, 1);
      assert.equal(h.nativeCalls[0].params.expectsCompletionMessage, false, "Worker native delivery stays suppressed");
      assert.equal(result.details.expectsCompletionMessage, true);
      assert.match(result.details.note, /sessions_yield/);
      assert.equal(h.facts.length, 1);
      assert.equal(h.facts[0].requesterTurnRunId, h.parentRun);
      assert.equal(h.facts[0].parentSessionKey, h.parent);
      assert.equal(h.facts[0].runId, `${branch}-run`);
      assert.equal(h.facts[0].childSessionKey, result.details.childSessionKey);
      assert.equal(h.facts[0].task, "read-only child");
      assert.equal(h.facts[0].vlabCompletionExpected, true);
      assert.equal((await h.yieldTool.execute("yield", {})).details.status, "yielded");
      assert.equal(h.yieldCalls(), 1);
    } finally { h.cleanup(); }
  }
});

test("visible fire-and-forget and failed spawn do not enter the staged completion relay", async () => {
  const source = patchSessionsSpawnGatewayProxy(nativeSpawnSource).source;
  for (const childStatus of ["accepted", "error"]) {
    const h = nativeHarness(source, { childStatus });
    try {
      const result = await h.spawn.execute("visible-call", {
        task: "read-only child", visible: true, expectsCompletionMessage: false,
      });
      assert.equal(result.details.note, undefined);
      assert.equal(h.nativeCalls[0].params.expectsCompletionMessage, false);
      assert.equal(h.facts.length, childStatus === "accepted" ? 1 : 0);
      if (h.facts.length) assert.equal(h.facts[0].vlabCompletionExpected, false);
      const relays = startSubagentCompletionRelays({
        spawns: h.accepted, requesterSessionKey: h.parent,
        waitForRun: () => assert.fail("quiet/failed spawn must not wait"),
      });
      assert.equal(relays.length, 0);
    } finally { h.cleanup(); }
  }
});

test("partial upgraded visible branch fails closed rather than reporting already patched", () => {
  const source = patchSessionsSpawnGatewayProxy(nativeSpawnSource).source;
  const incomplete = source.replace(/\t+recordExternalAcceptedSessionSpawn\(visibleResult, params, externalReplyExpectsCompletion\);\n/, "");
  assert.notEqual(incomplete, source);
  assert.throws(() => patchSessionsSpawnGatewayProxy(incomplete), /partial.*branch bridge/);
});

test("a visible accepted receipt reaches the staged host relay once with its exact dashboard key", async () => {
  const h = nativeHarness(patchSessionsSpawnGatewayProxy(nativeSpawnSource).source);
  try {
    await h.spawn.execute("visible-call", { task: "read-only child", visible: true });
    assert.equal((await h.yieldTool.execute("yield", {})).details.status, "yielded");
    const active = new Map(), stats = {}, deliveries = [];
    const options = { spawns: h.accepted, requesterSessionKey: h.parent, active, stats,
      waitForRun: async ({ runId }) => { assert.equal(runId, "visible-run"); return { status: "ok" }; },
      deliverHarnessTaskCompletion: async ({ spawn, outcome }) => {
        assert.equal(spawn, h.facts[0]); assert.equal(spawn.requesterTurnRunId, h.parentRun);
        assert.equal(spawn.childSessionKey, "agent:makaron:dashboard:visible-child");
        assert.deepEqual(outcome, { status: "ok" }); deliveries.push(spawn); return { delivered: true };
      },
    };
    await Promise.all(startSubagentCompletionRelays(options));
    await Promise.all(startSubagentCompletionRelays(options));
    assert.equal(deliveries.length, 1); assert.equal(stats.started, 1); assert.equal(stats.delivered, 1);
  } finally { h.cleanup(); }
});

test("sessions_spawn external Harness patch is idempotent", () => {
  const once = patchSessionsSpawnGatewayProxy(fixture);
  const twice = patchSessionsSpawnGatewayProxy(once.source);
  assert.equal(twice.changed, false);
  assert.equal(twice.source, once.source);
});

test("preserves the 9.1 abort signal and source-execution guard", () => {
  const guard = 'const assertActive = captureAgentToolSourceExecutionGuard(signal);';
  const source = openClaw81Fixture.replace('(_toolCallId, args)', '(_toolCallId, args, signal)')
    .replace('const params = args;', `${guard}\n\t\t\tconst params = args;`);
  const result = patchSessionsSpawnGatewayProxy(source);
  assert.match(result.source, /execute: async \(_toolCallId, args, signal\)/);
  assert.ok(result.source.includes(guard));
  assert.doesNotThrow(() => new Function(result.source));
  assert.equal(patchSessionsSpawnGatewayProxy(result.source).changed, false);
});

test("external completion changes only public reply semantics, not native ownership", async () => {
  const enabled = Symbol.for('versa.vlab.external-harness-task-bridge-v1');
  const recorder = Symbol.for('versa.vlab.external-harness-task-record-v1');
  const facts = [];
  globalThis[enabled] = true;
  globalThis[recorder] = f => facts.push(f);
  try {
    const source = fixture.replace('return { opts, params };', 'return { result, nativeParams: params };');
    const create = new Function('recordAcceptedSessionSpawn', patchSessionsSpawnGatewayProxy(source).source + '\nreturn createSessionsSpawnTool;')(() => {});
    const tool = create({agentSessionKey:'agent:test:parent'});
    const normal = await tool.execute('call', {task:'test'});
    assert.equal(normal.nativeParams.expectsCompletionMessage, false);
    assert.equal(normal.result.expectsCompletionMessage, true);
    assert.match(normal.result.note, /sessions_yield/);
    assert.equal(facts[0].vlabCompletionExpected, true);
    const quiet = await tool.execute('call2', {task:'test', expectsCompletionMessage:false});
    assert.equal(quiet.nativeParams.expectsCompletionMessage, false);
    assert.equal(facts[1].vlabCompletionExpected, false);
    const collected = await tool.execute('call3', {task:'test', collect:true});
    assert.equal(facts[2].vlabCompletionExpected, false);
    assert.equal(collected.result.note, undefined);
  } finally {
    delete globalThis[enabled]; delete globalThis[recorder];
    delete globalThis[Symbol.for('versa.vlab.external-harness-task-owners-v1')];
  }
});
