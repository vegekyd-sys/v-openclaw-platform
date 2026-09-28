// Journal + JSON-log evidence since the Gateway's start: startup proofs, failure signatures
// (any hit fails the linked patch), and per-scenario correlation with an r1 receipt
// (E7 first-text lines per runId, worker lines, relay lines).  Read-only.
//   node r3-logs.mjs <label> <outDir> [r1-receipt.json ...]
import fs from "node:fs";
import { discoverGateway, journal, jsonLogLines, writeReceipt, firstMatches, countMatches } from "./lib.mjs";
import { SIGNATURES } from "./signatures.mjs";

const [label, outDir, ...receipts] = process.argv.slice(2);
const gw = discoverGateway();
const local = (gw.startedAt.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/) ?? [])[0];
if (!local) throw new Error(`cannot parse start ${gw.startedAt}`);
const startIso = new Date(`${local.replace(" ", "T")}+08:00`).toISOString();
const j = journal(local);
const json = jsonLogLines(gw, startIso);
const jsonText = json.map((l) => `${l.time} ${typeof l[0] === "string" ? l[0] : ""} ${l.message ?? ""} ${JSON.stringify(l[1] ?? "").slice(0, 600)} ${JSON.stringify(l[2] ?? "").slice(0, 600)}`).join("\n");
const all = `${j}\n${jsonText}`;
const out = { label, at: new Date().toISOString(), pid: gw.pid, gatewayStartedAt: gw.startedAt, startIso, journalLines: j.split("\n").length, jsonLines: json.length };

out.signatures = SIGNATURES.map((s) => {
  const re = new RegExp(s.re, "i");
  const count = all.split("\n").filter((l) => re.test(l)).length;
  const pass = s.kind === "fail" ? count === 0 : s.kind === "proof" ? count > 0 : null;
  return { id: s.id, kind: s.kind, re: s.re, count, pass, samples: firstMatches(all, re, 3, 400), note: s.note };
});

// Startup timeline.
const ready = firstMatches(j, /\[gateway\] ready/, 1, 200)[0];
out.ready = ready ?? null;

// Per-scenario correlation.
out.scenarios = [];
for (const r of receipts) {
  const rec = JSON.parse(fs.readFileSync(r, "utf8"));
  for (const row of rec.rows ?? []) {
    const fm = all.split("\n").filter((l) => l.includes("[firsttext-metrics]") && l.includes(row.runId));
    const stages = [...new Set(fm.map((l) => (l.match(/"stage":"([^"]+)"/) ?? [])[1]).filter(Boolean))];
    const models = [...new Set(fm.map((l) => `${(l.match(/"provider":"([^"]+)"/) ?? [])[1]}/${(l.match(/"model":"([^"]+)"/) ?? [])[1]}`))];
    const efforts = [...new Set(fm.map((l) => (l.match(/"effort":"([^"]+)"/) ?? [])[1]).filter(Boolean))];
    const pids = [...new Set(fm.map((l) => (l.match(/"pid":(\d+)/) ?? [])[1]).filter(Boolean))];
    const ws = all.split("\n").filter((l) => l.includes("[firsttext-ws-metrics]") && l.includes(row.runId));
    const wsStages = [...new Set(ws.map((l) => (l.match(/"stage":"([^"]+)"/) ?? [])[1]).filter(Boolean))];
    const keyLines = all.split("\n").filter((l) => l.includes(row.sessionKey));
    out.scenarios.push({ id: row.id, runId: row.runId, firsttext: { lines: fm.length, stages, models, efforts, pids, gatewayPid: pids.includes(String(gw.pid)) },
      firsttextWs: { lines: ws.length, stages: wsStages }, sessionKeyLines: keyLines.length,
      sessionKeySamples: keyLines.filter((l) => /error|fail|warn|refus|reject/i.test(l)).slice(0, 5).map((l) => l.slice(0, 400)) });
  }
}
const file = writeReceipt(outDir, `r3-logs-${label}`, out);
console.log(JSON.stringify({ file, ready: out.ready, failHits: out.signatures.filter((s) => s.kind === "fail" && s.count > 0).map((s) => `${s.id}:${s.count}`),
  proofsMissing: out.signatures.filter((s) => s.kind === "proof" && s.count === 0).map((s) => s.id),
  scenarios: out.scenarios.map((s) => `${s.id}: ft=${s.firsttext.lines}(${s.firsttext.stages.length} stages) ws=${s.firsttextWs.lines}`) }));
process.exit(0);
