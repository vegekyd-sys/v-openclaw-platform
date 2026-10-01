// Same-session runtime switches on 9.6 (read-mostly; own regress96- sessions only):
//   vcc -> vcodex, vcodex -> vcc, vcc -> vds, vds -> vcodex (expected upstream reject), vcodex -> vds
// Each hop: sessions.patch {model} (what the Control UI picker does) and, separately, a chat
// "/model <alias>" directive followed by a marker turn (what a Feishu user does).
//   node r11-switch.mjs <label> <outDir> [mode=patch|directive|both]
import fs from "node:fs";
import path from "node:path";
import { discoverGateway, connect, rpc, chatScenario, nonce, writeReceipt } from "./lib.mjs";

const [label, outDir, modeArg] = process.argv.slice(2);
const mode = modeArg ?? "both";
fs.mkdirSync(outDir, { recursive: true });
const gw = discoverGateway();
const client = await connect(gw);
const n = nonce();
const A = { vcc: "anthropic/claude-opus-5", vcodex: "openai/gpt-5.6-sol", vds: "deepseek/deepseek-flash" };
const paths = [["vcc", "vcodex"], ["vcodex", "vcc"], ["vcc", "vds"], ["vcodex", "vds"], ["vds", "vcodex"]];
const rows = [];
const row = async (key, alias, how, i) => {
  const marker = `SW${i}_${alias.toUpperCase()}_${n}`;
  const spec = { id: `${how}-${alias}-${i}`, sessionKey: key, marker, tools: [], noTools: false, waitMs: 5 * 60_000,
    model: how === "patch" ? A[alias] : null,
    prompt: how === "directive" ? `/model ${alias}` : `不要调用任何工具，只回复精确文本 ${marker}。` };
  const r = await chatScenario(client, label, spec);
  const out = { id: spec.id, how, alias, patch: r.patch && { ok: r.patch.ok, error: String(r.patch.error ?? "").slice(0, 200) }, terminal: r.terminal,
    marker: r.bodyHasMarker, tail: r.bodyTail?.slice(-160), error: r.errorMessage?.slice(0, 200) };
  const s = ((await rpc(client, "sessions.list", { agentId: "makaron", search: key, limit: 3 }, 60_000)).result?.sessions ?? []).find((x) => x.key === key);
  out.session = s && { model: s.model, provider: s.modelProvider, runtime: s.agentRuntime?.id, source: s.agentRuntime?.source };
  rows.push(out); console.error(JSON.stringify(out));
  return out;
};
let i = 0;
for (const [from, to] of paths) {
  for (const how of mode === "both" ? ["patch", "directive"] : [mode]) {
    const key = `agent:makaron:explicit:regress96-${label}-${how}-${from}2${to}-${Date.now()}`;
    await row(key, from, "patch", ++i);           // first runtime via patch + marker turn
    if (how === "patch") await row(key, to, "patch", ++i);
    else {
      await row(key, to, "directive", ++i);       // "/model <to>"
      const m = `SW${++i}_AFTER_${n}`;
      const r = await chatScenario(client, label, { id: `after-${to}-${i}`, sessionKey: key, marker: m, tools: [], noTools: false, model: null, waitMs: 5 * 60_000,
        prompt: `不要调用任何工具，只回复精确文本 ${m}。` });
      const s = ((await rpc(client, "sessions.list", { agentId: "makaron", search: key, limit: 3 }, 60_000)).result?.sessions ?? []).find((x) => x.key === key);
      const out = { id: `after-${to}-${i}`, how: "turn-after-directive", alias: to, terminal: r.terminal, marker: r.bodyHasMarker, tail: r.bodyTail?.slice(-160), error: r.errorMessage?.slice(0, 200),
        session: s && { model: s.model, provider: s.modelProvider, runtime: s.agentRuntime?.id } };
      rows.push(out); console.error(JSON.stringify(out));
    }
  }
}
client.stop();
const file = writeReceipt(outDir, `r11-switch-${label}`, { label, version: gw.version, at: new Date().toISOString(), rows });
console.log(JSON.stringify({ file }));
process.exit(0);
