// Summarise the A/B of lab/candidate/subagent-control-scoped-read-load.plan.json from progress.jsonl.
//   node lab/candidate/subagent-control-scoped-read-summary.mjs <progress.jsonl>
// Main-thread CPU is /proc/<gateway>/task/<gateway>/stat from before the level to 15 s after its last reply.
import fs from "node:fs";

const levels = fs.readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.phase === "ab-level");
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const out = { levels: levels.length, byTask: {} };
for (const task of [...new Set(levels.map((row) => row.task))]) {
  const rows = levels.filter((row) => row.task === task && typeof row.round === "number");
  const side = (name) => {
    const s = rows.filter((row) => row.side === name);
    const vds = s.map((row) => row.byRuntime.vds);
    return {
      levels: s.length,
      turns: vds.reduce((a, v) => a + v.n, 0),
      correct: vds.reduce((a, v) => a + v.ok, 0),
      mainCpuS: s.map((row) => row.threadCpuSettled.byComm.main),
      mainCpuMedianS: median(s.map((row) => row.threadCpuSettled.byComm.main)),
      allThreadsMedianS: median(s.map((row) => Object.values(row.threadCpuSettled.byComm).reduce((a, v) => a + v, 0))),
      donePerLevelP50S: median(vds.map((v) => v.doneP50)),
      firstPerLevelP50S: median(vds.map((v) => v.firstP50)),
      sessionStatusP50S: median(s.map((row) => row.toolSummary.session_status?.p50).filter((v) => v != null)),
      stallMaxMedianMs: median(s.map((row) => row.stallMaxMs ?? 0)),
      wallMedianS: median(s.map((row) => row.wallS)),
      loadAtEnd: s.map((row) => row.host?.load?.split(" ")[0]),
      otherCandidates: s.map((row) => row.host?.otherCandidates),
    };
  };
  const off = side("off");
  const on = side("on");
  // pairs in run order: the difference within a round cancels the host's drift
  const rounds = [...new Set(rows.map((row) => row.round))];
  const pairs = rounds.map((round) => {
    const cpu = (name) => rows.find((row) => row.round === round && row.side === name)?.threadCpuSettled.byComm.main;
    return { round, off: cpu("off"), on: cpu("on"), diff: Math.round((cpu("off") - cpu("on")) * 10) / 10 };
  });
  out.byTask[task] = { off, on, pairs, pairDiffMedianS: median(pairs.map((p) => p.diff)) };
}
console.log(JSON.stringify(out, null, 1));
