// Candidate: real turns through a private Gateway on copies of V's large sessions, with V's
// model routing: 7da00997 (Feishu DM) and 06d45f08 deepseek-flash through vlab-worker,
// 3c3fab41 (Night Shift group) and 2b21b4a0 through the Codex harness (/vds). Run once with the
// plan's files (B) and once without (A). For every session two turns are sent back to back, the
// second as soon as the first finished, which is when V's media continuations met a rebuilding
// projection on 2026-10-17 00:39.
// Reported: turn results and durations, the longest Gateway and Worker main-thread stalls (10 ms
// sampler preloaded into every process), every projection dirty mark and every
// "projection is rebuilding" error with its stack, and SQLite holds >= 300 ms with their stacks.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const SOURCE_DB = process.env.SOURCE_DB;
assert(SOURCE_DB && fs.existsSync(SOURCE_DB), "SOURCE_DB is missing");
const TURN_PLAN = JSON.parse(process.env.TURN_PLAN); // [{sessionKey, sessionId, model: "flash"|"vds"}]
const TURNS = Number(process.env.TURNS ?? 2);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 20_000);
const PROMPT = process.env.PROMPT ?? "（自动化测试）这是一条连通性测试消息。不要继续之前任何未完成的任务，不要调用任何工具，只回复：收到。";
const MODEL = "deepseek/deepseek-flash";
const VDS_REF = "deepseek/vds-deepseek-flash";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const secrets = new Set();
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of secrets) if (v) out = out.replaceAll(v, "[redacted]");
  return out;
};
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const dist = path.join(runtime, "openclaw", "dist");
const patched = fs.readFileSync(path.join(dist, "session-transcript-index-9itOio9h.js"), "utf8").includes("transcript-projection-checkpoint-v1");
const STACK = `((Error.stackTraceLimit = Math.max(Error.stackTraceLimit, 50)), String(new Error().stack)).split("\\n").slice(2, 30).map((s) => s.trim().replace(/^at /u, "").replace(/\\(file:[^)]*\\/dist\\//u, "(")).join(" < ")`;
function inject(file, marker, code, where = "after") {
  const p = path.join(dist, file);
  const src = fs.readFileSync(p, "utf8");
  assert.equal(src.split(marker).length, 2, `${file}: probe marker is not unique`);
  fs.writeFileSync(p, src.replace(marker, where === "after" ? `${marker}\n${code}` : `${code}\n${marker}`));
}
// ---- probes in the private runtime copy ----
inject("node-sqlite-CL-d6drd.js", "function logSlowTransactionHold(params) {", `	if (params.elapsedMs >= 300) console.error("[hold-probe] " + JSON.stringify({ ms: params.elapsedMs, op: params.options?.operationLabel ?? null, pid: process.pid, stack: ${STACK} }));`);
inject("session-transcript-index-9itOio9h.js", "function markSessionTranscriptIndexDirtyInTransaction(db, sessionId) {", `	console.error("[dirty-probe] " + JSON.stringify({ sessionId, pid: process.pid, at: Date.now(), stack: ${STACK} }));`);
inject("session-accessor-K0XuW6ln.js", "		super(`Session transcript projection is rebuilding: ${sessionId}`);", `		console.error("[unavailable-probe] " + JSON.stringify({ sessionId, pid: process.pid, at: Date.now(), stack: ${STACK} }));`);
const stallProbe = path.join(stateDir, "stall-probe.mjs");
fs.writeFileSync(stallProbe, `let last = performance.now();
const t = setInterval(() => { const now = performance.now(); const gap = now - last - 10; last = now; if (gap >= 200) console.error("[stall-probe] " + JSON.stringify({ ms: Math.round(gap), pid: process.pid, at: Date.now() })); }, 10);
t.unref();
`);

// ---- configuration as on V (same entries as agent-db-lock-holders.mjs) ----
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
{
  // V's /vds: the Codex harness with DeepSeek behind it (codex-ds-window.mjs, PR #262 shape)
  const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
  if (!config.models.providers.deepseek.models.some((m) => m.id === "vds-deepseek-flash")) config.models.providers.deepseek.models.push({ ...flashEntry, id: "vds-deepseek-flash", name: "DeepSeek V4.1 Flash (Codex vds alias)" });
  config.agents.defaults.models[VDS_REF] = vdsEntry;
  config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
  const allowed = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allowed) && !allowed.includes(VDS_REF)) allowed.push(VDS_REF);
  config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
  const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(codexHome, "config.toml"), `[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured; production runs turns in Workers");
Object.assign(workerPlugin, { minWorkers: 2, maxWorkers: 2, warmSpareWorkers: 0 });
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


// ---- managed npm plugins (codex etc.) as installed on shared VLab; the private state has none ----
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}


// ---- private Gateway ----
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const cacheDir = path.join(scratch, "cache");
const shortTmp = `/tmp/.pcp-${process.pid}`;
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH_IDLE_MS: FLUSH_IDLE_MS, TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
const deepseekKey = secret("DEEPSEEK_API_KEY");
assert(deepseekKey, "DEEPSEEK_API_KEY missing from shared secrets.env");
env.DEEPSEEK_API_KEY = deepseekKey;
secrets.add(deepseekKey);
const lines = [];
let gateway, gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    let rest = "";
    s.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u);
      rest = parts.pop();
      for (const line of parts.filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 60_000) lines.splice(0, lines.length - 60_000);
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
const probeLines = (tag, t0) => lines.filter((l) => l.at >= t0 && l.line.includes(tag)).map((l) => {
  const role = /^\[vlab-worker:\d+\]/u.test(l.line) ? "worker" : "gateway";
  try { return { at: l.at, role, ...JSON.parse(l.line.slice(l.line.indexOf("{", l.line.indexOf(tag)))) }; } catch { return null; }
}).filter(Boolean);
const site = (h) => h.stack.split(" < ").filter((f) => !/node-sqlite-|runSqlite[A-Za-z]*TransactionSync|__readProbe|Probed|withOpenClawAgentDatabaseReadOnly|withSessionContextAdmission|agent-db-process-coordinator|runWithSqliteBusyTimeout/u.test(f)).slice(0, 6).join(" < ");

async function runChatTurn(sessionKey, i, model) {
  const started = Date.now();
  try {
    if (model === "vds" && i === 0) {
      try { await client.request("sessions.patch", { key: sessionKey, model: VDS_REF }); } catch (error) { console.error(`sessions.patch model failed: ${redact(error?.message ?? error)}`); }
    }
    const sent = await client.request("chat.send", { agentId: "makaron", sessionKey, message: PROMPT.replace("（自动化测试）", `（自动化测试 pc-${i}）`),
      deliver: false, thinking: "low", timeoutMs: 600000, idempotencyKey: `projection-checkpoint-${Date.now()}-${i}` });
    const runId = sent?.runId;
    assert(runId, `chat.send returned no runId: ${JSON.stringify(sent).slice(0, 200)}`);
    const waited = await client.request("agent.wait", { runId, timeoutMs: 600000 }, { timeoutMs: 620000 });
    return { i, path: "chat", exit: waited?.status === "ok" ? 0 : 1, status: waited?.status, secs: Math.round((Date.now() - started) / 1000), error: waited?.error ? redact(JSON.stringify(waited.error)).slice(0, 300) : undefined };
  } catch (error) {
    return { i, path: "chat", exit: 1, secs: Math.round((Date.now() - started) / 1000), error: redact(String(error?.message ?? error)).slice(0, 300) };
  }
}

// ---- private makaron database: a fresh copy of the exported V sessions ----
const dbDir = path.join(stateDir, "agents", "makaron", "agent");
fs.mkdirSync(dbDir, { recursive: true });
for (const name of fs.readdirSync(dbDir)) if (name.startsWith("openclaw-agent.sqlite")) fs.rmSync(path.join(dbDir, name), { force: true });
assert.equal(spawnSync("cp", ["--reflink=auto", SOURCE_DB, path.join(dbDir, "openclaw-agent.sqlite")]).status, 0, "copy source database");

const probe = (tag, t0) => lines.filter((l) => l.at >= t0 && l.line.includes(tag)).map((l) => {
  const role = /^\[vlab-worker:\d+\]/u.test(l.line) ? "worker" : "gateway";
  try { return { role, ...JSON.parse(l.line.slice(l.line.indexOf("{", l.line.indexOf(tag)))) }; } catch { return null; }
}).filter(Boolean);
const frames = (stack, n = 7) => String(stack ?? "").split(" < ").filter((f) => !/node-sqlite-|runSqlite[A-Za-z]*TransactionSync|withOpenClawAgentDatabase|agent-db-process-coordinator|runWithSqliteBusyTimeout|async_context|processTicks/u.test(f)).slice(0, n).join(" < ");

env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --import ${stallProbe}`.trim();
startGateway();
const report = { patched, turns: [] };
try {
  await connectGateway();
  await sleep(10_000);
  const t0 = Date.now();
  for (const s of TURN_PLAN) {
    for (let i = 0; i < TURNS; i++) {
      const started = Date.now();
      const r = await runChatTurn(s.sessionKey, i, s.model);
      report.turns.push({ session: s.sessionId.slice(0, 8), model: s.model, ...r, startedAt: started, endedAt: Date.now() });
    }
  }
  await sleep(SETTLE_MS);
  const stalls = probe("[stall-probe]", t0);
  const gatewayPid = gateway.pid;
  report.stalls = {
    gatewayMaxMs: Math.max(0, ...stalls.filter((s) => s.pid === gatewayPid).map((s) => s.ms)),
    gatewayOver1s: stalls.filter((s) => s.pid === gatewayPid && s.ms >= 1000).length,
    gatewayOver200ms: stalls.filter((s) => s.pid === gatewayPid).length,
    otherMaxMs: Math.max(0, ...stalls.filter((s) => s.pid !== gatewayPid).map((s) => s.ms)),
    gatewayTop: stalls.filter((s) => s.pid === gatewayPid).sort((a, b) => b.ms - a.ms).slice(0, 8).map((s) => ({ ms: s.ms, at: s.at })),
  };
  report.dirty = probe("[dirty-probe]", t0).map((d) => ({ role: d.role, session: d.sessionId.slice(0, 8), at: d.at, site: frames(d.stack) }));
  report.unavailable = probe("[unavailable-probe]", t0).map((d) => ({ role: d.role, session: d.sessionId.slice(0, 8), at: d.at, site: frames(d.stack, 9) }));
  report.holds = probe("[hold-probe]", t0).map((h) => ({ role: h.role, pid: h.pid === gatewayPid ? "gateway" : h.pid, op: h.op, ms: h.ms, site: frames(h.stack, 6) })).sort((a, b) => b.ms - a.ms).slice(0, 25);
  report.rebuildErrors = lines.filter((l) => l.at >= t0 && /projection is rebuilding/u.test(l.line)).length;
  console.log(JSON.stringify(report, null, 1));
  assert(report.turns.some((t) => t.exit === 0), "no turn completed");
} catch (error) {
  console.error(redact(lines.slice(-120).map((l) => l.line).join("\n")));
  throw error;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  fs.rmSync(shortTmp, { recursive: true, force: true });
  for (const name of fs.readdirSync(dbDir)) if (name.startsWith("openclaw-agent.sqlite")) fs.rmSync(path.join(dbDir, name), { force: true });
}
