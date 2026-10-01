// sol availability before/after one codex turn on another model (astra). Own regress96- session only.
import { discoverGateway, connect, rpc, chatScenario, nonce } from "./lib.mjs";
const gw = discoverGateway(); const c = await connect(gw);
const sol = async () => ((await rpc(c, "models.list", {}, 60_000)).result?.models ?? []).find((m) => m.provider === "openai" && m.id === "gpt-5.6-sol")?.available;
console.log("before", await sol());
const n = nonce();
const r = await chatScenario(c, "solprobe", { id: "astra", model: process.argv[2] ?? "openai/gpt-6-astra", marker: `AST_${n}`, tools: [], noTools: false, prompt: `不要调用任何工具，只回复精确文本 AST_${n}。` });
console.log("astra turn", r.terminal, r.bodyHasMarker, r.patch?.ok, r.patch?.error ?? "");
for (let i = 0; i < 4; i++) { console.log("after", i, await sol()); await new Promise((x) => setTimeout(x, 5000)); }
c.stop(); process.exit(0);
