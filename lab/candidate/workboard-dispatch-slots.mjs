// Candidate test for lab/release-files/workboard-dispatch-slots: dispatch and the Night Shift owner
// cap must stop reading every card, and must count the same owner slots as before.
//
// After #302, workboard.cards.dispatchWithOptions still took p50 2.3-3.0 s on V (4,150 cards):
// runWorkboardDispatch read every card to count owner slots, and claimIfOwnerAvailable read every
// card and child row again inside its write transaction. This loads the shared VLab mirror's real
// Workboard database, grows it to V's size by cloning its own cards, adds cards in every slot state
// (running, review with a live / just expired / reclaimable claim, archived running, done with a
// claim, blocked with a running execution, plain ready), and on the runtime in place (plan without
// `files`: V's code with #302; with them: this patch):
//   - slots: per-owner counts of workboardCardConsumesOwnerSlot over list(), and, when the store
//     has it, over listOwnerSlotCandidates(); both runs must print the same `slots`;
//   - cost: a scoped dispatch that starts nothing (the full owner count still runs) and one
//     claimIfOwnerAvailable, each timed end to end and by the longest event-loop block.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime && process.env.OPENCLAW_STATE_DIR, "candidate runtime environment is required");
const TARGET = Number(process.env.TARGET_CARDS ?? 4150);
const ROUNDS = Number(process.env.ROUNDS ?? 10);
const dist = path.join(runtime, "openclaw", "dist");
const { r: WorkboardStore, n: dispatchAndStartWorkboardCards } = await import(path.join(dist, "runtime-api-1CCazqtv.js"));
const { h: consumesOwnerSlot, g: slotOwner } = await import(path.join(dist, "sqlite-store-CH-caj1l.js"));
const patched = fs.readFileSync(path.join(dist, "sqlite-store-CH-caj1l.js"), "utf8").includes("workboard-dispatch-slots");

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
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function renumber(value, prefix, counter) {
  if (Array.isArray(value)) return value.map((v) => renumber(v, prefix, counter));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = k === "id" && typeof v === "string" ? `${prefix}-${counter.n++}` : renumber(v, prefix, counter);
  return out;
}

const store = WorkboardStore.openSqlite();
const real = await store.list();
assert(real.length > 0, "the selected mirror database has no cards");
const now = Date.now();
const template = real.find((c) => c.status === "done") ?? real[0];
const states = {
  running: { status: "running" },
  reviewLiveClaim: { status: "review", claim: now + 10 * 60_000 },
  reviewJustExpired: { status: "review", claim: now - 1_000 },
  reviewReclaimable: { status: "review", claim: now - 24 * 3600_000 },
  archivedRunning: { status: "running", archived: true },
  doneWithClaim: { status: "done", claim: now + 10 * 60_000 },
  blockedRunningExecution: { status: "blocked", execution: "running" },
  blockedStoppedExecution: { status: "blocked", execution: "blocked" },
  readyPlain: { status: "ready" },
};
let made = 0;
for (let i = real.length; i < TARGET; i += 1) {
  const src = real[i % real.length];
  const id = `clone-${String(i).padStart(5, "0")}`;
  const card = { ...renumber(src, id, { n: 0 }), id };
  if (card.metadata?.links) card.metadata.links = card.metadata.links.filter((l) => l.type !== "parent" && l.type !== "child");
  // keep the mirror's own slot holders as they are; clones do not hold slots unless given a state below
  if (consumesOwnerSlot(card, now)) { card.status = "done"; if (card.metadata) { delete card.metadata.claim; } if (card.execution) card.execution = { ...card.execution, status: "done" }; }
  const names = Object.keys(states);
  if (i % 50 === 0) {
    const s = states[names[(i / 50) % names.length]];
    card.status = s.status;
    card.agentId = `owner-${(i / 50) % 4}`;
    card.metadata = { ...(card.metadata ?? {}) };
    delete card.metadata.claim;
    if (s.claim) card.metadata.claim = { ownerId: `owner-${(i / 50) % 3}`, claimedAt: now - 60_000, expiresAt: s.claim };
    if (s.archived) card.metadata.archivedAt = now - 1000; else delete card.metadata.archivedAt;
    if (s.execution) card.execution = { id: `${id}-exec`, kind: "agent-session", mode: "subagent", status: s.execution, startedAt: now - 60_000, updatedAt: now };
    else delete card.execution;
    made += 1;
  }
  await store.cardStore.register(id, { version: 1, card });
}

const countSlots = (cards) => {
  const byOwner = {};
  for (const card of cards) if (consumesOwnerSlot(card, now)) { const o = slotOwner(card); byOwner[o] = (byOwner[o] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(byOwner).sort());
};
const all = await store.list();
const slots = { fromFullList: countSlots(all) };
let candidates;
if (typeof store.cardStore.listOwnerSlotCandidates === "function") {
  candidates = await store.cardStore.listOwnerSlotCandidates();
  slots.fromCandidates = countSlots(candidates);
  assert.deepEqual(slots.fromCandidates, slots.fromFullList, "candidate rows must count the same owner slots");
}

// cost: a scoped dispatch that starts nothing still counts every owner slot first
const realList = store.list.bind(store);
let fullReads = 0;
store.list = async (options) => { if (!options?.cardIds && !options?.boardId) fullReads += 1; return await realList(options); };
const dispatch = [];
for (let i = 0; i < ROUNDS; i += 1) {
  fullReads = 0;
  const r = await timed(() => dispatchAndStartWorkboardCards({ store, subagent: {}, worktrees: {}, options: { boardId: "nightshift", cardIds: [], maxStarts: 1, workspaceAccess: { unrestricted: true } } }));
  dispatch.push({ ms: r.ms, blockMs: r.blockMs, fullReads, started: r.value.started.length });
}
// cost: one owner-cap claim on an idle card (writes the same card back)
const idle = all.find((c) => c.status === "ready" && !consumesOwnerSlot(c, now)) ?? all.find((c) => !consumesOwnerSlot(c, now));
const claim = [];
let current = await store.get(idle.id);
for (let i = 0; i < ROUNDS; i += 1) {
  const next = { ...current, updatedAt: current.updatedAt + 1 };
  const r = await timed(() => store.cardStore.claimIfOwnerAvailable(current.id, { version: 1, card: next }, current.updatedAt, "owner-0", now));
  claim.push({ ms: r.ms, blockMs: r.blockMs, result: r.value });
  current = await store.get(idle.id);
}
const summary = (xs) => ({ medianMs: med(xs.map((r) => r.ms)), medianBlockMs: med(xs.map((r) => r.blockMs)), maxBlockMs: Math.max(...xs.map((r) => r.blockMs)) });
console.log(JSON.stringify({
  patched, cards: all.length, slotStateCards: made, candidateRows: candidates?.length ?? null, slots: slots.fromFullList, slotsMatch: candidates ? true : "n/a",
  cost: {
    dispatch: { ...summary(dispatch), fullReadsPerDispatch: med(dispatch.map((d) => d.fullReads)), started: dispatch.reduce((s, d) => s + d.started, 0) },
    claim: { ...summary(claim), results: [...new Set(claim.map((c) => c.result))] },
  },
}, null, 2));
