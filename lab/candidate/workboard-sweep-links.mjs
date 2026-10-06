// Candidate test for lab/release-files/workboard-sweep-links: a partial Workboard lifecycle sweep
// must stop loading every full card, and must sync the same cards as before.
//
// After #212 every sweep (once a minute) still began with store.list(): every card with its notes
// and eleven child tables, on the Gateway main thread. V has ~3,580 cards; the shared VLab mirror
// only ~2,470 (602 unarchived), so this test seeds a private Workboard database to V's size (N,
// default 3,580) in the candidate state directory, shaped like linked Night Shift cards, a quarter
// of them archived with an uncleaned worktree, and runs the lifecycle region of
// both plugin files against the runtime's real WorkboardStore. A fake Gateway answers
// sessions.list: every session on a full sweep, three recently finished ones on a partial sweep.
// Each sweep is timed by the longest stretch the event loop could not run a 1 ms timer.
// Pass: patched partial sweeps block (median) under a third of unpatched ones; both versions sync the same
// cards on the partial sweep; full sweeps are unchanged (they still read every card).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateRoot = process.env.OPENCLAW_STATE_DIR;
assert(runtime && stateRoot, "candidate runtime environment is required");
const N = Number(process.env.N ?? 3580);
const dist = path.join(runtime, "openclaw", "dist");
const rt = await import(path.join(dist, "runtime-api-1CCazqtv.js"));
const { r: WorkboardStore, a: workboardCardSessionLookupKey, c: cardSessionKey, s: cardRunId, i: workboardCardMatchesLifecycleLink, u: isWorkboardWorktreeCleanupCandidate, l: cleanupWorkboardCardWorktree } = rt;
const repo = process.cwd();
const sources = {
  before: fs.readFileSync(path.join(repo, "lab/release-files/workboard-incremental-sweep/index.js"), "utf8"),
  after: fs.readFileSync(path.join(repo, "lab/release-files/workboard-sweep-links/index.js"), "utf8"),
};

function lifecycle(source) {
  const start = source.indexOf("//#region extensions/workboard/src/lifecycle-sync.ts");
  const region = source.slice(start, source.indexOf("//#endregion", start));
  const deps = { resolveGlobalSingleton: (_k, create) => create(), isRecord: (v) => typeof v === "object" && v !== null && !Array.isArray(v), cardSessionKey, cardRunId, workboardCardSessionLookupKey, workboardCardMatchesLifecycleLink, isWorkboardWorktreeCleanupCandidate, cleanupWorkboardCardWorktree };
  return new Function(...Object.keys(deps), `${region}\nreturn { createWorkboardLifecycleService, readWorkboardLifecycleSessions };`)(...Object.values(deps));
}

async function seed(dir) {
  fs.mkdirSync(dir, { recursive: true });
  process.env.OPENCLAW_STATE_DIR = dir;
  const store = WorkboardStore.openSqlite();
  const t = await store.create({ title: "template", notes: "x".repeat(1500), agentId: "nightshift", sessionKey: "agent:nightshift:subagent:workboard-default-template", runId: "r-template" });
  await store.addComment(t.id, { body: "comment ".repeat(40) });
  await store.move(t.id, "running");
  const tpl = await store.get(t.id);
  const now = Date.now();
  for (let i = 0; i < N; i += 1) {
    const id = `card-${String(i).padStart(5, "0")}`;
    const card = structuredClone(tpl);
    Object.assign(card, { id, title: `Night shift task ${i}`, sessionKey: `agent:nightshift:subagent:workboard-default-${id}`, runId: `run-${i}`, createdAt: now - (N - i) * 60_000, updatedAt: now - (N - i) * 60_000 + 1000, notes: "n".repeat(500 + (i % 7) * 400) });
    card.events = card.events.map((e, j) => ({ ...e, id: `${id}-e-${j}`, ...e.sessionKey ? { sessionKey: card.sessionKey } : {} }));
    card.metadata.comments = card.metadata.comments.map((c, j) => ({ ...c, id: `${id}-c-${j}` }));
    card.metadata.automation = { boardId: "default", tenant: "nightshift", idempotencyKey: id };
    // a quarter are archived with a worktree never cleaned up (as on VLab's mirror)
    if (i % 4 === 0) Object.assign(card.metadata, { archivedAt: card.updatedAt }, { automation: { ...card.metadata.automation, workspace: { kind: "worktree", path: `/nonexistent/wt/${id}`, sourcePath: "/nonexistent/repo" } } });
    await store.cardStore.register(id, { version: 1, card });
  }
  return store;
}

async function run(label) {
  const store = await seed(path.join(stateRoot, `wb-${label}`));
  const all = await store.list();
  const recent = all.slice(-3).map((c) => ({ key: c.sessionKey, status: "done", updatedAt: Date.now() + 1 }));
  const everyone = all.map((c) => ({ key: c.sessionKey, status: "running", hasActiveRun: true, updatedAt: c.updatedAt }));
  const gateway = { isAvailable: async () => true, request: async (_m, p) => ({ sessions: p.activeMinutes ? recent : everyone }) };
  const { createWorkboardLifecycleService, readWorkboardLifecycleSessions } = lifecycle(sources[label]);
  let next;
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => (ms === 6e4 ? (next = fn, { unref() {} }) : realSetTimeout(fn, ms));
  let now = Date.now();
  const realNow = Date.now;
  Date.now = () => now;
  const synced = [];
  const syncLifecycle = store.syncLifecycle.bind(store);
  store.syncLifecycle = async (id, input) => { const changed = await syncLifecycle(id, input); if (changed) synced.push(all.find((c) => c.id === id)?.title ?? id); return changed; };
  const svc = createWorkboardLifecycleService({ store, readSessions: (o) => readWorkboardLifecycleSessions(gateway, o) });
  const warnings = [];
  svc.start({ logger: { warn: (m) => warnings.push(m) } });
  const blocks = [];
  const sweep = async () => {
    let last = performance.now(), gap = 0;
    const iv = setInterval(() => { const t = performance.now(); gap = Math.max(gap, t - last); last = t; }, 1);
    const fn = next; next = undefined;
    if (fn) fn(); else svc.onGatewayStart();
    while (!next) await new Promise((r) => setImmediate(r));
    await new Promise((r) => realSetTimeout(r, 20));
    clearInterval(iv);
    blocks.push(gap);
  };
  await sweep();
  synced.length = 0;
  for (let i = 0; i < 9; i += 1) { now += 60_000; await sweep(); }
  const partialSynced = [...synced].sort();
  now += 60_000; await sweep();
  svc.stop();
  globalThis.setTimeout = realSetTimeout;
  Date.now = realNow;
  const partial = blocks.slice(1, 10).sort((a, b) => a - b);
  return { cards: all.length, firstFullMs: Math.round(blocks[0]), partialMedianMs: Math.round(partial[4]), partialMaxMs: Math.round(partial.at(-1)), fullAt10MinMs: Math.round(blocks[10]), partialSynced, warnings };
}

const before = await run("before");
const after = await run("after");
console.log(JSON.stringify({ N, before: { ...before, partialSynced: before.partialSynced.length }, after: { ...after, partialSynced: after.partialSynced.length } }, null, 2));
assert.deepEqual(before.warnings, []);
assert.deepEqual(after.warnings, []);
assert.equal(before.partialSynced.length, 3);
assert.deepEqual(after.partialSynced, before.partialSynced);
assert(after.partialMedianMs * 3 < before.partialMedianMs, "patched partial sweeps must block under a third of unpatched ones");
