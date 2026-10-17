#!/usr/bin/env node
// A/B for the Workboard sweep precheck on a copy of a real workboard.sqlite.
//
//   node workboard-sweep-light-ab.mjs <openclaw-dist-dir> <state-dir> <scenario> <seed> <out.json>
//
// <openclaw-dist-dir> is an original or patched dist whose extensions/workboard/__ab.js is a copy
// of index.js with `export { syncWorkboardLifecycleSessions as __abSync };` appended (test copy
// only). <state-dir> holds plugins/workboard/workboard.sqlite and is modified in place. The
// sessions snapshot is generated deterministically from the cards and the seed, so the original
// and patched runs receive identical input; compare the resulting databases afterwards.
//
// Scenarios:
//   steady  every linked session reports what its card already recorded (the V steady state:
//           thousands of finished cards, nothing to change)
//   mixed   random states, ages and run flags, including stale and failed sessions

import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [distDir, stateDir, scenario, seedArg, outFile] = process.argv.slice(2);
process.env.OPENCLAW_STATE_DIR = path.resolve(stateDir);
const rt = await import(pathToFileURL(path.join(distDir, "runtime-api-1CCazqtv.js")).href);
const mod = await import(pathToFileURL(path.join(distDir, "extensions/workboard/__ab.js")).href);
const WorkboardStore = rt.r;
const lookupKey = rt.a;

let seed = Number(seedArg) >>> 0 || 1;
const rand = () => (seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0) / 2 ** 32;
const pick = (values) => values[Math.floor(rand() * values.length)];

const NOW = 1_792_220_000_000;
const store = WorkboardStore.openSqlite();
const cards = await store.list();
const sessions = [];
const seen = new Set();
for (const card of cards) {
  if (card.metadata?.archivedAt) continue;
  const key = lookupKey(card);
  if (!key || seen.has(key)) continue;
  seen.add(key);
  const recorded = card.metadata?.lifecycleStatusSourceUpdatedAt ?? card.execution?.updatedAt ?? card.updatedAt;
  if (scenario === "steady") {
    const status = card.status === "running" ? "running" : card.status === "blocked" ? "failed" : "done";
    sessions.push({ key, updatedAt: recorded, status, hasActiveRun: card.status === "running" });
    continue;
  }
  const status = pick(["running", "done", "failed", "killed", "timeout", undefined]);
  const age = pick([0, 30e3, 10 * 60e3, 31 * 60e3, 3 * 3600e3, 5 * 86400e3]);
  const updatedAt = pick([recorded, NOW - age, recorded - 1, recorded + 1]);
  sessions.push({
    key,
    updatedAt,
    ...status ? { status } : {},
    hasActiveRun: status === "running" ? rand() < 0.5 : false,
    ...rand() < 0.1 ? { abortedLastRun: true } : {},
  });
}

const t0 = performance.now();
const changed = await mod.__abSync({ store, cards, sessions, complete: true, now: NOW });
const ms = Math.round(performance.now() - t0);
const result = { distDir, scenario, seed: Number(seedArg), cards: cards.length, sessions: sessions.length, changed, ms };
writeFileSync(outFile, JSON.stringify(result));
console.log(JSON.stringify(result));
process.exit(0);
