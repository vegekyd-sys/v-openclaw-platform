import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GPT_LIVE_PROJECTION_ACCESSOR_BEFORE, GPT_LIVE_PROJECTION_DFS_BEFORE,
  GPT_LIVE_PROJECTION_RECONCILE_BEFORE, patchGptLiveProjectionReadinessBuiltin,
  patchGptLiveProjectionReadinessReconcile,
} from "./patch-gpt-live-projection-readiness.mjs";
import { patchGptLiveVoiceToolOrderBuiltin } from "./patch-gpt-live-voice-tool-order.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const captured = path.join(root, "release/captured/v2026.9.1-db91.6-memory-search-guards-20261002/dist");
const read = (filename) => fs.readFileSync(filename, "utf8");
const sha = (source) => createHash("sha256").update(source).digest("hex");
const original = read(path.join(captured, "session-transcript-reconcile-j5qhAafV.js"));
const patched = patchGptLiveProjectionReadinessReconcile(original);
const builtinOriginal = read(path.join(root, "lab/fixtures/gpt-live-voice-tool-order/builtin-openclaw-zQV8Wwjr.js"));
const builtinAdmitted = patchGptLiveVoiceToolOrderBuiltin(builtinOriginal);
const builtinPatched = patchGptLiveProjectionReadinessBuiltin(builtinAdmitted);
class ProjectionUnavailable extends Error {
  constructor(sessionId) { super(`Session transcript projection is rebuilding: ${sessionId}`); this.name = "SessionTranscriptProjectionUnavailableError"; this.sessionId = sessionId; }
}

// Execute the exact generated native wait with deterministic read-only database
// witnesses. No Gateway/provider/model or synthetic native event is involved.
function waitHarness({ localRunning = false, dirty = true, latestSeq = 7, indexedSeq = 6, unclassified = false, onTick, guardError } = {}) {
  let now = 0;
  const db = { dirty, latestSeq, indexedSeq, unclassified };
  const observed = { nativeRebuildRequests: 0, guardReads: [], polls: 0, mapReads: 0, log: [] };
  const readinessModule = {
    C(scope, fn) {
      observed.guardReads.push({ sessionId: scope.sessionId, latestSeq: db.latestSeq, indexedSeq: db.indexedSeq });
      if (guardError) throw guardError;
      if (db.dirty || db.latestSeq !== db.indexedSeq || db.unclassified) {
        observed.nativeRebuildRequests += 1;
        throw new ProjectionUnavailable(scope.sessionId);
      }
      return fn({ state: { indexedSeq: db.indexedSeq } });
    },
    T(error) { return error instanceof ProjectionUnavailable; },
  };
  let fn = patched.slice(patched.indexOf("async function waitForSessionTranscriptProjection("), patched.indexOf("\n//#endregion", patched.indexOf("async function waitForSessionTranscriptProjection(")));
  fn = fn.replace('await import("./session-accessor-K0XuW6ln.js")', "await Promise.resolve(readinessModule)");
  const wait = new Function("resolveSqliteTranscriptReadScope", "toDatabaseOptions", "openOpenClawAgentDatabase", "sessionTranscriptIndexNeedsReconcile", "isSessionTranscriptIndexReconcileRunning", "setTimeout", "PROJECTION_READY_POLL_MS", "performance", "readinessModule", "log", `return (${fn});`)(
    (scope) => ({ ...scope }), (scope) => scope, () => ({ db }), (actual, sessionId) => {
      assert.equal(actual, db); assert.equal(sessionId, "owned-session"); return db.dirty;
    }, () => { observed.mapReads += 1; return localRunning; },
    async (ms, unused, options) => { options?.signal.throwIfAborted(); now += ms; observed.polls += 1; onTick?.(db, observed, now); options?.signal.throwIfAborted(); },
    10, { now: () => now }, readinessModule, { debug: (message) => observed.log.push(message) },
  );
  return { wait, db, observed, scope: { sessionId: "owned-session", agentId: "makaron" } };
}

function promptHarness({ admitted = true, target = { sessionId: "owned-session" }, wait, signal, assertActive } = {}) {
  const controller = new AbortController();
  const handle = { isStopped: () => false };
  const attempt = { runId: "actual-run", sessionId: "owned-session" };
  const activeRuns = new Map([[attempt.runId, handle]]);
  const observed = { prompts: 0, writes: 0, imports: 0, waits: 0 };
  const activeSession = { prompt: async () => { observed.prompts += 1; return "real-prompt-result"; } };
  if (admitted) activeSession[Symbol.for("openclaw.gptLive.projectionReadiness")] = true;
  const input = { runAbortController: { signal: signal ?? controller.signal }, sessionLock: { ownedTranscriptWriteContext: "owned-context" } };
  const queueHandleRef = { current: handle };
  let fn = builtinPatched.slice(builtinPatched.indexOf("\tconst promptActiveSession = async"), builtinPatched.indexOf("\n\tconst onBlockReply =", builtinPatched.indexOf("\tconst promptActiveSession = async")));
  fn = fn.replace('await import("./session-transcript-reconcile-DFsDtc9l.js")', "await getReconciler()");
  const prompt = new Function("activeSession", "input", "attempt", "queueHandleRef", "ACTIVE_EMBEDDED_RUNS_BY_RUN_ID", "assertActive", "sessionManager", "getReconciler", "withOwnedSessionTranscriptWrites", "abortable$1", "trackPromptSettlePromise", `${fn}\nreturn promptActiveSession;`)(
    activeSession, input, attempt, queueHandleRef, activeRuns, assertActive ?? (() => {}), { getSessionTarget: () => target },
    async () => { observed.imports += 1; return { waitForSessionTranscriptProjection: async (scope, actualSignal, options) => { observed.waits += 1; assert.equal(scope, target); assert.equal(actualSignal, input.runAbortController.signal); return wait?.({ scope, signal: actualSignal, options, activeRuns, handle, queueHandleRef, controller }); } }; },
    async (context, fn) => { assert.equal(context, "owned-context"); observed.writes += 1; return fn(); }, (promise) => promise, (promise) => promise,
  );
  return { prompt, observed, activeRuns, handle, queueHandleRef, controller };
}

test("captured reconciler, alias and hard snapshot accessor are exact pinned native sources", () => {
  assert.equal(sha(original), GPT_LIVE_PROJECTION_RECONCILE_BEFORE);
  const alias = read(path.join(root, "lab/fixtures/gpt-live-projection-readiness/session-transcript-reconcile-DFsDtc9l.js"));
  assert.equal(sha(alias), GPT_LIVE_PROJECTION_DFS_BEFORE);
  assert.match(alias, /a as waitForSessionTranscriptProjection.*from "\.\/session-transcript-reconcile-j5qhAafV\.js"/);
  const accessor = read(path.join(captured, "session-accessor-K0XuW6ln.js"));
  assert.equal(sha(accessor), GPT_LIVE_PROJECTION_ACCESSOR_BEFORE);
  assert.match(accessor, /!snapshot\.state\.needsRebuild && snapshot\.state\.indexedSeq === snapshot\.latestSeq && !hasUnclassifiedSessionTranscriptEvents/);
});
test("patches are idempotent, anchored and preserve the trusted voice stack", () => {
  assert.equal(patchGptLiveProjectionReadinessReconcile(patched), patched);
  assert.equal(patchGptLiveProjectionReadinessBuiltin(builtinPatched), builtinPatched);
  assert.throws(() => patchGptLiveProjectionReadinessReconcile(`${original}\n`), /drifted/);
  assert.throws(() => patchGptLiveProjectionReadinessBuiltin(builtinOriginal), /trusted native voice/);
  assert.throws(() => patchGptLiveProjectionReadinessBuiltin(builtinAdmitted.replace("const promptActiveSession =", "const driftedPrompt =")), /anchor drifted/);
  assert.match(builtinPatched, /agent\.toolExecution = "sequential"/);
  assert.match(builtinPatched, /registered, current native voice admission/);
});
test("empty local Map cannot let a cross-process dirty projection through", async () => {
  const h = waitHarness({ localRunning: false, onTick: (db, obs) => { if (obs.polls === 3) { db.dirty = false; db.indexedSeq = db.latestSeq; } } });
  const proof = await h.wait(h.scope);
  assert.equal(proof.waitMs, 30); assert.equal(proof.indexedSeq, 7);
  assert.equal(h.observed.mapReads, 0); assert.equal(h.observed.nativeRebuildRequests, 1);
  assert.equal(h.observed.guardReads.length, 2);
});
test("Map still running does not delay an already current requested session", async () => {
  const h = waitHarness({ localRunning: true, dirty: false, latestSeq: 9, indexedSeq: 9 });
  assert.equal((await h.wait(h.scope)).indexedSeq, 9);
  assert.equal(h.observed.polls, 0); assert.equal(h.observed.mapReads, 0);
});
test("hard snapshot catches flag-clear generation race and returns the latest generation", async () => {
  const h = waitHarness({ dirty: false, latestSeq: 8, indexedSeq: 7, onTick: (db, obs) => {
    if (obs.polls === 1) { db.latestSeq = 10; db.indexedSeq = 8; }
    if (obs.polls === 2) db.indexedSeq = 10;
  } });
  const proof = await h.wait(h.scope);
  assert.equal(proof.indexedSeq, 10); assert.equal(proof.waitMs, 20);
  assert.deepEqual(h.observed.guardReads.map((x) => [x.latestSeq, x.indexedSeq]), [[8, 7], [10, 8], [10, 10]]);
});
test("unclassified native events remain unavailable despite equal sequence numbers", async () => {
  const h = waitHarness({ dirty: false, latestSeq: 7, indexedSeq: 7, unclassified: true, onTick: (db) => { db.unclassified = false; } });
  assert.equal((await h.wait(h.scope)).waitMs, 10); assert.equal(h.observed.nativeRebuildRequests, 1);
});
test("already aborted owner never reads projection", async () => {
  const h = waitHarness(); const c = new AbortController(); c.abort(new Error("owned request cancelled"));
  await assert.rejects(h.wait(h.scope, c.signal), /owned request cancelled/);
  assert.equal(h.observed.guardReads.length, 0);
});
test("abort during cross-process wait does not hand off to model", async () => {
  const c = new AbortController(); const h = waitHarness({ onTick: () => c.abort(new Error("cancelled while rebuilding")) });
  await assert.rejects(h.wait(h.scope, c.signal), /cancelled while rebuilding/);
  assert.equal(h.observed.guardReads.length, 1);
});
test("owner generation revoked during wait stops before ready projection", async () => {
  let current = true;
  const h = waitHarness({ onTick: (db) => { current = false; db.dirty = false; db.indexedSeq = db.latestSeq; } });
  await assert.rejects(h.wait(h.scope, undefined, { assertActive: () => current }), /owner is no longer active/);
  assert.equal(h.observed.guardReads.length, 1);
});
test("generic accessor failure is surfaced once and never retried", async () => {
  const error = new Error("native database read failed"); const h = waitHarness({ guardError: error });
  await assert.rejects(h.wait(h.scope), (actual) => actual === error);
  assert.equal(h.observed.guardReads.length, 1); assert.equal(h.observed.polls, 0);
});
test("structured rebuilding error for another session is not retried", async () => {
  const error = new ProjectionUnavailable("other-session"); const h = waitHarness({ guardError: error });
  await assert.rejects(h.wait(h.scope), (actual) => actual === error);
  assert.equal(h.observed.polls, 0);
});
test("stuck native projection fails after 15 seconds with real structured error", async () => {
  const h = waitHarness();
  await assert.rejects(h.wait(h.scope), (error) => {
    assert(error instanceof ProjectionUnavailable); assert.equal(error.sessionId, h.scope.sessionId);
    assert.deepEqual(error.projectionWait, { phase: "before-model", sessionId: "owned-session", timeoutMs: 15000, elapsedMs: 15000, polls: 1500 });
    return true;
  });
  assert.equal(h.observed.guardReads.length, 1); assert.equal(h.observed.nativeRebuildRequests, 1);
});
test("admitted voice waits before transcript write context and prompts exactly once", async () => {
  let h;
  h = promptHarness({ wait: async ({ options }) => { options.assertActive(); assert.equal(h.observed.writes, 0); assert.equal(h.observed.prompts, 0); } });
  assert.equal(await h.prompt("whole original USER", {}), "real-prompt-result");
  assert.deepEqual(h.observed, { prompts: 1, writes: 1, imports: 1, waits: 1 });
});
test("ordinary nonvoice prompt keeps original path without extra read/import/wait", async () => {
  const h = promptHarness({ admitted: false });
  assert.equal(await h.prompt("ordinary message", {}), "real-prompt-result");
  assert.deepEqual(h.observed, { prompts: 1, writes: 1, imports: 0, waits: 0 });
});
test("voice cannot proceed with old queue handle", async () => {
  const h = promptHarness(); h.activeRuns.set("actual-run", {});
  await assert.rejects(h.prompt("message"), /owner is no longer active/); assert.equal(h.observed.prompts, 0);
});
test("stopped voice owner cannot proceed", async () => {
  const h = promptHarness(); h.handle.isStopped = () => true;
  await assert.rejects(h.prompt("message"), /owner is no longer active/); assert.equal(h.observed.prompts, 0);
});
test("admitted run generation is rechecked before native wait", async () => {
  const h = promptHarness({ assertActive: () => { throw new Error("actual admitted run changed"); } });
  await assert.rejects(h.prompt("message"), /actual admitted run changed/); assert.equal(h.observed.imports, 0); assert.equal(h.observed.prompts, 0);
});
test("actual queue replacement during wait prevents model execution", async () => {
  const h = promptHarness({ wait: ({ activeRuns, options }) => { activeRuns.set("actual-run", {}); options.assertActive(); } });
  await assert.rejects(h.prompt("message"), /owner is no longer active/); assert.equal(h.observed.prompts, 0);
});
test("run abort after wait prevents model execution", async () => {
  const h = promptHarness({ wait: ({ controller }) => controller.abort(new Error("owner aborted")) });
  await assert.rejects(h.prompt("message"), /owner aborted/); assert.equal(h.observed.prompts, 0);
});
test("foreign session target is never read", async () => {
  const h = promptHarness({ target: { sessionId: "other-session" } });
  await assert.rejects(h.prompt("message"), /admitted session target/); assert.equal(h.observed.imports, 0); assert.equal(h.observed.prompts, 0);
});
test("projection timeout never retries provider prompt or tools", async () => {
  const error = new ProjectionUnavailable("owned-session");
  const h = promptHarness({ wait: () => { throw error; } });
  await assert.rejects(h.prompt("message"), (actual) => actual === error);
  assert.equal(h.observed.waits, 1); assert.equal(h.observed.prompts, 0); assert.equal(h.observed.writes, 0);
});
