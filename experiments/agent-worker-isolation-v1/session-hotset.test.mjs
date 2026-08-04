import assert from "node:assert/strict";
import test from "node:test";

import {
  applySessionHotsetProjection,
  getSessionHotsetStatus,
  projectSerializedSessionStoreHotset,
  resetSessionHotsetStatsForTest,
} from "./session-hotset.mjs";

function makeEntry(index, updatedAt) {
  return {
    sessionId: `session-${index}`,
    sessionFile: `/sessions/session-${index}.jsonl`,
    updatedAt,
    deliveryContext: { channel: "feishu", to: `oc_${index}` },
    route: { channel: "feishu", target: { to: `oc_${index}` } },
    compactionCheckpoints: [{ id: `checkpoint-${index}` }],
    pluginState: { workshop: { proposal: `proposal-${index}` } },
    skillsSnapshot: {
      promptRef: { sha256: `skill-${index}` },
      skills: [{ name: "makaron", prompt: "x".repeat(2_000) }],
    },
    systemPromptReport: {
      tools: [{ name: "sessions_history", description: "y".repeat(4_000) }],
    },
  };
}

test("500 Sessions keep one central directory while only recent derived state stays hot", () => {
  const nowMs = 1_800_000_000_000;
  const store = Object.fromEntries(
    Array.from({ length: 500 }, (_, index) => [
      `agent:makaron:feishu:group:oc_${String(index).padStart(4, "0")}`,
      makeEntry(index, index < 488 ? nowMs - 600_000 : nowMs - 30_000),
    ]),
  );

  const result = applySessionHotsetProjection(store, {
    force: true,
    nowMs,
    ttlMs: 180_000,
  });

  assert.equal(Object.keys(store).length, 500);
  assert.equal(result.sessionCountBefore, 500);
  assert.equal(result.sessionCountAfter, 500);
  assert.equal(result.hotEntries, 12);
  assert.equal(result.coldEntries, 488);
  assert.equal(result.changedEntries, 488);
  assert.ok(result.bytesRemoved > 2_000_000);
  assert.ok(store["agent:makaron:feishu:group:oc_0499"].skillsSnapshot);
  assert.equal(
    store["agent:makaron:feishu:group:oc_0000"].skillsSnapshot,
    undefined,
  );
});

test("cold projection preserves identity, history, routing, compaction and plugin state", () => {
  const entry = makeEntry(1, 100);
  const preserved = structuredClone(entry);
  const store = { "agent:makaron:explicit:target": entry };

  applySessionHotsetProjection(store, {
    force: true,
    nowMs: 1_000,
    ttlMs: 100,
  });

  for (const key of [
    "sessionId",
    "sessionFile",
    "updatedAt",
    "deliveryContext",
    "route",
    "compactionCheckpoints",
    "pluginState",
  ]) {
    assert.deepEqual(store["agent:makaron:explicit:target"][key], preserved[key]);
  }
  assert.equal(store["agent:makaron:explicit:target"].skillsSnapshot, undefined);
  assert.equal(store["agent:makaron:explicit:target"].systemPromptReport, undefined);
});

test("active and recent Sessions never lose derived state", () => {
  const store = {
    "agent:makaron:explicit:active": makeEntry(1, 100),
    "agent:makaron:explicit:recent": makeEntry(2, 950),
  };

  const result = applySessionHotsetProjection(store, {
    force: true,
    nowMs: 1_000,
    ttlMs: 100,
    activeSessionKey: "agent:makaron:explicit:active",
  });

  assert.equal(result.hotEntries, 2);
  assert.equal(result.changedEntries, 0);
  assert.ok(store["agent:makaron:explicit:active"].skillsSnapshot);
  assert.ok(store["agent:makaron:explicit:recent"].systemPromptReport);
});

test("projection is idempotent and disabled by default", () => {
  const store = { "agent:makaron:explicit:cold": makeEntry(1, 100) };
  const disabled = applySessionHotsetProjection(store, {
    nowMs: 1_000,
    ttlMs: 100,
  });
  assert.equal(disabled.enabled, false);
  assert.ok(store["agent:makaron:explicit:cold"].skillsSnapshot);

  const first = applySessionHotsetProjection(store, {
    force: true,
    nowMs: 1_000,
    ttlMs: 100,
  });
  const second = applySessionHotsetProjection(store, {
    force: true,
    nowMs: 1_000,
    ttlMs: 100,
  });
  assert.equal(first.changedEntries, 1);
  assert.equal(second.changedEntries, 0);
});

test("status names the native state that is rebuilt instead of hiding Sessions", () => {
  resetSessionHotsetStatsForTest();
  const status = getSessionHotsetStatus();
  assert.equal(status.strategy, "central-directory-cold-derived-state-v1");
  assert.ok(status.retainedForEverySession.includes("sessionId"));
  assert.ok(status.retainedForEverySession.includes("compactionCheckpoints"));
  assert.deepEqual(status.rebuiltOnActivation, [
    "skillsSnapshot",
    "systemPromptReport",
  ]);
});

test("single-entry persistence can continuously evict dormant derived state", () => {
  const nowMs = 10_000;
  const source = JSON.stringify({
    "agent:makaron:explicit:old": makeEntry(1, 100),
    "agent:makaron:explicit:active": makeEntry(2, 100),
  });

  const projected = projectSerializedSessionStoreHotset(source, {
    force: true,
    nowMs,
    ttlMs: 100,
    activeSessionKey: "agent:makaron:explicit:active",
  });
  const store = JSON.parse(projected);

  assert.equal(Object.keys(store).length, 2);
  assert.equal(store["agent:makaron:explicit:old"].skillsSnapshot, undefined);
  assert.ok(store["agent:makaron:explicit:active"].skillsSnapshot);
});
