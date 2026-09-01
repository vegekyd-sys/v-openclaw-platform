import assert from "node:assert/strict";
import test from "node:test";
import { dashboardCardIds, runNightShiftSchedulerPulse } from "./scheduler.mjs";

test("dashboard scope includes history referenced by instances without scanning the board", () => {
  const store = {
    listActionCardIds: () => ["approval-1"],
    listContentItemRuns: () => [{ cardId: "content-done" }, { cardId: "content-running" }],
    listStageRuns: () => [{ cardId: "project-done" }, { cardId: null }],
  };
  assert.deepEqual(
    dashboardCardIds(store, [{ id: "A" }]),
    ["project-done", "content-done", "content-running", "approval-1"],
  );
});

test("uses one shared snapshot and one native dispatch for all active projects", async () => {
  let refreshes = 0;
  const refreshScopes = [];
  const dispatches = [];
  const sessionPrefetches = [];
  const ticks = [];
  const initial = [
    { id: "running-1", status: "running" },
    { id: "ready-1", status: "ready" },
  ];
  const created = [
    { id: "new-a", status: "ready" },
    { id: "new-b", status: "ready" },
  ];
  const result = await runNightShiftSchedulerPulse({
    dispatchMaxStarts: 12,
    maxWorkboardActive: 36,
    refreshCards: async (options) => {
      refreshes += 1;
      refreshScopes.push(options.cardIds);
      return refreshes === 1 ? initial : [...initial, ...created];
    },
    runtime: {
      tick: async (instanceId, options) => {
        ticks.push({ instanceId, options });
        return {
          applied: [{ card: created[instanceId === "A" ? 0 : 1], status: "created" }],
        };
      },
    },
    store: {
      appendEvent() {},
      listContentItemRuns: (instanceId) => instanceId === "B" ? [{ cardId: "ready-1", stageId: "work", status: "ready" }] : [],
      listInstances: () => [
        { id: "A", status: "active" },
        { id: "B", status: "active" },
        { id: "C", status: "done" },
      ],
      listActionCardIds: () => [],
      listStageRuns: (instanceId) => instanceId === "A" ? [{ cardId: "running-1", stageId: "work", status: "running" }] : [],
    },
    syncContentItemsManifest: async () => {},
    workboard: {
      clearSessionSnapshots: () => sessionPrefetches.push("cleared"),
      dispatch: async (maxStarts, options) => {
        dispatches.push({ maxStarts, options });
        return { started: maxStarts };
      },
      prefetchSessions: async (keys, options) => {
        sessionPrefetches.push({ keys, options });
        return { count: keys.length, failed: 0 };
      },
    },
  });

  assert.equal(refreshes, 2);
  assert.equal(ticks.length, 2);
  assert.strictEqual(ticks[0].options.cards, initial);
  assert.equal(ticks[0].options.dispatch, false);
  assert.equal(ticks[1].options.cards.some((card) => card.id === "new-a"), true);
  assert.deepEqual(refreshScopes[0], ["running-1", "ready-1"]);
  assert.deepEqual(dispatches, [{ maxStarts: 3, options: { cardIds: ["running-1", "ready-1"] } }]);
  assert.deepEqual(sessionPrefetches, ["cleared"]);
  assert.equal(result.running, 1);
  assert.equal(result.ready, 3);
});

test("reserves interactive capacity and does not dispatch above the Workboard cap", async () => {
  const cards = [
    ...Array.from({ length: 36 }, (_, index) => ({ id: `running-${index}`, status: "running" })),
    { id: "ready-1", status: "ready" },
  ];
  let dispatched = false;
  const result = await runNightShiftSchedulerPulse({
    refreshCards: async () => cards,
    runtime: { tick: async () => ({ applied: [] }) },
    store: { appendEvent() {}, listContentItemRuns: () => [], listInstances: () => [], listStageRuns: () => [] },
    syncContentItemsManifest: async () => {},
    workboard: { dispatch: async () => { dispatched = true; } },
  });

  assert.equal(dispatched, false);
  assert.equal(result.maxStarts, 0);
  assert.equal(result.running, 36);
});

test("isolates a manifest warning without blocking native dispatch", async () => {
  const events = [];
  const result = await runNightShiftSchedulerPulse({
    refreshCards: async () => [{ id: "ready", status: "ready" }],
    runtime: { tick: async () => ({ applied: [] }) },
    store: {
      appendEvent: (event) => events.push(event),
      listContentItemRuns: () => [],
      listInstances: () => [{ id: "A", status: "active" }],
      listActionCardIds: () => [],
      listStageRuns: () => [{ cardId: "ready", stageId: "work", status: "ready" }],
    },
    syncContentItemsManifest: async () => { throw new Error("bad manifest"); },
    workboard: { dispatch: async () => ({ started: 1 }) },
  });

  assert.deepEqual(result.warnings, ["A: bad manifest"]);
  assert.equal(events[0].type, "content-items.import.failed");
  assert.equal(result.maxStarts, 1);
});

test("scheduler scope is independent from historical Workboard card count", async () => {
  const historical = Array.from({ length: 500 }, (_, index) => ({ id: `history-${index}`, status: "done" }));
  const activeCards = [
    { id: "active-running", status: "running" },
    { id: "active-ready", status: "ready" },
  ];
  let requestedIds = null;
  let dispatchOptions = null;
  const result = await runNightShiftSchedulerPulse({
    refreshCards: async ({ cardIds }) => {
      requestedIds = cardIds;
      return [...historical, ...activeCards].filter((card) => cardIds.includes(card.id));
    },
    runtime: { tick: async () => ({ applied: [] }) },
    store: {
      appendEvent() {},
      listContentItemRuns: () => [{ cardId: "active-ready", contentItemId: "one", stageId: "work", status: "ready" }],
      listInstances: () => [{ id: "ACTIVE", status: "active" }, { id: "OLD", status: "done" }],
      listActionCardIds: () => ["approval-card"],
      listStageRuns: () => [
        { attempt: 1, cardId: "history-done", stageId: "old", status: "done" },
        { attempt: 1, cardId: "old-attempt", stageId: "work", status: "running" },
        { attempt: 2, cardId: "active-running", stageId: "work", status: "running" },
      ],
    },
    syncContentItemsManifest: async () => {},
    workboard: {
      dispatch: async (_maxStarts, options) => {
        dispatchOptions = options;
        return { started: 1 };
      },
    },
  });

  assert.deepEqual(requestedIds, ["active-running", "active-ready", "approval-card"]);
  assert.deepEqual(dispatchOptions.cardIds, requestedIds);
  assert.equal(result.running, 1);
  assert.equal(result.ready, 1);
});

test("reused idempotent actions do not trigger a second refresh", async () => {
  let refreshes = 0;
  const result = await runNightShiftSchedulerPulse({
    refreshCards: async () => {
      refreshes += 1;
      return [{ id: "approval-card", status: "review", labels: ["nightshift:approval"] }];
    },
    runtime: { tick: async () => ({ applied: [{ card: { id: "approval-card" }, status: "reused" }] }) },
    store: {
      appendEvent() {},
      listActionCardIds: () => ["approval-card"],
      listContentItemRuns: () => [],
      listInstances: () => [{ id: "ACTIVE", status: "active" }],
      listStageRuns: () => [],
    },
    syncContentItemsManifest: async () => {},
    workboard: { dispatch: async () => ({ started: 0 }) },
  });

  assert.equal(refreshes, 1);
  assert.equal(result.changed, false);
  assert.equal(result.timings.instances[0].mutations, 0);
});

test("retries a transient native Worker session-start race exactly once", async () => {
  const retries = [];
  const result = await runNightShiftSchedulerPulse({
    refreshCards: async () => [{ id: "route-card", status: "ready" }],
    runtime: {
      retry: async (input) => { retries.push(input); return { cardId: input.cardId, status: "ready" }; },
      tick: async () => ({ applied: [] }),
    },
    store: {
      appendEvent() {},
      listActionCardIds: () => [],
      listContentItemRuns: () => [{ cardId: "route-card", contentItemId: "video-1", instanceId: "ACTIVE", stageId: "route", status: "ready" }],
      listEvents: () => [],
      listInstances: () => [{ id: "ACTIVE", status: "active" }],
      listStageRuns: () => [],
    },
    syncContentItemsManifest: async () => {},
    workboard: {
      dispatch: async () => ({
        startFailures: [{ cardId: "route-card", error: 'Session "agent:test" was deleted while starting work. Retry.' }],
      }),
    },
  });

  assert.equal(retries.length, 1);
  assert.equal(retries[0].contentItemId, "video-1");
  assert.deepEqual(result.transientRequeues, [{ cardId: "route-card", status: "ready" }]);
});
