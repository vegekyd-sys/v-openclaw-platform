// Candidate test for lab/release-files/workboard-create-indexed: workboard.cards.create on a
// V-sized board must stop reading every card, and must create the same cards as before.
//
// On V (2026-10-09) workboard.cards.create took p50 1.9 s over 418 calls, growing with the board
// (1.5 s at 09:00 -> 2.2 s at 21:00, 4,150 cards, ~146k child rows); 401 of the 418 had a parent.
// WorkboardStore.createDirect began with this.list(), and linking the parent ran dependsOn, which
// read every card again, each read synchronous through node:sqlite on the Gateway main thread.
//
// This loads the shared VLab mirror's real Workboard database (selected with `databases`), grows
// it to V's size by cloning its own cards under new ids, and runs on the runtime in place (plan
// without `files`: V's code; with them: the patch):
//   - behaviour: default position, duplicate reuse through the top-level idempotencyKey the
//     native check reads (a new key and a real card's key), tenant and board split,
//     a parent link, a missing parent, a cycle, an empty column, an explicit position. Output is
//     normalised so both runs must print the same `behaviour` object;
//   - cost: Night Shift-shaped creates without and with a parent, each timed end to end and by the
//     longest stretch the event loop could not run a 1 ms timer.

import assert from "node:assert/strict";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateRoot = process.env.OPENCLAW_STATE_DIR;
assert(runtime && stateRoot, "candidate runtime environment is required");
const TARGET = Number(process.env.TARGET_CARDS ?? 4150);
const ROUNDS = Number(process.env.ROUNDS ?? 10);
const dist = path.join(runtime, "openclaw", "dist");
const { r: WorkboardStore, o: cardBoardId } = await import(path.join(dist, "runtime-api-1CCazqtv.js"));

async function timed(fn) {
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const t = performance.now(); gap = Math.max(gap, t - last); last = t; }, 1);
  const start = performance.now();
  const value = await fn();
  const ms = performance.now() - start;
  await new Promise((r) => setTimeout(r, 5));
  clearInterval(iv);
  return { value, ms: Math.round(ms), blockMs: Math.round(gap) };
}
const errorOf = async (fn) => { try { await fn(); return null; } catch (error) { return String(error.message); } };
const parentIds = (card) => (card.metadata?.links ?? []).filter((l) => l.type === "parent").map((l) => l.targetCardId);
const childIds = (card) => (card.metadata?.links ?? []).filter((l) => l.type === "child").map((l) => l.targetCardId);
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function renumber(value, prefix, counter) {
  if (Array.isArray(value)) return value.map((v) => renumber(v, prefix, counter));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = k === "id" && typeof v === "string" ? `${prefix}-${counter.n++}` : renumber(v, prefix, counter);
  return out;
}

const store = WorkboardStore.openSqlite();
const indexed = typeof store.cardStore?.findByAutomationIdempotencyKey === "function";
const real = await store.list();
assert(real.length > 0, "the selected mirror database has no cards");
for (let i = real.length; i < TARGET; i += 1) {
  const src = real[i % real.length];
  const id = `clone-${String(i).padStart(5, "0")}`;
  const card = { ...renumber(src, id, { n: 0 }), id };
  if (card.metadata?.automation?.idempotencyKey) card.metadata.automation = { ...card.metadata.automation, idempotencyKey: `${card.metadata.automation.idempotencyKey}#${id}` };
  // cloned links point at the source card's neighbours; keep them only as plain data
  if (card.metadata?.links) card.metadata.links = card.metadata.links.filter((l) => l.type !== "parent" && l.type !== "child");
  await store.cardStore.register(id, { version: 1, card });
}
const cards = await store.list();

// ---- behaviour (ids normalised to roles) ----
const tag = `t${process.pid}`;
const base = (over = {}) => ({ title: "behaviour", status: "todo", priority: "normal", agentId: "makaron", labels: ["nightshift"], notes: "behaviour", ...over });
const colMax = (list, board, status) => Math.max(0, ...list.filter((c) => c.status === status && cardBoardId(c) === board).map((c) => c.position));
const before = await store.list();
const x = await store.create(base({ boardId: "nightshift", idempotencyKey: `${tag}-k1` }));
const again = await store.create(base({ title: "again", boardId: "nightshift", idempotencyKey: `${tag}-k1` }));
const realKeyed = real.filter((c) => c.metadata?.automation?.idempotencyKey).toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0];
const { idempotencyKey: realKey, tenant: realTenant, boardId: realBoard } = realKeyed?.metadata.automation ?? {};
const reuseReal = realKeyed ? await store.create(base({ title: "real key", idempotencyKey: realKey, tenant: realTenant, boardId: realBoard })) : undefined;
const otherTenant = await store.create(base({ title: "tenant", boardId: "nightshift", tenant: "other", idempotencyKey: `${tag}-k1` }));
const otherBoard = await store.create(base({ title: "board", boardId: `${tag}-other`, idempotencyKey: `${tag}-k1` }));
const otherBoardAgain = await store.create(base({ title: "board again", boardId: `${tag}-other`, idempotencyKey: `${tag}-k1` }));
const child = await store.create(base({ title: "child", status: "ready", parents: [x.id], metadata: { automation: { boardId: "nightshift", idempotencyKey: `${tag}-k2` } } }));
const xAfter = await store.get(x.id);
const missingParent = await errorOf(() => store.create(base({ title: "orphan", parents: [`${tag}-missing`], metadata: { automation: { boardId: "nightshift", idempotencyKey: `${tag}-k3` } } })));
const grandchild = await store.create(base({ title: "grandchild", parents: [child.id], metadata: { automation: { boardId: "nightshift", idempotencyKey: `${tag}-k4` } } }));
const cycle = await errorOf(() => store.linkCards(grandchild.id, x.id));
const sideways = await errorOf(() => store.linkCards(otherTenant.id, grandchild.id));
const fresh = await store.create(base({ title: "fresh column", metadata: { automation: { boardId: `${tag}-fresh` } } }));
const explicit = await store.create(base({ title: "explicit", position: 12345, metadata: { automation: { boardId: "nightshift" } } }));
const behaviour = {
  positionAboveColumnMax: x.position - colMax(before, "nightshift", "todo"),
  duplicateReused: again.id === x.id,
  realKeyReused: realKeyed ? reuseReal.id === realKeyed.id : "no keyed card",
  otherTenantIsNew: otherTenant.id !== x.id,
  otherBoardIsNew: otherBoard.id !== x.id && otherBoard.id !== otherTenant.id,
  otherBoardReused: otherBoardAgain.id === otherBoard.id,
  realKeyBoard: realBoard ?? "default",
  childStatus: child.status,
  childParents: parentIds(child).map((id) => (id === x.id ? "x" : id)),
  parentChildren: childIds(xAfter).map((id) => (id === child.id ? "child" : id)),
  missingParent: missingParent?.replace(tag, "TAG"),
  grandchildParents: parentIds(grandchild).map((id) => (id === child.id ? "child" : id)),
  cycle,
  sidewaysLink: sideways,
  freshColumnPosition: fresh.position,
  explicitPosition: explicit.position,
  listUnchanged: (await store.list()).length - before.length,
};

// ---- cost: Night Shift-shaped creates, without and with a parent ----
const realList = store.list.bind(store);
let fullReads = 0;
store.list = async (options) => { if (!options?.cardIds && !options?.boardId) fullReads += 1; return await realList(options); };
const anchor = await store.create(base({ title: "anchor", metadata: { automation: { boardId: "nightshift", idempotencyKey: `${tag}-anchor` } } }));
const rounds = { plain: [], withParent: [] };
for (let i = 0; i < ROUNDS; i += 1) {
  for (const kind of ["plain", "withParent"]) {
    fullReads = 0;
    const r = await timed(() => store.create({
      boardId: "nightshift", title: `measure ${kind} ${i}`, status: "ready", priority: "normal", agentId: "makaron",
      labels: ["nightshift", "stage:produce", `ns-key:${tag}-${kind}-${i}`], notes: "n".repeat(2000),
      ...(kind === "withParent" ? { parents: [anchor.id] } : {}),
      metadata: { automation: { boardId: "nightshift", idempotencyKey: `${tag}-${kind}-${i}`, maxAttempts: 3, maxRuntimeSeconds: 3600 } },
    }));
    rounds[kind].push({ ms: r.ms, blockMs: r.blockMs, fullReads });
  }
}
const summary = (xs) => ({ medianMs: med(xs.map((r) => r.ms)), medianBlockMs: med(xs.map((r) => r.blockMs)), maxBlockMs: Math.max(...xs.map((r) => r.blockMs)), fullReadsPerCreate: med(xs.map((r) => r.fullReads)) });
console.log(JSON.stringify({ indexed, realCards: real.length, cards: cards.length, behaviour, cost: { plain: summary(rounds.plain), withParent: summary(rounds.withParent) }, rounds }, null, 2));
