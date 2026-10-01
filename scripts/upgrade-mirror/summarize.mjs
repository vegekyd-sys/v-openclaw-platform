// summarize.mjs <dir>...: one markdown row per step file.
import fs from "node:fs";
const rows = [];
for (const dir of process.argv.slice(2)) for (const f of fs.readdirSync(dir).filter((f) => f.startsWith("step-")).sort()) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  const e = j.eld, c = j.cpu, l = j.lat ?? {};
  const s = (v) => (v == null ? "-" : (v / 1000).toFixed(1));
  rows.push(`| ${j.label} | ${j.at.slice(11, 16)} | ${e.p50} / ${e.p95} / ${e.p99} / ${e.max} | ${e.lag ? `${e.lag.p50} / ${e.lag.p95} / ${e.lag.p99}` : "-"} | ${c.mainThreadAvg ?? "-"} | ${c.gatewayAvg} / ${c.gatewayPeak5s} | ${c.instanceAvg} / ${c.instancePeak5s} | ${c.otherHostAvg} | ${j.liveness.warning + j.liveness.heartbeatDelayed} | ${s(l.firstP50)} / ${s(l.firstP95)} | ${s(l.totalP50)} / ${s(l.totalP95)} | ${j.bench.finals ?? "-"}/${j.count} err=${j.bench.errors ?? "-"} | ${c.wallS} | ${j.loadBefore.split(" ")[0]} |`);
}
console.log("| step | at | ELD p50/p95/p99/max ms | JS lag p50/p95/p99 ms | main thr cores | GW avg/peak5s | inst avg/peak5s | other-host | liveness | first p50/p95 s | total p50/p95 s | ok | wall s | load1 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
console.log(rows.join("\n"));
