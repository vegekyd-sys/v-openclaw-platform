// Poll models.list availability of selected codex-runtime models (read-only).
//   node catalog-poll.mjs <out.jsonl> <minutes> [intervalS=20]
import fs from "node:fs";
import { discoverGateway, connect, rpc, sleep } from "./lib.mjs";
const [out, minutes, iv] = process.argv.slice(2);
const gw = discoverGateway(); const c = await connect(gw);
const want = ["openai/gpt-5.6-sol", "openai/gpt-6-astra", "deepseek/deepseek-flash", "anthropic/claude-opus-5", "openai/gpt-5.6-terra"];
const end = Date.now() + Number(minutes) * 60_000;
while (Date.now() < end) {
  const r = await rpc(c, "models.list", {}, 60_000);
  const row = { at: new Date().toISOString(), ok: r.ok, ms: r.ms };
  for (const k of want) { const m = (r.result?.models ?? []).find((m) => `${m.provider}/${m.id}` === k); row[k] = m ? `${m.available}${m.unavailableReason ? ":" + m.unavailableReason : ""}` : "absent"; }
  fs.appendFileSync(out, JSON.stringify(row) + "\n");
  await sleep(Number(iv ?? 20) * 1000);
}
c.stop(); process.exit(0);
