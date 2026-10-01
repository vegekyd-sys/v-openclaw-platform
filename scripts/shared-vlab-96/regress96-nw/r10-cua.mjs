// computer tool + desktop handoff across runtimes on 9.6 no-worker, with V's execution-idle patch:
//  A  /vcc (claude-cli) takes a screenshot; its execution is never closed by a run cleanup (MCP loopback)
//  B  a different session (native runtime) asks for one screenshot inside the idle window -> COMPUTER_HOST_BUSY (fault path)
//  C  same session after the 300 s window -> screenshot succeeds (execution released by idle-expired)
//  D  /vcodex (codex, gpt-5.6-sol) fresh session -> computer works
//  E  /vcc asks desktop_handoff_request -> a control link is issued (link never printed)
//   node r10-cua.mjs <label> <outDir>
import fs from "node:fs";
import path from "node:path";
import { discoverGateway, connect, chatScenario, nonce, sleep, toolResults, writeReceipt, run } from "./lib.mjs";

const [label, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const gw = discoverGateway();
const client = await connect(gw);
const n = nonce();
const red = (t) => String(t).replace(/https?:\/\/\S+/g, "<url>").replace(/[A-Za-z0-9_-]{32,}/g, "<opaque>").slice(0, 240);
const comp = (h) => toolResults(h).filter((x) => /computer/.test(x.toolName));
const rows = [];
async function step(spec, check) {
  const row = await chatScenario(client, label, { waitMs: 8 * 60_000, noTools: false, ...spec });
  row.computer = comp(row.history).map((x) => ({ tool: x.toolName, via: x.via, isError: x.isError, text: red(x.text) }));
  try { row.checkOk = await check(row); } catch (e) { row.checkOk = false; row.checkError = String(e).slice(0, 300); }
  row.pass = row.terminal === "final" && row.checkOk;
  fs.writeFileSync(path.join(outDir, `history-cua-${spec.id}.json`), JSON.stringify(row.history ?? null, null, 1));
  delete row.history; rows.push(row);
  console.error(`${spec.id}: ${row.pass ? "PASS" : "FAIL"} terminal=${row.terminal} tools=${row.tools?.join(",")} computer=${JSON.stringify(row.computer).slice(0, 300)}`);
  return row;
}
const since = new Date().toISOString();
const A = await step({ id: "A-vcc-open", marker: `CUAA_${n}`, model: "anthropic/claude-opus-5", tools: [],
  prompt: `必须调用 computer 工具截一张屏幕截图（只截一张），不要做其他操作。完成后只回复 CUAA_${n}。` },
  (r) => r.computer.length > 0 && !r.computer.some((c) => c.isError));
const aEnd = Date.now();
const bKey = `agent:makaron:explicit:regress96-${label}-cua-native-${Date.now()}`;
const B = await step({ id: "B-native-busy", sessionKey: bKey, marker: `CUAB_${n}`, tools: [],
  prompt: `必须调用 computer 工具截一张屏幕截图，只调用一次，失败也不要重试，也不要用其他工具。如果工具报错，原样引用错误码。最后一行回复 CUAB_${n}。` },
  (r) => { r.busySeen = r.computer.some((c) => /COMPUTER_HOST_BUSY/.test(c.text)) || /COMPUTER_HOST_BUSY/.test(r.bodyTail);
    r.withinWindowS = Math.round((Date.now() - aEnd) / 1000); return r.busySeen; });
const waitMs = Math.max(0, aEnd + 330_000 - Date.now());
console.error(`waiting ${Math.round(waitMs / 1000)}s for the idle window`);
await sleep(waitMs);
const C = await step({ id: "C-native-after-idle", sessionKey: bKey, marker: `CUAC_${n}`, tools: [],
  prompt: `再调用一次 computer 工具截一张屏幕截图（只调用一次）。如果工具报错，原样引用错误码。最后一行回复 CUAC_${n}。` },
  (r) => { const mine = r.computer.slice(B.computer.length); r.newCalls = mine; return mine.length > 0 && !mine.some((c) => c.isError || /COMPUTER_HOST_BUSY/.test(c.text)); });
const D = await step({ id: "D-vcodex", marker: `CUAD_${n}`, model: "openai/gpt-5.6-sol", tools: [],
  prompt: `必须调用 computer 工具截一张屏幕截图，然后把鼠标移动到 (500,400)。完成后只回复 CUAD_${n}。` },
  (r) => r.computer.length > 0 && !r.computer.some((c) => c.isError || /COMPUTER_HOST_BUSY/.test(c.text)));
const E = await step({ id: "E-vcc-handoff", marker: `HOF_${n}`, model: "anthropic/claude-opus-5", tools: [],
  prompt: `调用 desktop_handoff_request 工具为我生成一个桌面控制链接（原因：回归测试）。不要把链接写进回复，只回复 HOF_${n} 以及链接是否已生成（yes/no）。` },
  (r) => true);
{ const h = JSON.parse(fs.readFileSync(path.join(outDir, "history-cua-E-vcc-handoff.json"), "utf8"));
  const res = toolResults(h).filter((x) => /desktop_handoff_request/.test(x.toolName));
  E.handoff = { calls: res.length, isError: res.some((x) => x.isError), linkIssued: res.some((x) => /https?:\/\//.test(x.text)), sample: res.map((x) => red(x.text)) };
  E.checkOk = res.length > 0 && !E.handoff.isError && E.handoff.linkIssued; E.pass = E.terminal === "final" && E.checkOk; }
let nodeLog = "";
try { nodeLog = run("bash", ["-c", `journalctl -u vlab-cua-node --since '${since.replace("T", " ").slice(0, 19)} UTC' --no-pager -o cat | grep -oE 'idle-expired|COMPUTER_HOST_BUSY|completion|snapshot-complete' | sort | uniq -c || true`], 60_000); } catch {}
client.stop();
const file = writeReceipt(outDir, `r10-cua-${label}`, { label, version: gw.version, at: new Date().toISOString(), nonce: n, nodeLogReasons: nodeLog, rows });
console.log(JSON.stringify({ file, pass: Object.fromEntries(rows.map((r) => [r.id, r.pass])), busySeen: B.busySeen, withinWindowS: B.withinWindowS, handoff: { calls: E.handoff.calls, linkIssued: E.handoff.linkIssued }, nodeLog }));
process.exit(0);
