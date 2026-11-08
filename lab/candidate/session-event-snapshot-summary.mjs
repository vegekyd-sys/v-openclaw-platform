// Summarise a probed runtime-concurrency run (lab/session-event-snapshot.md).
//   node lab/candidate/session-event-snapshot-summary.mjs <OUT_DIR>
// Per measured level: turns, snapshot calls per turn by call site, single-call p50/p95, total per turn, and
// the share of the main thread's CPU in the same window (threadCpuSettled.main, which covers the level and
// its 15 s settle). Also lifecycle loads outside the builder (spawnedBy), transcript-broadcast rows,
// handleEvent as a whole, and how often a row equals the previous row of the same session.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 15_000);
const jsonl = (file) => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
const progress = jsonl(path.join(dir, "progress.jsonl"));
const probe = jsonl(path.join(dir, "probe.jsonl")).sort((a, b) => a.t - b.t);
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const harnessOf = (key = "") => key.includes(":lt-vds-") ? "vds" : key.includes(":lt-flash-") ? "flash" : "other";

const levels = progress.filter((p) => p.phase === "level" || p.phase === "ab-level").map((p) => {
  const to = Date.parse(p.at);
  const from = to - SETTLE_MS - p.wallS * 1000 - 2_000;
  const rows = probe.filter((r) => r.t >= from && r.t <= to);
  const own = (r) => harnessOf(r.k) === p.arm;
  const snaps = rows.filter((r) => r.s !== "load" && r.s !== "event" && r.s !== "transcript.row" && !r.sh);
  const bySite = {};
  for (const r of snaps) (bySite[r.s] ??= []).push(r.ms);
  const turns = (p.byRuntime && Object.values(p.byRuntime).reduce((a, b) => a + (b.n ?? 0), 0)) || p.c;
  const mainCpuMs = (p.threadCpuSettled?.byComm?.main ?? p.threadCpu?.byComm?.main ?? 0) * 1000;
  const snapMs = sum(snaps.map((r) => r.ms));
  const transcript = rows.filter((r) => r.s === "transcript.row");
  const loadsOutside = rows.filter((r) => r.s === "load" && !r.in && !r.sh);
  const events = rows.filter((r) => r.s === "event");
  // a row equal to the previous row of the same session (same hash), the ceiling for a cross-event cache
  const last = new Map();
  let same = 0;
  for (const r of snaps.filter((x) => !x.s.startsWith("lifecycle"))) { if (last.get(r.k) === r.h) same += 1; last.set(r.k, r.h); }
  const plain = snaps.filter((x) => !x.s.startsWith("lifecycle"));
  return {
    side: p.side, round: p.round, arm: p.arm, task: p.task, c: p.c, turns, correct: p.byRuntime ? Object.values(p.byRuntime).reduce((a, b) => a + (b.ok ?? 0), 0) : null,
    otherSessionRows: snaps.filter((r) => !own(r)).length,
    mainCpuS: +(mainCpuMs / 1000).toFixed(1),
    snapshot: {
      calls: snaps.length, perTurn: +(snaps.length / turns).toFixed(1), p50: pct(snaps.map((r) => r.ms), 0.5), p95: pct(snaps.map((r) => r.ms), 0.95),
      msPerTurn: +(snapMs / turns).toFixed(1), totalMs: Math.round(snapMs), shareOfMain: mainCpuMs ? +(100 * snapMs / mainCpuMs).toFixed(2) : null,
      bySite: Object.fromEntries(Object.entries(bySite).map(([k, v]) => [k, { n: v.length, perTurn: +(v.length / turns).toFixed(2), p50: pct(v, 0.5), p95: pct(v, 0.95), ms: Math.round(sum(v)) }])),
      sameAsPreviousRow: plain.length ? +(same / plain.length).toFixed(2) : null,
      shadow: { compared: rows.filter((r) => r.sh === 1 && r.s !== "load").length, differ: rows.filter((r) => r.diff?.length).length, diffKeys: [...new Set(rows.flatMap((r) => r.diff ?? []))].slice(0, 20), sharedObject: rows.filter((r) => r.sharedObject).length },
    },
    transcriptRow: { calls: transcript.length, perTurn: +(transcript.length / turns).toFixed(1), p50: pct(transcript.map((r) => r.ms), 0.5), p95: pct(transcript.map((r) => r.ms), 0.95), totalMs: Math.round(sum(transcript.map((r) => r.ms))), shareOfMain: mainCpuMs ? +(100 * sum(transcript.map((r) => r.ms)) / mainCpuMs).toFixed(2) : null },
    loadOutsideBuilder: { calls: loadsOutside.length, totalMs: Math.round(sum(loadsOutside.map((r) => r.ms))) },
    handleEvent: { calls: events.length, perTurn: +(events.length / turns).toFixed(1), totalMs: Math.round(sum(events.map((r) => r.ms))), shareOfMain: mainCpuMs ? +(100 * sum(events.map((r) => r.ms)) / mainCpuMs).toFixed(2) : null, byStream: Object.fromEntries(Object.entries(Object.groupBy(events, (r) => r.st ?? "?")).map(([k, v]) => [k, v.length])) },
    completionP50S: p.byRuntime ? Object.values(p.byRuntime)[0]?.doneP50 ?? null : null,
    stallMaxMs: p.stallMaxMs,
  };
});
const bench = progress.filter((p) => p.phase === "snapshot-bench").map((p) => ({ gapMs: p.gapMs, results: (p.result?.results ?? []).map((r) => ({ key: r.key, hasEntry: r.rows[0]?.hasEntry, storeKeys: r.rows[0]?.storeKeys, childSessions: r.rows[0]?.childSessions, bytes: r.rows[0]?.bytes, first: r.rows[0], entryP50: pct(r.rows.slice(1).map((x) => x.entryMs), 0.5), loadP50: pct(r.rows.slice(1).map((x) => x.loadMs), 0.5), loadP95: pct(r.rows.slice(1).map((x) => x.loadMs), 0.95), loadMax: Math.max(...r.rows.map((x) => x.loadMs)) })), error: p.result?.error }));
console.log(JSON.stringify({ levels, bench }, null, 1));
