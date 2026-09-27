// Tool stress on the upgrade mirror (skill_workshop, openclaw, sessions_spawn,
// image x3 in parallel): real Gateway, real worker pool or in-process turns
// (9.6 no-worker mode, see runtime-mode.mjs), real model. Each scenario opens its own session, asks for one specific tool,
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
const REPEAT = Number(process.env.STRESS_REPEAT ?? 3);
const base = [
  { id: "openclaw", tools: ["openclaw"], marker: `OC_${nonce}`, followUpMs: 60_000,
    prompt: (m) => `必须调用 openclaw 工具，请系统代理只读地检查并报告当前默认模型和推理设置（不要修改任何东西），最后只回复 ${m}。` },
  { id: "image", tools: ["image_generate"], marker: `IMG_${nonce}`, followUpMs: 300_000, failurePattern: /EACCES|permission denied|没法|无法|失败|未能|没有产出|failed/i,
    prompt: (m) => `必须调用 image_generate 工具生成一张简单的小图：白底上一个红色圆形（不要用其他工具，不要用 makaron）。调用后本回合只回复 WAIT。图片生成完成后你会收到完成通知，届时只回复 ${m}。` },
  { id: "skill_workshop", tools: ["skill_workshop"], marker: `SW_${nonce}`,
    prompt: (m) => `必须调用 skill_workshop 工具（action=list）列出现有提案，不管结果如何，最后只回复 ${m}。` },
  { id: "sessions_spawn", tools: ["sessions_spawn"], marker: `CHILD_${nonce}`, followUpMs: 120_000,
    prompt: (m) => `必须调用 sessions_spawn 工具启动一个子代理，任务是“只回复 ${m}”。等子代理完成后，只回复子代理返回的文本。` },
];
const scenarios = [];
for (let i = 0; i < REPEAT; i++) for (const s of base.filter((b) => !process.env.STRESS_ONLY || process.env.STRESS_ONLY.split(",").includes(b.id))) scenarios.push({ ...s, id: `${s.id}-${i}` });
const rows = [];
async function runScenario(s) {

  const runId = crypto.randomUUID();
  const sessionKey = `agent:makaron:explicit:accept-${label}-${s.id}-${Date.now()}`;
  await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model }, { timeoutMs: 90_000 });
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
  // The marker alone is not proof: a failed image run answers "我没法回 IMG_x"
  // (2026-09-28, EACCES on the makaron workspace, scored PASS). A failure
  // explanation in the reply fails the row.
  row.failureText = s.failurePattern ? (body.match(s.failurePattern)?.[0] ?? null) : null;
  row.pass = row.terminal === "final" && row.bodyHasMarker && row.toolOk && !row.failureText;
  row.bodyTail = body.slice(-160);
  console.error(`${s.id}: ${row.pass ? "PASS" : "FAIL"} terminal=${row.terminal} tools=${row.tools.join(",")} ${Math.round((row.totalMs ?? 0) / 1000)}s`);
}
// A scenario that throws before its row exists (e.g. sessions.patch timing
// out) must still fail the run: 2026-09-28 a stalled Gateway timed out 11 of
// 12 scenarios and the summary read pass=true, passed=1/1.
const scenarioErrors = [];
await Promise.all(scenarios.map((s, i) => sleep(i * Number(process.env.STRESS_GAP_MS ?? 3000)).then(() => runScenario(s).catch((e) => { scenarioErrors.push({ id: s.id, error: String(e?.message ?? e).slice(0, 200) }); console.error(s.id, "ERROR", e?.message); }))));
const rpcs = [];
for (const [method, params] of acceptanceRpcs(mode)) {
  const at = Date.now();
  try { await client.request(method, params, { timeoutMs: 60_000 }); rpcs.push({ method, ok: true, ms: Date.now() - at }); }
  catch (error) { rpcs.push({ method, ok: false, ms: Date.now() - at, error: String(error?.message ?? error).slice(0, 200) }); }
  console.error(`rpc ${method}: ${rpcs.at(-1).ok ? "ok" : "FAIL " + rpcs.at(-1).error} ${rpcs.at(-1).ms}ms`);
}
client.stop();
const out = `${outDir}/stress-${label}-${Date.now()}.json`;
const summary = { label, version, core, mode, at: new Date().toISOString(), pass: scenarioErrors.length === 0 && rows.length === scenarios.length && rows.every((r) => r.pass) && rpcs.every((r) => r.ok),
  passed: rows.filter((r) => r.pass).length, total: scenarios.length, scenarioErrors, rows, rpcs };
fs.writeFileSync(out, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ out, pass: summary.pass, passed: summary.passed, total: summary.total, rpcsOk: rpcs.filter((r) => r.ok).length }));
