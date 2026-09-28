// sessions.reset for the VLab test groups' Feishu sessions (new session id, current transcript format).
//   node fs-reset.mjs <chat,...>
import { discoverGateway, connect, rpc } from "./lib.mjs";
const gw = discoverGateway(); const c = await connect(gw);
for (const chat of process.argv[2].split(",")) {
  const key = `agent:makaron:feishu:group:${chat}`;
  const r = await rpc(c, "sessions.reset", { key, agentId: "makaron", reason: "new" }, 120_000);
  const s = ((await rpc(c, "sessions.list", { agentId: "makaron", search: chat, limit: 3 }, 60_000)).result?.sessions ?? []).find((x) => x.key === key);
  console.log(JSON.stringify({ chat: chat.slice(-6), ok: r.ok, error: r.ok ? undefined : String(r.error).slice(0, 160), sessionId: s?.sessionId?.slice(0, 8), model: s?.model, runtime: s?.agentRuntime?.id }));
}
c.stop(); process.exit(0);
