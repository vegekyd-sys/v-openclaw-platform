import assert from "node:assert/strict";
import test from "node:test";
import { runNightShiftSchedulerPulse } from "./scheduler.mjs";

test("uses one shared snapshot and one native dispatch for all active projects", async () => {
  let refreshes = 0;
  const dispatches = [];
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
    refreshCards: async () => {
      refreshes += 1;
      return refreshes === 1 ? initial : [...initial, ...created];
    },
    runtime: {
      tick: async (instanceId, options) => {
        ticks.push({ instanceId, options });
        return {
          applied: [{ card: created[instanceId === "A" ? 0 : 1] }],
        };
      },
    },
    store: {
      appendEvent() {},
      listInstances: () => [
        { id: "A", status: "active" },
        { id: "B", status: "active" },
        { id: "C", status: "done" },
      ],
    },
    syncContentItemsManifest: async () => {},
    workboard: {
      dispatch: async (maxStarts) => {
        dispatches.push(maxStarts);
        return { started: maxStarts };
      },
    },
  });

  assert.equal(refreshes, 2);
  assert.equal(ticks.length, 2);
  assert.strictEqual(ticks[0].options.cards, initial);
  assert.equal(ticks[0].options.dispatch, false);
  assert.equal(ticks[1].options.cards.some((card) => card.id === "new-a"), true);
  assert.deepEqual(dispatches, [3]);
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
    store: { appendEvent() {}, listInstances: () => [] },
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
      listInstances: () => [{ id: "A", status: "active" }],
    },
    syncContentItemsManifest: async () => { throw new Error("bad manifest"); },
    workboard: { dispatch: async () => ({ started: 1 }) },
  });

  assert.deepEqual(result.warnings, ["A: bad manifest"]);
  assert.equal(events[0].type, "content-items.import.failed");
  assert.equal(result.maxStarts, 1);
});
