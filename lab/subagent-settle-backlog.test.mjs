import assert from "node:assert/strict";
import test from "node:test";
import { settlePatches } from "./patch-subagent-settle-backlog.mjs";
import { source, names, native, NOW, run, readHarness, wakeHarness } from "./subagent-settle-backlog.helpers.mjs";

const root = "agent:makaron:main";

test("guarded patch reproduces exact release bytes, is idempotent and rejects anchor drift", () => {
  for (const kind of ["wake", "read", "store"]) {
    const base = source(kind, "baseline"), patch = settlePatches[names[kind]];
    assert.equal(patch(base), source(kind));
    assert.equal(patch(patch(base)), patch(base));
    assert.throws(() => patch("unexpected runtime"), /anchor drifted/);
    new Function(source(kind).replace(/^import .*;\n/gm, "").replace(/^export .*;\n?/gm, ""));
  }
});

test("incident reproduction: 125 no-notification rows stay pending and reload full registry on the old slow path", async () => {
  const ended = Array.from({ length: 125 }, (_, i) => run(`workboard:${i}`, { required: false }));
  const entries = [...ended, run("busy-child", { live: true, required: false })];
  const before = wakeHarness({ entries, persisted: entries, variant: "baseline", loadDelay: 800 });
  await before.sweep();
  assert.equal(before.pending().length, 125);
  assert.equal(before.counts.full, 125);
  assert.equal(before.delivered.length, 0);
  const after = wakeHarness({ entries, persisted: entries, loadDelay: 800 });
  await after.sweep();
  assert.equal(after.pending().length, 0);
  assert.deepEqual(after.counts, { full: 0, projected: 0 });
  assert.equal(after.descendantChecks, 0);
  assert.equal(after.delivered.length, 0);
  assert.equal(after.runs.size, 126, "retained task rows are not deleted");
  assert.equal(after.runs.get("busy-child").execution.status, "running");
});

test("continuous background work does not accumulate wake rows, including disjoint settled waves", async () => {
  const h = wakeHarness({ entries: [run("always-live", { live: true, required: false })] });
  for (let i = 0; i < 1000; i++) {
    const row = run(`workboard:${i}`, { required: false, createdAt: NOW + i * 200, endedAt: NOW + i * 200 + 100 });
    h.clock.value = row.execution.endedAt;
    h.runs.set(row.runId, row);
    await h.invoke(row.runId);
    assert.equal(h.pending().length, 0, `completion ${i} retained a wake`);
  }
  assert.equal(h.runs.size, 1001);
  assert.equal(h.delivered.length, 0);
  assert.deepEqual(h.counts, { full: 0, projected: 0 });
});

test("legacy persisted wakes are repaired on resume and stay cleared after a second restart", async () => {
  const persisted = Array.from({ length: 125 }, (_, i) => run(`workboard:${i}`, { required: false }));
  persisted.push(run("busy", { live: true, required: false }));
  const restored = wakeHarness({ persisted });
  restored.restoreSubagentRunsFromDisk({ runs: restored.runs, shouldSkip: () => false });
  await restored.sweep();
  assert.equal(restored.pending().length, 0);
  const restarted = wakeHarness({ persisted: restored.durableEntries() });
  restarted.restoreSubagentRunsFromDisk({ runs: restarted.runs, shouldSkip: () => false });
  await restarted.sweep();
  assert.equal(restarted.pending().length, 0);
  assert.equal(restarted.delivered.length, 0);
});

test("durable cleanup failure rolls back wake state; retry succeeds without dropping retained results", async () => {
  let fail = true;
  const h = wakeHarness({ entries: [run("quiet", { required: false, completion: { required: false, result: "keep this result" } })], persistError: () => fail });
  await assert.rejects(h.invoke("quiet"), /durable write failed/);
  assert.equal(h.pending().length, 1);
  assert.equal(h.runs.get("quiet").completion.result, "keep this result");
  fail = false;
  await h.sweep();
  assert.equal(h.pending().length, 0);
  assert.equal(h.disk.get("quiet").completion.result, "keep this result");
});

test("normal required batch still waits for live descendants, then delivers once and durably settles", async () => {
  const h = wakeHarness({ entries: [run("a"), run("b"), run("live", { live: true, required: false })] });
  await h.sweep();
  assert.equal(h.pending().length, 2);
  assert.equal(h.delivered.length, 0);
  const live = h.runs.get("live"); live.execution = { status: "terminal", endedAt: NOW }; live.cleanupCompletedAt = NOW;
  await h.sweep();
  assert.equal(h.delivered.length, 1);
  assert.equal(h.pending().length, 0);
  assert.equal(h.disk.get("a").delivery.status, "delivered");
  assert.equal(h.disk.get("b").delivery.status, "delivered");
  assert.equal(h.counts.full, 0);
});

test("mixed required/quiet connected wave is preserved while a descendant runs", async () => {
  const entries = [run("a"), run("quiet", { required: false }), run("b"), run("busy", { live: true, required: false })];
  for (const variant of ["baseline", "patched"]) {
    const h = wakeHarness({ entries, variant });
    await h.sweep();
    assert.equal(h.pending().length, 3);
    assert.equal(h.delivered.length, 0);
    h.runs.delete("busy");
    await h.sweep();
    assert.equal(h.delivered.length, 1);
    assert.deepEqual(h.voiceWakes[0].batchRunIds, ["a", "b", "quiet"]);
    assert.equal(h.pending().length, 0);
  }
});

test("a quiet interval connecting required children keeps the original connected wave", async () => {
  const entries = [
    run("a", { createdAt: NOW - 300, endedAt: NOW - 200 }),
    run("bridge", { required: false, createdAt: NOW - 250, endedAt: NOW - 50 }),
    run("b", { createdAt: NOW - 100, endedAt: NOW }),
  ];
  const h = wakeHarness({ entries });
  await h.invoke("bridge");
  assert.equal(h.delivered.length, 1);
  assert.deepEqual(h.voiceWakes[0].batchRunIds, ["a", "b", "bridge"]);
});

test("a quiet wave may finish while unrelated required work is running; required notification survives", async () => {
  const h = wakeHarness({ entries: [run("quiet", { required: false }), run("required", { live: true })] });
  await h.invoke("quiet");
  assert.equal(h.pending().length, 0);
  assert.equal(h.runs.get("required").delivery.status, "pending");
  const required = h.runs.get("required");
  required.execution = { status: "terminal", endedAt: NOW + 10 };
  required.cleanupCompletedAt = NOW + 10;
  required.requesterSettleWake = { status: "pending", attemptCount: 0 };
  await h.invoke("required");
  assert.equal(h.delivered.length, 1, "undelivered required completion must still wake requester");
  assert.equal(required.delivery.status, "delivered");
});

test("already-delivered single required child does not cause a duplicate parent wake", async () => {
  const h = wakeHarness({ entries: [run("one", { delivery: { status: "delivered", disposition: "delivered" } })] });
  await h.sweep();
  assert.equal(h.pending().length, 0);
  assert.equal(h.delivered.length, 0);
});

test("yielded frozen batch retains generation, direct delivery, visible reply and voice continuation", async () => {
  const state = { status: "pending", attemptCount: 0, batchRunIds: ["a", "b"], rearmGeneration: 7, requesterYieldBatch: true, afterRequesterYield: true };
  const h = wakeHarness({ entries: ["a", "b"].map((id) => run(id, {
    requesterTurnRunId: "parent-turn", requesterSettleWake: structuredClone(state), delivery: { status: "delivered", disposition: "delivered" },
  })) });
  await h.sweep();
  assert.equal(h.delivered.length, 1);
  assert.equal(h.delivered[0].requireVisibleReply, true);
  assert.equal(h.delivered[0].requireDirectDelivery, true);
  assert.deepEqual(h.voiceWakes[0], { requesterSessionKey: root, requesterAgentId: "makaron", batchRunIds: ["a", "b"], rearmGeneration: 7 });
  assert.deepEqual(h.delivered[0].voiceContinuation.causal, h.voiceWakes[0]);
  assert.equal(h.runs.size, 2, "requester-owned rows remain retained");
});

test("frozen batch with unfinished member is not prematurely cleared, even without notifications", async () => {
  const state = { status: "pending", attemptCount: 0, batchRunIds: ["a", "b"], rearmGeneration: 2 };
  const h = wakeHarness({ entries: [run("a", { required: false, requesterSettleWake: state }), run("b", { required: false, live: true, requesterSettleWake: state })] });
  await h.invoke("a");
  assert.equal(h.pending().length, 2);
  assert.equal(h.delivered.length, 0);
});

test("duplicate concurrent callbacks share one delivery, and newer rearm generation is not cleared", async () => {
  let finish;
  const h = wakeHarness({ entries: [run("a"), run("b")], delivery: () => new Promise((resolve) => { finish = resolve; }) });
  const first = h.invoke("a");
  await h.invoke("b");
  assert.equal(h.delivered.length, 1);
  for (const entry of h.runs.values()) entry.requesterSettleWake = { status: "pending", attemptCount: 0, rearmGeneration: 2, batchRunIds: ["a", "b"] };
  finish({ delivered: true, path: "direct" });
  await first;
  assert.equal(h.pending().length, 2);
  assert.equal(h.runs.get("a").requesterSettleWake.rearmGeneration, 2);
});

test("delivery retry retains backoff and distinct retry key; ambiguous replay retains original key", async () => {
  for (const ambiguous of [false, true]) {
    const h = wakeHarness({ entries: [run("required")], delivery: (_params, attempt) => {
      if (attempt > 1) return { delivered: true, path: "direct" };
      if (ambiguous) throw new Error("transport interrupted");
      return { delivered: false, path: "none", error: "try later" };
    } });
    await h.invoke("required");
    const state = h.runs.get("required").requesterSettleWake;
    assert.equal(state.nextAttemptAt, NOW + 30_000);
    await h.invoke("required");
    assert.equal(h.delivered.length, 1);
    h.clock.value += 30_001;
    await h.invoke("required");
    assert.equal(h.delivered.length, 2);
    assert.equal(h.pending().length, 0);
    assert.equal(h.delivered[0].directIdempotencyKey === h.delivered[1].directIdempotencyKey, ambiguous);
  }
});

test("aborted wake does no work; cron wake still retires without notification", async () => {
  const h = wakeHarness({ entries: [run("quiet", { required: false })] });
  await h.invoke("quiet", { signal: AbortSignal.abort() });
  assert.equal(h.pending().length, 1);
  assert.equal(h.descendantChecks, 0);
  const cron = wakeHarness({ entries: [run("cron", { requesterSessionKey: "agent:makaron:cron:daily" })] });
  await cron.sweep();
  assert.equal(cron.pending().length, 0);
  assert.equal(cron.delivered.length, 0);
});

test("retire-after-settle respects existing lifecycle retirement policy", async () => {
  const h = wakeHarness({ entries: [run("retire", { required: false, requesterSettleWake: { status: "pending", attemptCount: 0, retireAfterSettle: true } })] });
  await h.sweep();
  assert.equal(h.runs.has("retire"), false);
  assert.equal(h.disk.has("retire"), false);
});

test("slow projected read starts cache TTL after load; cross-process updates appear at expiry", () => {
  const h = readHarness({ persisted: [run("remote", { live: true })], loadDelay: 800 });
  assert.equal(h.hasDescendantRunAwaitingSettle(root), true);
  assert.equal(h.hasDescendantRunAwaitingSettle(root), true);
  assert.deepEqual(h.counts, { full: 0, projected: 1 });
  h.disk.set("remote", run("remote"));
  h.clock.value += 501;
  assert.equal(h.hasDescendantRunAwaitingSettle(root), false);
  assert.deepEqual(h.counts, { full: 0, projected: 2 });
});

test("in-memory progress overlays cached persistence and durable changes update projection immediately", () => {
  const row = run("child", { live: true });
  const h = readHarness({ entries: [row], persisted: [row] });
  assert.equal(h.hasDescendantRunAwaitingSettle(root), true);
  h.runs.set("child", run("child"));
  assert.equal(h.hasDescendantRunAwaitingSettle(root), false);
  h.persistSubagentRunsToDiskOrThrow(h.runs, ["child"]);
  h.runs.clear();
  assert.equal(h.hasDescendantRunAwaitingSettle(root), false);
  assert.equal(h.counts.projected, 1);
});

test("projected topology matches full records for nested, superseded and cross-agent descendants", () => {
  const parent = run("parent");
  const nested = run("nested", { live: true, requesterSessionKey: parent.childSessionKey });
  const unrelated = run("foreign", { live: true, requesterAgentId: "another-agent" });
  const cases = [
    [parent, nested],
    [unrelated],
    [run("older", { live: true, generation: 1, childSessionKey: "shared-child" }), run("newer", { generation: 2, childSessionKey: "shared-child", requesterSessionKey: "agent:other:main" })],
    [run("old", { live: true, createdAt: NOW - 3 * 3600_000 })],
    [run("long", { live: true, createdAt: NOW - 3 * 3600_000, runTimeoutSeconds: 4 * 3600 })],
  ];
  for (const entries of cases) {
    const h = readHarness({ persisted: entries });
    const expected = h.hasDescendantRunAwaitingSettleFromRuns(new Map(entries.map((r) => [r.runId, r])), root, undefined, "makaron");
    assert.equal(h.hasDescendantRunAwaitingSettle(root, undefined, "makaron"), expected);
    assert.equal(h.counts.full, 0);
  }
});

test("delivery dispositions and suspended timestamps survive the projection", () => {
  for (const delivery of [
    { status: "pending" }, { status: "suspended" }, { status: "suspended", suspendedAt: NOW },
    { status: "delivered", disposition: "delivered" }, { status: "failed", disposition: "permanent_failure" },
    { status: "not_required", disposition: "intentional_non_delivery" }, { status: "failed", disposition: "ambiguous" },
  ]) {
    const entry = run("child", { cleanupCompletedAt: undefined, delivery });
    const h = readHarness({ persisted: [entry] });
    const expected = h.hasDescendantRunAwaitingSettleFromRuns(new Map([[entry.runId, entry]]), root);
    assert.equal(h.hasDescendantRunAwaitingSettle(root), expected, JSON.stringify(delivery));
    h.runs.set(entry.runId, entry); h.persistSubagentRunsToDiskOrThrow(h.runs, [entry.runId]); h.runs.clear();
    assert.equal(h.hasDescendantRunAwaitingSettle(root), expected, "persisted cache must retain disposition");
  }
});

test("SQLite projection normalizes false completion and invalid generations like full loader", () => {
  const api = native(source("store"), {
    asFiniteNumber: (v) => typeof v === "number" && Number.isFinite(v) ? v : undefined,
    isRecord: (v) => v !== null && typeof v === "object", safeParseJson: JSON.parse,
  }, ["rowToSubagentRunReadRecord"]);
  const row = { run_id: "r", child_session_key: "child", requester_session_key: root, created_at: NOW,
    execution_status: "terminal", ended_at: NOW, delivery_status: "suspended", delivery_suspended_at: NOW, delivery_disposition: "intentional_non_delivery", expects_completion_message: 0 };
  for (const generation of [null, 0, -1, 1.5, 1, 2, Number.MAX_SAFE_INTEGER + 1]) {
    const projected = api.rowToSubagentRunReadRecord({ ...row, generation });
    assert.equal(projected.generation, Number.isSafeInteger(generation) && generation > 0 ? generation : undefined);
    assert.equal(projected.delivery.status, "not_required");
    assert.equal(projected.delivery.disposition, "intentional_non_delivery");
  }
});

test("96 normal-notification scenarios keep the baseline's delivery, retry, generation and durable-state behavior", async () => {
  let checked = 0;
  for (const count of [1, 2, 3]) for (const alreadyDelivered of [false, true]) {
    for (const frozen of [false, true]) for (const busy of [false, true]) {
      for (const outcome of ["success", "retry", "permanent", "ambiguous"]) {
        const ids = Array.from({ length: count }, (_, i) => `required-${i}`);
        const state = { status: "pending", attemptCount: 0,
          ...frozen ? { batchRunIds: [...ids, "quiet"], rearmGeneration: 3, requesterYieldBatch: true, afterRequesterYield: true } : {} };
        const entries = ids.map((id) => run(id, { requesterSettleWake: structuredClone(state),
          delivery: alreadyDelivered ? { status: "delivered", disposition: "delivered" } : { status: "pending" } }));
        entries.push(run("quiet", { required: false, requesterSettleWake: structuredClone(state) }));
        const observe = async (variant) => {
          const h = wakeHarness({ variant, entries, hasDescendants: () => busy, delivery: () => {
            if (outcome === "ambiguous") throw new Error("uncertain transport result");
            if (outcome === "retry") return { delivered: false, path: "none", error: "retryable" };
            if (outcome === "permanent") return { delivered: false, path: "none", disposition: "permanent_failure", error: "permanent" };
            return { delivered: true, path: "direct" };
          } });
          await h.invoke(ids[0]);
          return { delivered: h.delivered, completed: h.completed, transitions: h.transitions, writes: h.writes,
            rows: structuredClone([...h.runs.values()]), durable: h.durableEntries(), voiceWakes: h.voiceWakes };
        };
        assert.deepEqual(await observe("patched"), await observe("baseline"), JSON.stringify({ count, alreadyDelivered, frozen, busy, outcome }));
        checked++;
      }
    }
  }
  assert.equal(checked, 96);
});
