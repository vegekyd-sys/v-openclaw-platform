import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { FILES, MARKER, buildFromDist, patchRegistry } from "./patch-subagent-activate-settled.mjs";

const repo = path.resolve(import.meta.dirname, "..");
// V's current bytes of the chunk (unchanged since turnend-registry-20261110; captured again in
// db91-lifecycle-proof-20261127).
const V_DIST = path.join(repo, "release/captured/db91-lifecycle-proof-20261127/dist");
const RELEASE = path.join(repo, "lab/release-files/subagent-activate-settled");
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const original = fs.readFileSync(path.join(V_DIST, FILES.registry.path), "utf8");

test("release file is V's bytes plus this patch, reproducibly", () => {
  assert.equal(sha256(original), FILES.registry.before);
  const out = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "activate-settled-"));
  const built = buildFromDist(V_DIST, out);
  const released = fs.readFileSync(path.join(RELEASE, FILES.registry.path), "utf8");
  assert.equal(released, fs.readFileSync(path.join(out, FILES.registry.path), "utf8"));
  assert.equal(sha256(released), built[FILES.registry.path].after);
  assert(released.includes(MARKER));
});

test("patching twice is refused and only the helper and one guard are added", () => {
  const patched = patchRegistry(original);
  assert.throws(() => patchRegistry(patched), /already patched/u);
  const before = original.split("\n");
  const after = patched.split("\n");
  assert.equal(after.length, before.length + 5);
  const added = after.filter((line) => !before.includes(line)).map((line) => line.trim());
  assert.deepEqual(added, [
    `// ${MARKER}: resumeSubagentRun returns without effect for these rows; skip their child session read.`,
    "function isSettledRunWithNothingToResume(entry) {",
    "return process.env.OPENCLAW_V_SUBAGENT_ACTIVATE_SETTLED !== \"0\" && Boolean(entry.cleanupCompletedAt) && !entry.requesterSettleWake && entry.terminalOwner !== \"interrupted-recovery\";",
    "if (isSettledRunWithNothingToResume(entry)) continue;",
  ]);
  // the guard sits right before the child read in activateRestoredRuns, after the queued-collector branch
  const guard = patched.indexOf("if (isSettledRunWithNothingToResume(entry)) continue;");
  const read = patched.indexOf("})?.abortedLastRun === true) continue;", guard);
  const activate = patched.lastIndexOf("function activateRestoredRuns()", guard);
  assert(activate > 0 && read > guard && patched.slice(guard, read).includes("storeCache: restoredSessionCache"));
  assert(!patched.slice(activate, guard).includes("function restoreSubagentRunsOnce"));
});

// Evaluate V's own resumeSubagentRun and the new predicate. Every free name resume could reach is a
// recording stub, so "skipping is a no-op" means: for every row the predicate accepts, V's resume
// returns without calling anything and without marking the run resumed.
function load() {
  const patched = patchRegistry(original);
  const slice = (start, end) => {
    const a = patched.indexOf(start);
    const b = patched.indexOf(end, a);
    assert(a >= 0 && b > a, `missing ${start}`);
    return patched.slice(a, b);
  };
  const predicate = slice("function isSettledRunWithNothingToResume(entry)", "function createSubagentRegistryRestorer");
  const resume = slice("function resumeSubagentRun(runId)", "const subagentRestorer = createSubagentRegistryRestorer");
  const calls = [];
  const sandbox = new Proxy({
    process: { env: {} }, Boolean, Date, Math, Number,
    subagentRuns: new Map(), resumedRuns: new Set(),
  }, {
    has: () => true,
    get(target, name) {
      if (name in target) return target[name];
      if (name === Symbol.unscopables) return undefined;
      return new Proxy(function stub() {}, {
        apply: (_f, _this, args) => { calls.push(String(name)); return undefined; },
        get: (_f, prop) => (prop === Symbol.toPrimitive ? () => 0 : (...args) => { calls.push(`${String(name)}.${String(prop)}`); return undefined; }),
      });
    },
  });
  const context = vm.createContext(sandbox);
  vm.runInContext(`${predicate}\n${resume}\nthis.isSettled = isSettledRunWithNothingToResume; this.resume = resumeSubagentRun;`, context);
  return { context, sandbox, calls };
}

const settledShapes = () => {
  const ended = { status: "terminal", startedAt: 1, endedAt: 2 };
  const shapes = [];
  for (const execution of [ended, { status: "running", startedAt: 1 }, { status: "terminal", startedAt: 1, endedAt: 0 }])
    for (const delivery of [undefined, { status: "not_required" }, { status: "delivered" }, { status: "pending", nextAttemptAt: Date.now() + 1e6 }, { status: "in_progress" }, { status: "failed" }])
      for (const expectsCompletionMessage of [undefined, true, false])
        for (const extra of [{}, { pauseReason: "sessions_yield" }, { killReconciliation: { phase: "x" } }, { collect: true }])
          shapes.push({ runId: "r", childSessionKey: "agent:makaron:subagent:x", cleanup: "keep", spawnMode: "run", cleanupCompletedAt: 3, execution, delivery, expectsCompletionMessage, ...extra });
  return shapes;
};

test("V's resume does nothing for every row the guard skips", () => {
  const { context, sandbox, calls } = load();
  let checked = 0;
  for (const entry of settledShapes()) {
    assert.equal(context.isSettled(entry), true);
    sandbox.subagentRuns.set("r", entry);
    sandbox.resumedRuns.clear();
    calls.length = 0;
    context.resume("r");
    assert.deepEqual(calls, [], `resume acted on ${JSON.stringify(entry)}`);
    assert.equal(sandbox.resumedRuns.size, 0);
    checked += 1;
  }
  assert.equal(checked, 216);
});

test("rows resume can still act on are not skipped", () => {
  const { context, sandbox, calls } = load();
  // the stubs do record: an ended run without cleanup that expects no message is given up on
  sandbox.subagentRuns.set("r", { runId: "r", childSessionKey: "k", execution: { status: "terminal", startedAt: 1, endedAt: 2 } });
  context.resume("r");
  assert.deepEqual(calls, ["isDeliverySuspended", "finalizeResumedAnnounceGiveUpInBackground"]);
  sandbox.resumedRuns.clear();
  const base = { runId: "r", childSessionKey: "k", cleanupCompletedAt: 3, execution: { status: "terminal", startedAt: 1, endedAt: 2 } };
  assert.equal(context.isSettled({ ...base, cleanupCompletedAt: undefined }), false);
  assert.equal(context.isSettled({ ...base, cleanupCompletedAt: 0 }), false);
  assert.equal(context.isSettled({ ...base, requesterSettleWake: { requesterYieldBatch: false } }), false);
  assert.equal(context.isSettled({ ...base, terminalOwner: "interrupted-recovery" }), false);
  // V's resume acts on these two, which is why they keep the read
  sandbox.subagentRuns.set("r", { ...base, terminalOwner: "interrupted-recovery" });
  context.resume("r");
  assert.equal(sandbox.resumedRuns.has("r"), true);
  sandbox.process.env.OPENCLAW_V_SUBAGENT_ACTIVATE_SETTLED = "0";
  assert.equal(context.isSettled(base), false);
});
