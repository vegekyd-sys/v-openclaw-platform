// Candidate probe: which code holds the makaron Agent DB writer for >1 s when a
// few tool-heavy runs write at once?
//
// V 2026-09-29: 201 transaction holds over 1 s in one day (p50 1.3 s, p90 2.9 s,
// 10 over 5 s), while a single insert or commit on a copy of the database takes
// milliseconds. The process-wide writer admits one transaction at a time with a
// 5 s wait, so three or four writers each holding 1-3 s time out the last one:
// "Agent DB process coordinator wait exceeded 5000ms", nightshift cards blocked,
// replies cut off. Production logs carry no call site (98 of 201 holds unlabeled,
// 54 only "agent.write").
//
// In this run's private runtime copy only, logSlowTransactionHold reports every
// hold of HOLD_PROBE_MS or more with its call stack. CONCURRENCY runs of the
// production model (deepseek-flash, V's config on Gateway and Worker copies)
// each make TOOL_CALLS tool calls in parallel, the write pattern of nightshift
// cards. Output: one JSON summary grouped by call site.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const TOOL_CALLS = Number(process.env.TOOL_CALLS ?? 12);
const HOLD_PROBE_MS = Number(process.env.HOLD_PROBE_MS ?? 200);
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");

// ---- hold probe in the private runtime copy ----
{
  const marker = "function logSlowTransactionHold(params) {";
  const name = fs.readdirSync(dist).find((f) => /^node-sqlite-.*\.js$/u.test(f) && fs.readFileSync(path.join(dist, f), "utf8").includes(marker));
  assert(name, "logSlowTransactionHold not found");
  const file = path.join(dist, name);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(marker, `${marker}
	if (params.elapsedMs >= ${HOLD_PROBE_MS}) console.error("[hold-probe] " + JSON.stringify({ ms: params.elapsedMs, op: params.options?.operationLabel ?? null, db: params.options?.databaseLabel ?? null, pid: process.pid, stack: String(new Error().stack).split("\\n").slice(2, 18).map((s) => s.trim().replace(/^at /u, "").replace(/\\(file:[^)]*\\/dist\\//u, "(")).join(" < ") }));`));
}

// ---- production V's model entry and compaction model, on both config copies ----
// Same fields as V's models.providers.deepseek.models[id=deepseek-flash] (2026-09-29).
const flashEntry = {
  id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000000, maxTokens: 384000, api: "openai-completions",
  compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" },
};
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  deepseek.models = (deepseek.models ?? []).filter((m) => m.id !== flashEntry.id).concat([flashEntry]);
  const model = { primary: MODEL, fallbacks: [] };
  // V's per-agent entry: the Gateway hands the turn to vlab-worker, the Worker runs it on openclaw.
  // Without it the shared VLab config routes the model to the codex harness.
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) {
    config.agents.entries.makaron.model = model;
    (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent;
  }
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), model: MODEL };
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
  return config;
}

const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured; production runs turns in Workers");
Object.assign(workerPlugin, { minWorkers: CONCURRENCY, maxWorkers: CONCURRENCY, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
workerConfig.channels = {};
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- private Gateway ----
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) };
const lines = [];
let gateway, gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 40_000) lines.splice(0, lines.length - 40_000);
    });
  }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
        });
        client.start();
      });
      return;
    } catch (error) { lastError = error; client?.stop(); await sleep(1_000); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}

const PROMPT = (i) => [
  `（自动化测试 hold-${i}）请严格照做：`,
  `连续调用 exec 工具 ${TOOL_CALLS} 次，每次执行 \`echo step-N\`（N 从 1 到 ${TOOL_CALLS}），一次只调用一个，等上一次结果回来再调用下一次。`,
  "全部完成后只回复：完成。",
].join("");
async function runTurn(i) {
  const sessionKey = `agent:makaron:feishu:direct:ou_holdprobe_${Date.now()}_${i}`;
  const started = Date.now();
  const child = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", MODEL, "--message", PROMPT(i), "--json", "--timeout", "900"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const exit = await new Promise((resolve) => child.on("close", resolve));
  let meta; try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
  return { i, exit, secs: Math.round((Date.now() - started) / 1000),
    reply: String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "").slice(0, 60),
    stderr: exit === 0 ? undefined : redact(stderr).slice(-300) };
}

startGateway();
try {
  await connectGateway();
  const t0 = Date.now();
  const turns = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => runTurn(i)));
  const holds = lines.filter((l) => l.at >= t0 && l.line.includes("[hold-probe]")).map((l) => {
    try { return JSON.parse(l.line.slice(l.line.indexOf("{"))); } catch { return null; }
  }).filter(Boolean);
  const timeouts = lines.filter((l) => l.at >= t0 && /coordinator wait exceeded/u.test(l.line)).length;
  const slowAdmissions = lines.filter((l) => l.at >= t0 && /slow direct Agent DB process writer admission/u.test(l.line)).length;
  // group by the first frames that are not the transaction plumbing itself
  const site = (h) => h.stack.split(" < ").filter((f) => !/node-sqlite-|runSqliteImmediateTransactionSync|withAgentDbProcessWriter|agent-db-process-coordinator/u.test(f)).slice(0, 4).join(" < ");
  const groups = {};
  for (const h of holds) {
    const k = `${h.op ?? "-"} | ${site(h)}`;
    (groups[k] ??= []).push(h.ms);
  }
  const bySite = Object.entries(groups).map(([k, v]) => ({ site: k, n: v.length, totalMs: v.reduce((a, b) => a + b, 0), maxMs: Math.max(...v), p50: v.sort((a, b) => a - b)[Math.floor(v.length / 2)] }))
    .sort((a, b) => b.totalMs - a.totalMs);
  console.log(JSON.stringify({ concurrency: CONCURRENCY, toolCalls: TOOL_CALLS, probeMs: HOLD_PROBE_MS, turns, holds: holds.length, timeouts, slowAdmissions,
    bySite: bySite.slice(0, 25), sampleStacks: holds.sort((a, b) => b.ms - a.ms).slice(0, 5) }, null, 1));
  assert(turns.some((t) => t.exit === 0), "no turn completed; the load was not generated");
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
