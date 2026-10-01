// Background sampler during the chat phase (read-only): A2 writer-coordinator holders and A4
// maintenance-permit holders on every agent DB (from /proc/locks), plus catalog plugin-build
// directories created since the start (79e127b / ff3f092), and Gateway RSS.
//   node r8-locks.mjs <label> <outDir> <seconds>
import fs from "node:fs";
import path from "node:path";
import { discoverGateway, writeReceipt, sleep, run } from "./lib.mjs";

const [label, outDir, secs] = process.argv.slice(2);
const gw = discoverGateway();
const S = gw.env.OPENCLAW_STATE_DIR;
const dbs = fs.readdirSync(path.join(S, "agents")).map((a) => path.join(S, "agents", a, "agent", "openclaw-agent.sqlite")).filter((f) => fs.existsSync(f));
const ino = (f) => { try { return fs.statSync(f).ino; } catch { return null; } };
const files = [];
for (const db of dbs) for (const kind of ["session-writer-coordinator", "automatic-maintenance-coordinator"]) {
  const i = ino(`${db}.${kind}`); if (i) files.push({ agent: db.split("/").at(-3), kind, ino: i });
}
const t0 = new Date();
const t0Local = t0.toLocaleString("sv-SE", { timeZone: "Asia/Taipei" });
const countBuilds = () => Number(run("bash", ["-c", `find ${S}/tmp/plugin-captures -maxdepth 4 -path '*openclaw-model-catalog-*/openclaw-plugin-build-*' -newermt '${t0Local}' 2>/dev/null | wc -l`]));
const state = Object.fromEntries(files.map((f) => [`${f.agent}:${f.kind}`, { holders: new Set(), maxConcurrent: 0, acquisitions: [], cur: new Set() }]));
const rss = [];
const end = Date.now() + Number(secs) * 1000;
let samples = 0;
while (Date.now() < end) {
  const locks = fs.readFileSync("/proc/locks", "utf8").split("\n").filter((l) => l && !l.includes("->"));
  for (const f of files) {
    const s = state[`${f.agent}:${f.kind}`];
    const now = new Set(locks.filter((l) => l.includes(`:${f.ino} `)).map((l) => l.trim().split(/\s+/)[4]));
    for (const p of now) { s.holders.add(p); if (!s.cur.has(p)) s.acquisitions.push({ pid: p, at: Date.now() }); }
    s.cur = now; s.maxConcurrent = Math.max(s.maxConcurrent, now.size);
  }
  if (samples % 20 === 0) { try { rss.push({ at: Date.now(), rssMB: Math.round(Number(fs.readFileSync(`/proc/${gw.pid}/statm`, "utf8").split(" ")[1]) * 4096 / 1048576) }); } catch {} }
  samples++;
  await sleep(250);
}
const summary = {};
for (const [k, s] of Object.entries(state)) {
  if (s.holders.size === 0) continue;
  const gaps = s.acquisitions.slice(1).map((a, i) => a.at - s.acquisitions[i].at);
  summary[k] = { holders: [...s.holders], holderIsGateway: [...s.holders].map((p) => Number(p) === gw.pid), maxConcurrent: s.maxConcurrent, acquisitions: s.acquisitions.length, minGapMs: gaps.length ? Math.min(...gaps) : null };
}
const out = { label, t0: t0.toISOString(), seconds: Number(secs), samples, gatewayPid: gw.pid, coordinators: summary, catalogBuildsSinceT0: countBuilds(), rss };
const file = writeReceipt(outDir, `r8-locks-${label}`, out);
console.log(JSON.stringify({ file, coordinators: summary, catalogBuildsSinceT0: out.catalogBuildsSinceT0, rssFirstLast: [rss[0], rss.at(-1)] }));
process.exit(0);
