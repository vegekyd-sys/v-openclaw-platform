// Functional acceptance on the upgrade mirror: real Gateway, real worker pool
// (or in-process turns in 9.6 no-worker mode, see runtime-mode.mjs), real model. Each scenario opens its own session, asks for one specific tool,
// then checks the history for that tool call and the expected reply marker.
// Also exercises a few Gateway RPCs. Writes one JSON receipt.
//   node accept.mjs <label> <outDir>
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { acceptanceRpcs, runtimeMode } from "./runtime-mode.mjs";

const [label, outDir] = process.argv.slice(2);
assert.equal(os.hostname(), "VM-0-4-ubuntu");
assert(label && /^[a-z0-9-]+$/.test(label) && outDir && fs.existsSync(outDir));
const unit = process.env.VERSA_UNIT ?? "versa-mirror95-gateway.service";
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", timeout: 10_000 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pid = Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"]));
assert(pid > 1, "gateway not running");
const argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
const core = argv.find((v) => v.endsWith("/openclaw/dist/index.js")).slice(0, -"/dist/index.js".length);
const version = JSON.parse(fs.readFileSync(`${core}/package.json`, "utf8")).version;
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((e) => e.includes("="))
  .map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]));
Object.assign(process.env, env);
const config = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
const mode = runtimeMode(config);
const { GatewayClient } = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
const model = "deepseek/deepseek-v4-flash";
const byRunId = new Map();
let client;

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
  client = new GatewayClient({
    url: `ws://127.0.0.1:${config.gateway.port}`,
    token: config.gateway.auth.token.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => env[k]),
    deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
    scopes: ["operator.read", "operator.write", "operator.admin"],
    onHelloOk() { clearTimeout(timer); resolve(); },
    onConnectError(e) { clearTimeout(timer); reject(e); },
    onEvent(event) {
      const row = byRunId.get(event.payload?.runId);
      if (!row) return;
      if (event.event === "agent" && event.payload?.stream === "tool") {
        const name = event.payload.data?.name ?? event.payload.data?.toolName;
        if (name) row.toolEvents.add(name);
      }
      if (event.event === "chat" && ["final", "error", "aborted"].includes(event.payload?.state)) {
        row.terminal = event.payload.state; row.totalMs = Date.now() - row.sentAtMs;
        if (event.payload?.errorMessage) row.errorMessage = String(event.payload.errorMessage).slice(0, 400);
      }
    },
  });
  client.start();
});

const nonce = crypto.randomBytes(3).toString("hex").toUpperCase();
const scenarios = [
  { id: "plain", tools: [], marker: `PLAIN_${nonce}`,
    prompt: (m) => `不要调用任何工具，只回复精确文本 ${m}。` },
  { id: "exec", tools: ["exec", "bash"], marker: `EXEC_${nonce}`,
    prompt: (m) => `必须调用 exec 工具运行命令 echo ${m}，然后只回复命令输出的那一行文本。` },
  { id: "memory_search", tools: ["memory_search"], marker: `MEMORY_${nonce}`,
    prompt: (m) => `必须先调用 memory_search 工具搜索“测试”，不管结果如何，最后只回复 ${m}。` },
  { id: "cron", tools: ["cron", "automations"], marker: `CRON_${nonce}`,
    prompt: (m) => `必须调用 cron 工具列出当前的定时任务（只读，不要创建或修改），最后只回复 ${m}。` },
  { id: "workboard", tools: ["workboard*"], marker: `BOARD_${nonce}`,
    prompt: (m) => `必须调用 workboard 工具列出现有的看板（只读，不要创建或修改任何东西），最后只回复 ${m}。` },
  { id: "sessions_spawn", tools: ["sessions_spawn"], marker: `CHILD_${nonce}`, followUpMs: 120_000,
    prompt: (m) => `必须调用 sessions_spawn 工具启动一个子代理，任务是“只回复 ${m}”。等子代理完成后，只回复子代理返回的文本。` },
];
const rows = [];
for (const s of scenarios) {
  const runId = crypto.randomUUID();
  const sessionKey = `agent:makaron:explicit:accept-${label}-${s.id}-${Date.now()}`;
  await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model }, { timeoutMs: 20_000 });
  await client.request("sessions.messages.subscribe", { agentId: "makaron", key: sessionKey }, { timeoutMs: 20_000 });
  const row = { id: s.id, runId, sessionKey, marker: s.marker, expectTools: s.tools, toolEvents: new Set() };
  rows.push(row); byRunId.set(runId, row);
  row.sentAtMs = Date.now();
  await client.request("chat.send", { agentId: "makaron", sessionKey, message: s.prompt(s.marker), deliver: false,
    idempotencyKey: runId, timeoutMs: 600_000 }, { timeoutMs: 60_000 });
  const deadline = Date.now() + 6 * 60_000;
  while (!row.terminal && Date.now() < deadline) await sleep(500);
  const readHistory = () => client.request("chat.history", { agentId: "makaron", sessionKey, limit: 60 }, { timeoutMs: 60_000 });
  const assistantText = (h) => (h.messages ?? []).filter((m) => m.role === "assistant")
    .map((m) => (Array.isArray(m.content) ? m.content : []).filter((p) => p.type === "text").map((p) => p.text).join("\n")).join("\n");
  let history = await readHistory();
  // A spawned child's result can arrive as a later turn in the same session.
  const followUntil = Date.now() + (s.followUpMs ?? 0);
  while (!assistantText(history).includes(s.marker) && Date.now() < followUntil) {
    await sleep(3_000);
    history = await readHistory();
  }
  const toolNames = new Set(row.toolEvents);
  for (const m of history.messages ?? []) {
    if (m.role === "toolResult" && m.toolName) toolNames.add(m.toolName);
    for (const p of Array.isArray(m.content) ? m.content : []) if ((p.type === "toolCall" || p.type === "tool_use") && p.name) toolNames.add(p.name);
  }
  const body = assistantText(history).trim();
  row.tools = [...toolNames]; delete row.toolEvents;
  row.bodyHasMarker = body.includes(s.marker);
  const matches = (want) => want.endsWith("*") ? [...toolNames].some((n) => n.startsWith(want.slice(0, -1))) : toolNames.has(want);
  row.toolOk = s.tools.length === 0 ? toolNames.size === 0 : s.tools.some(matches);
  row.pass = row.terminal === "final" && row.bodyHasMarker && row.toolOk;
  row.bodyTail = body.slice(-160);
  console.error(`${s.id}: ${row.pass ? "PASS" : "FAIL"} terminal=${row.terminal} tools=${row.tools.join(",")} ${Math.round((row.totalMs ?? 0) / 1000)}s`);
}
const rpcs = [];
for (const [method, params] of acceptanceRpcs(mode)) {
  const at = Date.now();
  try { await client.request(method, params, { timeoutMs: 60_000 }); rpcs.push({ method, ok: true, ms: Date.now() - at }); }
  catch (error) { rpcs.push({ method, ok: false, ms: Date.now() - at, error: String(error?.message ?? error).slice(0, 200) }); }
  console.error(`rpc ${method}: ${rpcs.at(-1).ok ? "ok" : "FAIL " + rpcs.at(-1).error} ${rpcs.at(-1).ms}ms`);
}
client.stop();
const out = `${outDir}/accept-${label}-${Date.now()}.json`;
const summary = { label, version, core, mode, at: new Date().toISOString(), pass: rows.every((r) => r.pass) && rpcs.every((r) => r.ok),
  passed: rows.filter((r) => r.pass).length, total: rows.length, rows, rpcs };
fs.writeFileSync(out, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ out, pass: summary.pass, passed: summary.passed, total: summary.total, rpcsOk: rpcs.filter((r) => r.ok).length }));
