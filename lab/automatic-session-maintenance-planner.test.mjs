import test from "node:test";
import assert from "node:assert/strict";
import { filterAutomaticSessionMaintenancePlan, runAutomaticSessionMaintenancePlan } from "./release-files/automatic-session-maintenance-planner.mjs";

const request = {
  activeSessionKeys: ["agent:makaron:explicit:test"],
  agentId: "makaron",
  archiveDirectory: "/fixture/archive",
  maintenanceConfig: { mode: "enforce" },
  storePath: "/fixture/sessions.json",
};

test("maintenance planner keeps synchronous work off the caller event loop", async () => {
  let turns = 0;
  const timer = setInterval(() => turns += 1, 10);
  try {
    const plan = await runAutomaticSessionMaintenancePlan({...request, testBusyMs: 160}, {
      workerUrl: new URL("./fixtures/automatic-session-maintenance.echo-worker.mjs", import.meta.url),
    });
    assert.deepEqual(plan.entryRemovals, []);
    assert(turns >= 5, `expected the main loop to advance, saw ${turns} turns`);
  } finally {
    clearInterval(timer);
  }
});

test("maintenance planner rejects malformed requests before spawning", async () => {
  assert.throws(() => runAutomaticSessionMaintenancePlan({...request, storePath: "relative"}), /absolute path/);
  assert.throws(() => runAutomaticSessionMaintenancePlan({...request, maintenanceConfig: undefined}), /resolved maintenanceConfig/);
});

test("maintenance planner rejects malformed worker plans", async () => {
  class FakeWorker {
    #listeners = new Map();
    once(name, listener) { this.#listeners.set(name, listener); return this; }
    removeAllListeners() { this.#listeners.clear(); }
    terminate() {}
    start() {
      queueMicrotask(() => {
        this.#listeners.get("message")?.({type: "result", plan: {}});
        this.#listeners.get("exit")?.(0);
      });
    }
  }
  let fake;
  const result = runAutomaticSessionMaintenancePlan(request, {createWorker: () => {
    fake = new FakeWorker();
    queueMicrotask(() => fake.start());
    return fake;
  }});
  await assert.rejects(result, /missing entryRemovals/);
});

test("maintenance planner rejects incomplete or duplicate archive byte sizes", async () => {
  class FakeWorker {
    #listeners = new Map();
    constructor(plan) { this.plan = plan; }
    once(name, listener) { this.#listeners.set(name, listener); return this; }
    removeAllListeners() { this.#listeners.clear(); }
    terminate() {}
    start() {
      queueMicrotask(() => {
        this.#listeners.get("message")?.({type: "result", plan: this.plan});
        this.#listeners.get("exit")?.(0);
      });
    }
  }
  const base = { archived: 0, capped: 0, entryRemovals: [], modelRunPruned: 0, pruned: 0,
    stateDeletePlans: [{sessionId: "archive-me", archiveTranscript: true}] };
  for (const sizes of [[], [["archive-me", 1], ["archive-me", 2]]]) {
    let fake;
    const result = runAutomaticSessionMaintenancePlan(request, {createWorker: () => {
      fake = new FakeWorker({...base, automaticArchiveBytesBySessionId: sizes});
      queueMicrotask(() => fake.start());
      return fake;
    }});
    await assert.rejects(result, /archive byte size/);
  }
});

test("late active admissions are removed from every destructive plan surface", () => {
  const keep = {sessionKey: "agent:makaron:explicit:keep", expectedEntry: {sessionId: "keep-id"}};
  const remove = {sessionKey: "agent:makaron:explicit:remove", expectedEntry: {sessionId: "remove-id"}};
  const plan = filterAutomaticSessionMaintenancePlan({
    archived: 2,
    capped: 0,
    entryRemovals: [keep, remove],
    modelRunPruned: 0,
    plannedEntryArchives: [keep, remove],
    pruned: 2,
    stateDeletePlans: [{sessionId: "keep-id"}, {sessionId: "remove-id"}],
    automaticArchiveBytesBySessionId: [["keep-id", 10], ["remove-id", 20]],
    archivedWorktrees: [{sessionKey: keep.sessionKey, entry: keep.expectedEntry}, {sessionKey: remove.sessionKey, entry: remove.expectedEntry}],
  }, new Set([keep.sessionKey, "keep-id"]));
  assert.deepEqual(plan.entryRemovals, [remove]);
  assert.deepEqual(plan.plannedEntryArchives, [remove]);
  assert.deepEqual(plan.stateDeletePlans, [{sessionId: "remove-id"}]);
  assert.deepEqual(plan.automaticArchiveBytesBySessionId, [["remove-id", 20]]);
  assert.deepEqual(plan.archivedWorktrees, [{sessionKey: remove.sessionKey, entry: remove.expectedEntry}]);
  assert.equal(plan.archived, 1);
});
