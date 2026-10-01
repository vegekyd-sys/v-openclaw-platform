// One read-only probe per agent DB: chat.history on an own regress96 session (or a fresh key),
// timing it and a parallel health call, to see whether the agent DB is usable.
//   node probe-agent.mjs <agentId> <sessionKey> <outDir>
import { discoverGateway, connect, rpc, writeReceipt, sleep } from "./lib.mjs";
const [agentId, sessionKey, outDir] = process.argv.slice(2);
if (!sessionKey.includes("regress96-")) throw new Error("own sessions only");
const gw = discoverGateway();
const client = await connect(gw);
const t0 = Date.now();
const healthTimes = [];
let done = false;
(async () => { while (!done) { const h = await rpc(client, "health", {}, 15_000); healthTimes.push({ t: Date.now() - t0, ok: h.ok, ms: h.ms }); await sleep(5_000); } })();
const h = await rpc(client, "chat.history", { agentId, sessionKey, limit: 5 }, 590_000);
done = true;
const out = { agentId, sessionKey, at: new Date(t0).toISOString(), history: { ok: h.ok, ms: h.ms, error: h.error, messages: h.result?.messages?.length }, healthTimes };
writeReceipt(outDir, `probe-${agentId}-${t0}`, out);
console.log(JSON.stringify(out));
client.stop(); process.exit(0);
