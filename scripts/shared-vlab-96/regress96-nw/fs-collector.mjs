// Gateway-side collector for a Feishu load level (run as root on the Gateway host):
//   node fs-collector.mjs <label> <seconds> <outDir> <sessionKey,...>
// Subscribes to each session and records, per session, the first assistant text delta
// (agent stream "assistant" / chat delta), tool events and terminal chat states with
// wall-clock ms. Journal "received message from ... in <chat>" gives the Feishu inbound
// time; the two together are the Gateway-side first-text latency (E7 has no session key).
import fs from "node:fs";
import { discoverGateway, connect, rpc, UNIT } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const [label, secsArg, outDir, keysArg] = process.argv.slice(2);
const keys = keysArg.split(",");
const gw = discoverGateway();
const t0 = Date.now();
const per = Object.fromEntries(keys.map((k) => [k, { runs: {}, firstText: null, firstTool: null, finals: [], errors: [] }]));
const client = await connect(gw, {
  onEvent(ev) {
    const p = ev.payload ?? {}; const k = p.sessionKey; const s = per[k]; if (!s) return;
    const now = Date.now();
    if (ev.event === "agent" && p.stream === "assistant" && (p.data?.delta || p.data?.text) && s.firstText === null) s.firstText = now;
    if (ev.event === "chat" && p.state === "delta" && s.firstText === null) s.firstText = now;
    if (ev.event === "agent" && p.stream === "tool" && s.firstTool === null) s.firstTool = now;
    if (ev.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { s.finals.push({ at: now, state: p.state, runId: p.runId }); if (p.errorMessage) s.errors.push(String(p.errorMessage).slice(0, 200)); }
  },
});
for (const k of keys) await rpc(client, "sessions.messages.subscribe", { agentId: "makaron", key: k }, 30_000);
fs.writeFileSync(`${outDir}/collector-${label}.ready`, String(Date.now()));
while (Date.now() - t0 < Number(secsArg) * 1000 && !fs.existsSync(`${outDir}/stop-${label}`)) await new Promise((r) => setTimeout(r, 1000));
client.stop();
const since = new Date(t0).toISOString().replace("T", " ").slice(0, 19);
const j = execFileSync("journalctl", ["-u", UNIT, "--since", `${since} UTC`, "--no-pager", "-o", "short-iso-precise"], { encoding: "utf8", maxBuffer: 512 << 20 });
const received = {};
for (const line of j.split("\n")) {
  const m = line.match(/^(\S+) .*received message from \S+ in (oc_[0-9a-f]+)/);
  if (m) (received[m[2]] ??= []).push(Date.parse(m[1]));
}
fs.writeFileSync(`${outDir}/collector-${label}.json`, JSON.stringify({ label, t0, per, received }, null, 1));
console.log(JSON.stringify({ label, sessions: keys.length, withFirstText: Object.values(per).filter((s) => s.firstText).length }));
process.exit(0);
