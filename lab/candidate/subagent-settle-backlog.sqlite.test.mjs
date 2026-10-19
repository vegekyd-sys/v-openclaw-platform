import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { source, native, NOW, run, readHarness, wakeHarness } from "../subagent-settle-backlog.helpers.mjs";

assert(process.env.VLAB_CANDIDATE_RUNTIME, "run with vlab candidate; never use a shared writable database");
const dist = join(process.env.VLAB_CANDIDATE_RUNTIME, "openclaw/dist");
const require = createRequire(join(dist, "index.js"));
const kysely = require("kysely");
// Execute the runtime's own SQL compiler/adapter against a private native SQLite
// database. Only handle ownership and unrelated logging hooks are substituted.
const adapter = native(readFileSync(join(dist, "kysely-sync-DKYGT267.js"), "utf8"), {
  ...kysely, queryErrorHandlerByDatabase: new WeakMap(), kyselyByDatabase: new WeakMap(),
  statementCacheSymbol: Symbol("candidate-statements"), clearNodeSqliteKyselyCacheForDatabase: () => {},
  pruneMapToMaxSize: (map, size) => { while (map.size > size) map.delete(map.keys().next().value); },
}, ["getNodeSqliteKysely", "executeSqliteQuerySync"]);

function database() {
  const directory = mkdtempSync(join(tmpdir(), "subagent-settle-candidate-"));
  const db = new DatabaseSync(join(directory, "private.sqlite"));
  db.exec("CREATE TABLE subagent_runs (run_id TEXT PRIMARY KEY, child_session_key TEXT, controller_session_key TEXT, requester_session_key TEXT, created_at INTEGER, payload_json TEXT)");
  const insert = db.prepare("INSERT INTO subagent_runs VALUES (?, ?, ?, ?, ?, ?)");
  const seed = (entries) => {
    db.exec("BEGIN");
    for (const r of entries) insert.run(r.runId, r.childSessionKey, r.controllerSessionKey ?? null, r.requesterSessionKey, r.createdAt, JSON.stringify(r));
    db.exec("COMMIT");
  };
  const open = (variant) => native(source("store", variant), {
    ...adapter, sql: kysely.sql, openOpenClawStateDatabase: () => ({ db }),
    runOpenClawStateWriteTransaction: (fn) => { db.exec("BEGIN"); try { const out = fn({ db }); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } },
    asFiniteNumber: (v) => typeof v === "number" && Number.isFinite(v) ? v : undefined,
    isRecord: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    safeParseJson: (text) => { try { return JSON.parse(text); } catch { return undefined; } },
    normalizeDeliveryContext: (v) => v, normalizeAgentRunTerminalReplySnapshot: (v) => v,
  }, ["loadSubagentRegistryFromSqlite", "loadSubagentSessionListRunsFromSqlite", "saveSubagentRegistryChangesToSqlite"]);
  return { db, seed, before: open("baseline"), after: open("patched"), close: () => { db.close(); rmSync(directory, { recursive: true }); } };
}

test("real SQLite projection preserves descendant decisions across canonical delivery/liveness/generation cases", () => {
  const f = database();
  try {
    const records = [];
    for (const [i, delivery] of [
      { status: "pending" }, { status: "suspended" }, { status: "suspended", suspendedAt: NOW },
      { status: "delivered", disposition: "delivered" }, { status: "failed", disposition: "permanent_failure" },
      { status: "discarded", disposition: "intentional_non_delivery" }, { status: "failed", disposition: "ambiguous" },
    ].entries()) {
      records.push(run(`delivery-${i}`, { requesterSessionKey: `root-${i}`, cleanupCompletedAt: undefined, delivery }));
      records.push(run(`quiet-${i}`, { requesterSessionKey: `quiet-root-${i}`, required: false, cleanupCompletedAt: undefined, delivery }));
    }
    records.push(run("parent", { requesterSessionKey: "nested-root" }));
    records.push(run("nested", { live: true, requesterSessionKey: "agent:makaron:subagent:parent" }));
    records.push(run("old-generation", { requesterSessionKey: "generation-root", childSessionKey: "shared-child", generation: 1, live: true }));
    records.push(run("new-generation", { requesterSessionKey: "other-root", childSessionKey: "shared-child", generation: 2 }));
    records.push(run("foreign", { requesterSessionKey: "agent-root", requesterAgentId: "foreign", live: true }));
    records.push(run("stale", { requesterSessionKey: "stale-root", live: true, createdAt: NOW - 3 * 3600_000 }));
    records.push(run("long-timeout", { requesterSessionKey: "timeout-root", live: true, createdAt: NOW - 3 * 3600_000, runTimeoutSeconds: 4 * 3600 }));
    records.push(run("fraction-generation", { requesterSessionKey: "invalid-generation-root", childSessionKey: "fraction-child", generation: 2.5, live: true }));
    records.push(run("valid-generation", { requesterSessionKey: "invalid-generation-root", childSessionKey: "fraction-child", generation: 2 }));
    f.seed(records);
    f.seed([
      run("invalid-completion", { completion: { required: "true" } }),
      run("legacy-handoff", { delivery: { status: "pending", handoffLeaseId: "legacy" } }),
    ]);
    f.db.prepare("INSERT INTO subagent_runs VALUES (?, ?, NULL, ?, ?, ?)").run("bad-json", "bad-child", "bad-root", NOW, "{invalid");
    const full = f.before.loadSubagentRegistryFromSqlite();
    const projected = f.after.loadSubagentSessionListRunsFromSqlite();
    assert.equal(projected.size, full.size);
    assert.equal(full.size, records.length, "non-canonical rows must be skipped by both loaders");
    const queries = readHarness();
    for (const key of new Set(records.map((r) => r.requesterSessionKey))) {
      for (const agentId of [undefined, "makaron"]) {
        for (const exclude of [undefined, "parent", "nested", "valid-generation"]) {
          assert.equal(queries.hasDescendantRunAwaitingSettleFromRuns(projected, key, exclude, agentId),
            queries.hasDescendantRunAwaitingSettleFromRuns(full, key, exclude, agentId), `${key}/${agentId}/${exclude}`);
        }
      }
    }
    assert.equal(projected.get("quiet-2").delivery.status, "not_required");
    assert.equal(projected.get("delivery-4").delivery.disposition, "permanent_failure");
    assert.equal(projected.get("fraction-generation").generation, undefined);
  } finally { f.close(); }
});

test("2854-row / 40+ MB registry: required checks never hydrate payloads; 125 legacy wakes converge and survive restart", async (t) => {
  const f = database();
  try {
    const entries = Array.from({ length: 2854 }, (_, i) => run(`workboard:${String(i).padStart(4, "0")}`, {
      required: false, live: i >= 2851,
      task: "synthetic retained task ".repeat(650),
      ...i >= 125 && i < 2851 ? { requesterSettleWake: undefined } : {},
    }));
    f.seed(entries);
    const payloadBytes = f.db.prepare("SELECT sum(length(cast(payload_json as blob))) AS n FROM subagent_runs").get().n;
    assert(payloadBytes >= 40_000_000);
    let start = performance.now(); const full = f.before.loadSubagentRegistryFromSqlite(); const fullReadMs = performance.now() - start;
    start = performance.now(); const projected = f.after.loadSubagentSessionListRunsFromSqlite(); const projectedReadMs = performance.now() - start;
    const projectedBytes = Buffer.byteLength(JSON.stringify([...projected.values()]));
    assert(projectedBytes < payloadBytes / 20, "projection unexpectedly carries retained task bodies");
    assert.equal(projected.get(entries[0].runId).task, undefined);
    const baseline = wakeHarness({ entries: [...full.values()], variant: "baseline",
      clock: { get value() { return Date.now(); } },
      loaders: { full: () => f.before.loadSubagentRegistryFromSqlite(), projected: () => f.before.loadSubagentSessionListRunsFromSqlite() },
    });
    start = performance.now(); await baseline.sweep(); const baselineSweepMs = performance.now() - start;
    assert.equal(baseline.pending().length, 125, "baseline must reproduce retained quiet wakes with live descendants");
    assert(baseline.counts.full > 0, "baseline must execute the real SQLite full-payload loader");
    assert.equal(baseline.delivered.length, 0);
    const loads = {
      full: () => f.after.loadSubagentRegistryFromSqlite(),
      projected: () => f.after.loadSubagentSessionListRunsFromSqlite(),
    };
    const query = readHarness({ loaders: loads, clock: { get value() { return Date.now(); } } });
    start = performance.now();
    for (let i = 0; i < 125; i++) assert.equal(query.hasDescendantRunAwaitingSettle("agent:makaron:main", entries[i].runId, "makaron"), true);
    const checksMs = performance.now() - start;
    assert.equal(query.counts.full, 0);
    assert(query.counts.projected >= 1 && query.counts.projected <= 5, "125 checks must reuse the real-time cache, not reload per row");
    const h = wakeHarness({ entries: [...full.values()], loaders: loads });
    // Use real SQLite writes for the native lifecycle completion callbacks.
    h.context.options.persistOrThrow = (...ids) => f.after.saveSubagentRegistryChangesToSqlite(h.runs, ids);
    start = performance.now(); await h.sweep(); const sweepMs = performance.now() - start;
    assert.equal(h.pending().length, 0);
    assert.equal(h.delivered.length, 0);
    assert.deepEqual(h.counts, { full: 0, projected: 0 });
    const afterRestart = f.after.loadSubagentRegistryFromSqlite();
    assert.equal([...afterRestart.values()].filter((r) => r.requesterSettleWake).length, 0);
    assert.equal(afterRestart.size, 2854);
    assert.equal([...afterRestart.values()].filter((r) => r.execution.status === "running").length, 3);
    t.diagnostic(JSON.stringify({ rows: 2854, pendingBefore: 125, pendingAfterRestart: 0, payloadBytes, projectedBytes,
      baselinePendingAfterSweep: baseline.pending().length, baselineSweep125Ms: +baselineSweepMs.toFixed(2), baselineSqlReads: baseline.counts,
      fullReadMs: +fullReadMs.toFixed(2), projectedReadMs: +projectedReadMs.toFixed(2), checks125Ms: +checksMs.toFixed(2),
      requiredCheckSqlReads: query.counts, quietWakeSweep125Ms: +sweepMs.toFixed(2), quietWakeSqlReads: h.counts,
      notificationDeliveries: h.delivered.length }));
  } finally { f.close(); }
});
