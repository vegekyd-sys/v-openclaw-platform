// A/B harness for the dreaming transcript-corpus listing.
// Usage: node --expose-gc dreaming-corpus-ab.mjs <distDir> <variant:baseline|patched> <agentId> <outJson> [iterations]
// Runs the exact listing call dreaming makes (baseline options vs patched options), records wall time,
// heap delta, the longest synchronous block observed by a 5ms timer, and a content fingerprint of the
// returned corpus (contentRevision excluded) so two runs can be compared for equivalence.
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const [distDir, variant, agentId = "makaron", outJson, itersRaw = "3"] = process.argv.slice(2);
const iters = Number(itersRaw);
const u = (f) => pathToFileURL(path.join(distDir, f)).href;
const sessions = await import(u("memory-core-host-engine-sessions-CAnvQ_5o.js"));
const ioRt = await import(u("io.runtime-CKu7Rw0j.js"));
const listCorpus = sessions.m;
ioRt.n(); // load config once (dreaming runs inside a process that already has it)
const options = variant === "patched"
  ? { includeRetainedSqlite: true, includeContentRevision: false, entryProjection: "list" }
  : { includeRetainedSqlite: true };
// longest synchronous block: a 5ms interval timer measures how late it fires
let lastTick = performance.now();
let maxBlock = 0;
const ticker = setInterval(() => { const now = performance.now(); maxBlock = Math.max(maxBlock, now - lastTick - 5); lastTick = now; }, 5);
const fingerprint = (entries) => {
  const rows = entries.map((e) => [e.agentId, e.artifactKind, e.sessionFile, e.sessionId, e.sessionKind, e.transcriptSource ?? "", e.storePath ?? "", e.updatedAtMs ?? "", e.sessionKey ?? "", e.generatedByDreamingNarrative ? 1 : 0, e.generatedByCronRun ? 1 : 0].join("|")).sort();
  return { count: rows.length, sha256: createHash("sha256").update(rows.join("\n")).digest("hex"), sample: rows.slice(0, 3) };
};
const runs = [];
let fp = null;
// iteration 0 is a warm-up (it pays the cold database open); excluded from the A/B numbers but recorded
for (let i = 0; i <= iters; i++) {
  if (global.gc) global.gc();
  const h0 = process.memoryUsage().heapUsed;
  lastTick = performance.now();
  maxBlock = 0;
  const t0 = performance.now();
  const entries = await listCorpus(agentId, options);
  const ms = performance.now() - t0;
  await new Promise((r) => setTimeout(r, 20));
  const heapDeltaMb = (process.memoryUsage().heapUsed - h0) / 1048576;
  const f = fingerprint(entries);
  fp ??= f;
  runs.push({ iteration: i, warmup: i === 0, ms: Math.round(ms), maxSyncBlockMs: Math.round(maxBlock), heapDeltaMb: Math.round(heapDeltaMb), count: f.count, sha256: f.sha256 });
  console.log(JSON.stringify(runs.at(-1)));
}
clearInterval(ticker);
const measured = runs.filter((r) => !r.warmup);
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const summary = {
  distDir, variant, agentId, options, fingerprint: fp, runs,
  medianMs: median(measured.map((r) => r.ms)),
  maxSyncBlockMs: Math.max(...measured.map((r) => r.maxSyncBlockMs)),
  medianHeapDeltaMb: median(measured.map((r) => r.heapDeltaMb)),
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
console.log("summary", JSON.stringify({ medianMs: summary.medianMs, maxSyncBlockMs: summary.maxSyncBlockMs, medianHeapDeltaMb: summary.medianHeapDeltaMb, count: fp.count, sha256: fp.sha256 }));
process.exit(0);
