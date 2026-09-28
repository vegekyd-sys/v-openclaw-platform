// Show (and with --reset, set) the model of the Feishu group sessions used by fs-load to the
// agent default (deepseek/deepseek-v4-flash, runtime openclaw). Own VLab test groups only.
//   node fs-sessions.mjs <chat,...> [--reset]
import { discoverGateway, connect, rpc } from "./lib.mjs";
const [chats, flag] = process.argv.slice(2);
const gw = discoverGateway(); const c = await connect(gw);
for (const chat of chats.split(",")) {
  const key = `agent:makaron:feishu:group:${chat}`;
  const s = ((await rpc(c, "sessions.list", { agentId: "makaron", search: chat, limit: 5 }, 60_000)).result?.sessions ?? []).find((x) => x.key === key);
  let patched;
  if (flag === "--reset" && s && (s.model !== "deepseek-v4-flash" || s.agentRuntime?.id !== "openclaw")) {
    const r = await rpc(c, "sessions.patch", { key, agentId: "makaron", model: "deepseek/deepseek-v4-flash" }, 120_000);
    patched = r.ok ? "reset" : `reset-failed:${String(r.error).slice(0, 80)}`;
  }
  console.log(JSON.stringify({ chat: chat.slice(-6), exists: Boolean(s), model: s?.model, runtime: s?.agentRuntime?.id, patched }));
}
c.stop(); process.exit(0);
