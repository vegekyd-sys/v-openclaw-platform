// Candidate test for lab/release-files/workboard-start-context: starting a card and moving one
// into an active status must stop reading every card, with the same worker prompt and checks.
//
// After #306, dispatchWithOptions still took ~1.1 s on V: every card a dispatch starts runs
// buildWorkerContext, which read all 4,150 cards for its "Parent results" and "Recent done work"
// sections; assertActiveStatusAllowed read them all to check that parents are done. This loads the
// shared VLab mirror's real Workboard database, grows it to V's size by cloning its own cards (the
// clones keep their source's updatedAt, so the board is full of updatedAt ties), links some cards
// to parents, and with the patch in place compares, in one process with the clock frozen:
//   - context: buildWorkerContext with the new reads vs the original full-list path (the store
//     without listRecentDoneCardsForAgent), for a sample of cards; the text must be identical;
//   - checks: assertActiveStatusAllowed with parents read by id vs the full list, for cards with
//     parents moving to ready / running / review / done; same pass or same error;
//   - cost: both context paths timed by the longest event-loop block.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime && process.env.OPENCLAW_STATE_DIR, "candidate runtime environment is required");
const TARGET = Number(process.env.TARGET_CARDS ?? 4150);
const SAMPLE = Number(process.env.SAMPLE ?? 300);
const dist = path.join(runtime, "openclaw", "dist");
assert(fs.readFileSync(path.join(dist, "runtime-api-1CCazqtv.js"), "utf8").includes("workboard-start-context"), "run with the patch in place");
const { r: WorkboardStore } = await import(path.join(dist, "runtime-api-1CCazqtv.js"));

async function timed(fn) {
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const t = performance.now(); gap = Math.max(gap, t - last); last = t; }, 1);
  const start = performance.now();
  const value = await fn();
  const ms = performance.now() - start;
  await new Promise((r) => setTimeout(r, 2));
  clearInterval(iv);
  return { value, ms, blockMs: gap };
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
assert(real.length > 0);
const ids = [];
for (let i = real.length; i < TARGET; i += 1) {
  const src = real[i % real.length];
  const id = `clone-${String(i).padStart(5, "0")}`;
  const card = { ...renumber(src, id, { n: 0 }), id };
  if (card.metadata?.links) card.metadata.links = card.metadata.links.filter((l) => l.type !== "parent" && l.type !== "child");
  // every tenth clone gets two parents among the real cards (done or not), as Night Shift chains stages
  if (i % 10 === 0) {
    const parents = [real[(i * 7) % real.length], real[(i * 13) % real.length]];
    card.metadata = { ...(card.metadata ?? {}), links: [...(card.metadata?.links ?? []), ...parents.map((p, j) => ({ id: `${id}-pl-${j}`, type: "parent", targetCardId: p.id, createdAt: card.createdAt }))] };
  }
  await store.cardStore.register(id, { version: 1, card });
  ids.push(id);
}
const all = await store.list();
const withParents = all.filter((c) => (c.metadata?.links ?? []).some((l) => l.type === "parent"));
const step = Math.max(1, Math.floor(all.length / SAMPLE));
const sample = [...new Set([...all.filter((_, i) => i % step === 0), ...withParents.slice(0, 60)].map((c) => c.id))];

const realNow = Date.now;
const frozen = realNow();
Date.now = () => frozen;
const recentRead = store.cardStore.listRecentDoneCardsForAgent;
const viaFull = async (fn) => { store.cardStore.listRecentDoneCardsForAgent = undefined; try { return await fn(); } finally { store.cardStore.listRecentDoneCardsForAgent = recentRead; } };

// context
const differences = [];
const cost = { full: [], narrow: [] };
let same = 0, withRecent = 0, withParentSection = 0;
for (const id of sample) {
  const a = await timed(() => viaFull(() => store.buildWorkerContext(id)));
  const b = await timed(() => store.buildWorkerContext(id));
  cost.full.push(a.blockMs); cost.narrow.push(b.blockMs);
  if (a.value.includes("## Recent done work by")) withRecent += 1;
  if (a.value.includes("## Parent results")) withParentSection += 1;
  if (a.value === b.value) same += 1;
  else {
    let i = 0;
    while (i < a.value.length && a.value[i] === b.value[i]) i += 1;
    differences.push({ id, full: a.value.slice(Math.max(0, i - 120), i + 200), narrow: b.value.slice(Math.max(0, i - 120), i + 200) });
  }
}

// checks
const outcome = async (fn) => { try { await fn(); return "pass"; } catch (error) { return String(error.message); } };
const checkDifferences = [];
let checks = 0, blocked = 0;
for (const card of withParents.slice(0, 80)) for (const status of ["ready", "running", "review", "done"]) {
  const next = { ...card, status };
  const full = await outcome(async () => { const keep = store.cardStore; store.cardStore = undefined; try { await store.assertActiveStatusAllowed(card, next, frozen); } finally { store.cardStore = keep; } });
  const narrow = await outcome(() => store.assertActiveStatusAllowed(card, next, frozen));
  checks += 1;
  if (full !== "pass") blocked += 1;
  if (full !== narrow) checkDifferences.push({ id: card.id, status, full, narrow });
}
Date.now = realNow;

const summary = (xs) => ({ medianMs: Math.round(med(xs)), maxMs: Math.round(Math.max(...xs)) });
console.log(JSON.stringify({
  cards: all.length, withParents: withParents.length, sample: sample.length,
  context: { same, differenceCount: differences.length, withRecent, withParentSection, differences: differences.slice(0, 2) },
  checks: { checks, blocked, differenceCount: checkDifferences.length, differences: checkDifferences.slice(0, 3) },
  cost: { fullListBlock: summary(cost.full), narrowBlock: summary(cost.narrow) },
}, null, 2));
assert(withRecent > 0 && withParentSection > 0, "both sections must be exercised");
assert(blocked > 0 && blocked < checks, "both outcomes of the dependency check must be exercised");
assert.equal(differences.length, 0, "the worker context must be identical");
assert.equal(checkDifferences.length, 0, "the dependency check must decide the same");
