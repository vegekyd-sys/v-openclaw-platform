import test from "node:test";
import assert from "node:assert/strict";
import { boundAutomaticSessionMaintenancePlan, filterAutomaticSessionMaintenancePlan, runAutomaticSessionMaintenancePlan } from "./release-files/automatic-session-maintenance-planner.mjs";

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

test("automatic plans cross the process boundary one native batch at a time", () => {
  const entryRemovals = Array.from({length: 100}, (_, index) => ({
    expectedEntry: {sessionId: `session-${index}`},
    maintenanceReason: ["capped", "pruned", "model-run-pruned"][index % 3],
    sessionKey: `key-${index}`,
  }));
  const stateDeletePlans = entryRemovals.map((item) => ({archiveTranscript: true, sessionId: item.expectedEntry.sessionId}));
  const plannedEntryArchives = entryRemovals.map((item) => ({sessionKey: item.sessionKey}));
  const archivedWorktrees = entryRemovals.map((item) => ({sessionKey: item.sessionKey}));
  const sizes = stateDeletePlans.map((item, index) => [item.sessionId, index]);
  const plan = boundAutomaticSessionMaintenancePlan({
    archived: 100, capped: 34, entryRemovals, modelRunPruned: 33, plannedEntryArchives,
    pruned: 33, stateDeletePlans, automaticArchiveBytesBySessionId: sizes, archivedWorktrees,
  }, (params) => [{entryRemovals: params.entryRemovals.slice(0, 64), stateDeletePlans: params.stateDeletePlans.slice(0, 64)}]);
  assert.equal(plan.entryRemovals.length, 64);
  assert.equal(plan.stateDeletePlans.length, 64);
  assert.equal(plan.plannedEntryArchives.length, 64);
  assert.equal(plan.archivedWorktrees.length, 64);
  assert.equal(plan.automaticArchiveBytesBySessionId.length, 64);
  assert.deepEqual({capped: plan.capped, pruned: plan.pruned, modelRunPruned: plan.modelRunPruned}, {capped: 22, pruned: 21, modelRunPruned: 21});
  assert.deepEqual(plan.automaticPlanSummary, {truncated: true, entryRemovalsTotal: 100, plannedEntryArchivesTotal: 100, stateDeletePlansTotal: 100});
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
