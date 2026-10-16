import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BASELINE_SOURCE, OUTPUT_SOURCE, HELPER, patchSubagentCompletionProjection } from "./patch-subagent-completion-projection.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const baseline = fs.readFileSync(path.join(root, BASELINE_SOURCE), "utf8");
const patched = patchSubagentCompletionProjection(baseline);
const target = { agentId: "makaron", sessionId: "parent-id", sessionKey: "agent:makaron:feishu:group:test", storePath: "/private/candidate/sessions.json" };

function harness({ sourceTool = "agent_harness_task", kind = "inter_session", wait, actualTarget = target, controller = new AbortController(), initialWriter } = {}) {
  const observed = { imports: 0, waits: 0, reads: 0, prompts: 0, ownerChecks: 0 };
  const attempt = { sessionId: target.sessionId, sessionKey: target.sessionKey, inputProvenance: { kind, sourceTool }, abortSignal: controller.signal };
  const input = { attempt, sessionTarget: actualTarget, initialWriter, externalAbortController: { throwIfFired() { observed.ownerChecks++; controller.signal.throwIfAborted(); } } };
  const helper = new Function("getReconciler", `${HELPER.replace('await import("./session-transcript-reconcile-DFsDtc9l.js")', "await getReconciler()")}; return waitForSubagentCompletionProjection;`)(async () => {
    observed.imports++;
    return { waitForSessionTranscriptProjection: async (scope, signal, options) => {
      observed.waits++;
      assert.equal(scope, actualTarget); assert.equal(signal, controller.signal);
      options.assertActive();
      await wait?.({ scope, signal, options, controller });
      options.assertActive();
    } };
  });
  const run = async () => {
    await helper(input);
    observed.reads++;
    observed.prompts++;
    return "continued-once";
  };
  return { helper, input, run, observed, controller };
}

test("deterministic patch preserves all existing code and inserts the wait before transcript lifecycle/write ownership", () => {
  assert.equal(patchSubagentCompletionProjection(patched), patched);
  assert.equal(fs.readFileSync(path.join(root, OUTPUT_SOURCE), "utf8"), patched);
  assert.throws(() => patchSubagentCompletionProjection(baseline + "\n"), /baseline drifted/);
  const call = patched.indexOf("await waitForSubagentCompletionProjection({ attempt, sessionTarget");
  assert(call > patched.indexOf("const sessionTarget = await resolveAgentRunSessionTarget", patched.indexOf("async function prepareEmbeddedAttemptTranscriptLifecycle")));
  assert(call < patched.indexOf("const transcriptLifecycle = createEmbeddedAttemptTranscriptLifecycle", call));
  assert(!HELPER.includes("activeSession.prompt"));
  assert(!HELPER.includes("withOwnedSessionTranscriptWrites"));
});

for (const sourceTool of ["subagent_announce", "agent_harness_task"]) test(`${sourceTool} waits for readiness before reading or prompting once`, async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const h = harness({ sourceTool, wait: () => gate });
  const pending = h.run();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.observed.waits, 1); assert.equal(h.observed.reads, 0); assert.equal(h.observed.prompts, 0);
  release();
  assert.equal(await pending, "continued-once");
  assert.equal(h.observed.prompts, 1); assert.equal(h.observed.reads, 1);
});

test("ordinary messages and unrelated inter-session tools retain the original path", async () => {
  for (const [kind, sourceTool] of [["external_user", "subagent_announce"], ["inter_session", "sessions_send"], ["inter_session", "message"], [undefined, undefined]]) {
    const h = harness({ kind: kind ?? "none", sourceTool: sourceTool ?? "none" });
    await h.run(); assert.equal(h.observed.waits, 0); assert.equal(h.observed.imports, 0); assert.equal(h.observed.prompts, 1);
  }
});

test("a completion queued while its predecessor runs checks the later projection generation", async () => {
  let generation = 8, indexed = 8, checks = 0;
  const h = harness({ wait: () => { checks++; assert.equal(generation, 9); assert.equal(indexed, 8); indexed = generation; } });
  // Queueing the request must not perform the readiness check. The predecessor
  // writes a new leaf while this request is still queued.
  assert.equal(checks, 0); generation++;
  await h.run();
  assert.equal(checks, 1); assert.equal(indexed, 9); assert.equal(h.observed.prompts, 1);
});

test("cancellation before preparation never imports the reconciler or starts the model", async () => {
  const controller = new AbortController(); const error = new Error("cancelled before preparation"); controller.abort(error);
  const h = harness({ controller });
  await assert.rejects(h.run(), (e) => e === error);
  assert.equal(h.observed.imports, 0); assert.equal(h.observed.prompts, 0);
});

test("cancellation during the wait propagates without replay or a model call", async () => {
  const error = new Error("cancelled while rebuilding");
  const h = harness({ wait: ({ controller }) => controller.abort(error) });
  await assert.rejects(h.run(), (e) => e === error);
  assert.equal(h.observed.waits, 1); assert.equal(h.observed.reads, 0); assert.equal(h.observed.prompts, 0);
});

test("writer ownership lost during the wait cannot continue", async () => {
  let active = true; const error = new Error("writer claim rebound");
  const h = harness({ initialWriter: { assertActive() { if (!active) throw error; } }, wait: () => { active = false; } });
  await assert.rejects(h.run(), (e) => e === error); assert.equal(h.observed.prompts, 0);
});

test("another session or an incomplete target is rejected before a database read", async () => {
  for (const actualTarget of [undefined, {}, { ...target, sessionId: "other" }, { ...target, sessionKey: "agent:other:main" }, { ...target, storePath: undefined }]) {
    const h = harness({ actualTarget: actualTarget ?? null });
    await assert.rejects(h.run(), /admitted session target/);
    assert.equal(h.observed.imports, 0); assert.equal(h.observed.prompts, 0);
  }
});

test("native timeout and unrelated database errors propagate without retrying the attempt", async () => {
  for (const error of [Object.assign(new Error("rebuilding"), { name: "SessionTranscriptProjectionUnavailableError", projectionWait: { timeoutMs: 15000 } }), new Error("SQLITE_IOERR")]) {
    const h = harness({ wait: () => { throw error; } });
    await assert.rejects(h.run(), (e) => e === error);
    assert.equal(h.observed.waits, 1); assert.equal(h.observed.prompts, 0);
  }
});

test("actual patched attempt lifecycle waits before creating its writer context; the baseline does not", async () => {
  function prepareHarness(source, wait) {
    const start = source.indexOf("async function prepareEmbeddedAttemptTranscriptLifecycle(input) {");
    const end = source.indexOf("\n//#endregion", start);
    const body = source.slice(start, end);
    const observed = { waits: 0, lifecycleCreated: 0, armed: 0, writes: 0 };
    const prepare = new Function("getOwnedSessionTranscriptInitialWriter", "resolveAgentRunSessionTarget", "createEmbeddedAttemptTranscriptLifecycle", "withOwnedSessionTranscriptWrites", "resolveCompactionTimeoutMs", "waitForSubagentCompletionProjection", `return (${body});`)(
      () => undefined,
      async () => target,
      () => { observed.lifecycleCreated++; return { withTranscriptWrite: async (fn) => { observed.writes++; return fn(); }, dispose: async () => {} }; },
      async (_, fn) => fn(),
      () => 10000,
      async (input) => { observed.waits++; assert.equal(input.sessionTarget, target); await wait?.(); },
    );
    return { observed, run: () => prepare({ attempt: { ...target }, externalAbortController: { throwIfFiredAfterPrepCleanup: async () => {}, arm: () => { observed.armed++; } } }) };
  }
  const before = prepareHarness(baseline);
  await before.run(); assert.equal(before.observed.waits, 0); assert.equal(before.observed.lifecycleCreated, 1);
  let release;
  const gate = new Promise((r) => { release = r; });
  const after = prepareHarness(patched, () => gate);
  const pending = after.run();
  await new Promise((r) => setImmediate(r));
  assert.equal(after.observed.waits, 1); assert.equal(after.observed.lifecycleCreated, 0); assert.equal(after.observed.writes, 0);
  release();
  const result = await pending;
  assert.equal(result.ownedTranscriptWriteContext.sessionTarget.sessionId, target.sessionId);
  assert.equal(after.observed.lifecycleCreated, 1); assert.equal(after.observed.writes, 0);
});
