// Candidate for scripts/configure-v-deepseek-output-budget.mjs (2026-10-19): V's DeepSeek models are
// configured contextWindow 1,000,000 + maxTokens 384,000, DeepSeek rejects messages + max_tokens
// above 1,048,576, so from ~664k real tokens every turn and its overflow compaction are rejected
// (V 2026-10-19 16:07, group oc_5195cdfe: 664,997 + 384,000). Does contextWindow 980,000 +
// maxTokens 64,000 let the same session answer?
//
// Private Gateways with one Worker each and V's model setup (deepseek/deepseek-flash on the
// vlab-worker runtime, compaction through the Worker's versa-fast-quality-v1 provider). Real
// DeepSeek behind a recording proxy. The big session is a copy of one session from the shared VLab
// mirror (default faa116bd, ~484k real tokens); every big-session turn starts from the same
// pristine private database. To reach the production size the proxy pads the tagged user message
// with filler words (OVF_PAD_WORDS, default 230,000 ≈ 230k tokens) on every DeepSeek request of the
// turn, so DeepSeek sees ~715k tokens of messages exactly as V's 10/19 session did.
//   A = V's current budget (1,000,000 / 384,000), B = the new budget (980,000 / 64,000);
//   same runtime bytes, same session, same padding.
// Scenarios (tag "[ovf <arm> <scenario> <n>]" in the user message):
//   big      big session, one-sentence answer, no tools
//   midtool  big session; the agent runs one exec, then answers
//   small    fresh small session, no padding (control)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const runtimeB = process.env.VLAB_CANDIDATE_RUNTIME;
const configPathB = process.env.OPENCLAW_CONFIG_PATH;
const stateB = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const scratch = process.env.VLAB_CANDIDATE_DATA ?? path.dirname(stateB);
assert(runtimeB && configPathB && stateB && sharedState, "candidate runtime environment is required");
const BIG = (process.env.OVF_BIG ?? "big,midtool").split(",").filter(Boolean);
const SMALL = Number(process.env.OVF_SMALL ?? 2);
const PAD_WORDS = Number(process.env.OVF_PAD_WORDS ?? 230000);
const PAD = " data".repeat(PAD_WORDS);
const REPEAT = Number(process.env.OVF_REPEAT ?? 1);
// faa116bd (group oc_eb6d0748): its active branch is ~484k real tokens (lab/candidate/midturn-precheck.mjs).
// fbf5d45f (oc_5195cdfe, the 10-12 group) is bigger on disk but its mirrored branch is nearly empty.
const SESSION_ID = process.env.OVF_SESSION ?? "faa116bd-0fbf-40ee-b157-52022411c7d1";
const EMBEDDED = process.env.OVF_RUNTIME === "embedded";
const CHAT_BIG = process.env.OVF_CHAT_BIG === "1";
// V uses azure-openai/gpt-5.6-sol; shared VLab only has the gpt-5.5 deployment (midturn-precheck 2026-10-02).
const FAST_COMPACTION_MODEL = process.env.FAST_COMPACTION_MODEL ?? "azure-openai/gpt-5.5";
const TURN_TIMEOUT_MS = Number(process.env.OVF_TURN_TIMEOUT_MS ?? 900_000);
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { setBudget, budgets, NEW, OLD } = await import(path.join(repoRoot, "scripts/configure-v-deepseek-output-budget.mjs"));
const installed = [];

// ---- recording proxy in front of real DeepSeek ----
const upstream = JSON.parse(fs.readFileSync(configPathB, "utf8")).models.providers.deepseek.baseUrl.replace(/\/$/u, "");
const requests = [];
const other = [];
const tagOf = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = typeof m.content === "string" ? m.content : (m.content ?? []).map((b) => b.text ?? "").join("");
    const t = /\[ovf (\w+) (\w+) (\d+)\]/u.exec(text);
    if (!t) return undefined;
    const later = messages.slice(i + 1);
    return { arm: t[1], scenario: t[2], n: Number(t[3]), step: later.some((x) => x?.role === "tool") ? "after-tool" : "start" };
  }
};
const proxy = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const rec = { at: Date.now(), url: req.url, bytes: body.length };
    let j = {};
    try { j = JSON.parse(body.toString("utf8")); } catch {}
    const turn = Array.isArray(j.messages) ? tagOf(j.messages) : undefined;
    Object.assign(rec, { model: j.model, maxTokens: j.max_tokens ?? j.max_completion_tokens ?? null, messages: j.messages?.length, tools: j.tools?.length ?? 0, ...turn });
    (turn ? requests : other).push(rec);
    if (turn && turn.scenario !== "small" && PAD_WORDS > 0) {
      for (let i = j.messages.length - 1; i >= 0; i--) {
        const m = j.messages[i];
        if (m?.role !== "user") continue;
        const filler = `[以下是附带的参考材料，回答时忽略]${PAD}\n[参考材料结束]\n`;
        if (typeof m.content === "string") m.content = filler + m.content;
        else if (Array.isArray(m.content)) m.content = [{ type: "text", text: filler }, ...m.content];
        break;
      }
      rec.padded = true;
    }
    const out = rec.padded ? Buffer.from(JSON.stringify(j)) : body;
    rec.sentBytes = out.length;
    try {
      const headers = { ...req.headers };
      delete headers.host; delete headers["content-length"];
      const up = await fetch(`${upstream}${req.url.replace(/^\/v1/u, "")}`, { method: req.method, headers, body: out });
      rec.status = up.status;
      res.writeHead(up.status, Object.fromEntries([...up.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k))));
      let tail = "";
      for await (const c of up.body) {
        res.write(c);
        tail = (tail + Buffer.from(c).toString("utf8")).slice(-20000);
      }
      const u = tail.match(/"usage":(\{[^{}]*(\{[^{}]*\}[^{}]*)*\})/gu);
      if (u) { try { rec.usage = JSON.parse(u.at(-1).slice(8)); } catch {} }
      if (up.status >= 400) rec.error = tail.slice(0, 300);
      res.end();
    } catch (error) {
      rec.error = String(error.message ?? error).slice(0, 200);
      try { res.writeHead(502); res.end(); } catch {}
    }
    rec.ms = Date.now() - rec.at;
  });
});
const configB = JSON.parse(fs.readFileSync(configPathB, "utf8"));
const portB = Number(configB.gateway?.port);
const token = configB.gateway?.auth?.token;
assert(Number.isInteger(portB) && token, "candidate Gateway port/token missing");
for (;;) {
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  if (Math.abs(proxy.address().port - portB) > 200) break;
  await new Promise((resolve) => proxy.close(resolve));
}
const proxyBase = `http://127.0.0.1:${proxy.address().port}/v1`;

// ---- V's model and compaction setup on both config copies ----
const V_FLASH = { id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: NEW.contextWindow, maxTokens: NEW.maxTokens, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
const asV = (config, runtimeId) => {
  config.channels = {};
  // The mirrored session was last active more than 30 days ago: V's idle reset (43200 min) and
  // 14-day pruning would start a fresh session instead of replaying it (candidate-c44486cf).
  config.session = { ...(config.session ?? {}), reset: { mode: "idle", idleMinutes: 5256000 },
    maintenance: { ...(config.session?.maintenance ?? {}), pruneAfter: "3650d", resetArchiveRetention: "3650d" } };
  config.cron = { ...(config.cron ?? {}), enabled: false };
  const ds = config.models.providers.deepseek;
  ds.baseUrl = proxyBase;
  ds.timeoutSeconds = 90;
  ds.models = [...(ds.models ?? []).filter((m) => m.id !== V_FLASH.id), V_FLASH];
  const entry = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  const model = { primary: MODEL, fallbacks: [] };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = entry;
  const makaron = config.agents.entries?.makaron;
  if (makaron) { makaron.model = model; (makaron.models ??= {})[MODEL] = entry; if (EMBEDDED) makaron.agentRuntime = undefined; }
  // V 2026-10-15: safeguard, versa-fast-quality-v1 provider, midTurnPrecheck on (both files).
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), mode: "safeguard", keepRecentTokens: 8000, recentTurnsPreserve: 3,
    midTurnPrecheck: { enabled: true }, timeoutSeconds: 360, model: MODEL, notifyUser: true, provider: "versa-fast-quality-v1", qualityGuard: { enabled: true, maxRetries: 1 } };
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
  if (EMBEDDED && config.auth?.order?.openai) delete config.auth.order.openai;
  return config;
};
const gatewayRuntimeId = EMBEDDED ? "openclaw" : "vlab-worker";
const workerPluginB = configB.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPluginB, "candidate Worker plugin configuration is missing");
const fastCompaction = { fastCompactionModel: FAST_COMPACTION_MODEL, fastCompactionMaxInputChars: 420000, fastCompactionMaxOutputTokens: 12000, fastCompactionMaxQualityRetries: 1 };
Object.assign(workerPluginB, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPathB, ...fastCompaction });
// V's Gateway entry also grants the plugin its compaction model; without it the Worker's provider
// fails with "Plugin LLM completion cannot override the target model" and falls back to the plain LLM.
configB.plugins.entries["vlab-agent-worker-isolation"].llm = { allowModelOverride: true, allowedModels: [FAST_COMPACTION_MODEL, "openai/gpt-5.6-sol"] };
const workerRel = path.relative(stateB, workerPluginB.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const sharedRuntime = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
const workerConfigB = asV(JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateB).replaceAll(sharedRuntime, runtimeB)), "openclaw");
{
  // V's Worker config loads the worker isolation plugin so the fast-compaction provider is registered
  // inside each Worker (lab/candidate/midturn-precheck.mjs, 2026-10-02).
  const pluginPath = (configB.plugins?.load?.paths ?? []).find((p) => /production-worker$/u.test(p));
  assert(pluginPath, "Gateway config has no production-worker plugin path");
  workerConfigB.plugins ??= {}; workerConfigB.plugins.load ??= {}; workerConfigB.plugins.load.paths ??= [];
  if (!workerConfigB.plugins.load.paths.includes(pluginPath)) workerConfigB.plugins.load.paths.push(pluginPath);
  workerConfigB.plugins.entries ??= {};
  const wp = (workerConfigB.plugins.entries["vlab-agent-worker-isolation"] ??= { enabled: true });
  wp.enabled = true;
  if (Array.isArray(workerConfigB.plugins.allow) && !workerConfigB.plugins.allow.includes("vlab-agent-worker-isolation")) workerConfigB.plugins.allow.push("vlab-agent-worker-isolation");
  wp.llm = { allowModelOverride: true, allowedModels: [FAST_COMPACTION_MODEL, "openai/gpt-5.6-sol"] };
  wp.config = { ...(wp.config ?? {}), ...workerPluginB };
}
fs.mkdirSync(path.dirname(workerPluginB.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPluginB.workerConfigPath, `${JSON.stringify(workerConfigB, null, 2)}\n`, { mode: 0o600 });
fs.writeFileSync(configPathB, `${JSON.stringify(asV(configB, gatewayRuntimeId), null, 2)}\n`, { mode: 0o600 });
if (!fs.existsSync(path.join(stateB, "npm"))) assert.equal(spawnSync("cp", ["-a", path.join(sharedState, "npm"), path.join(stateB, "npm")]).status, 0, "copy managed npm plugins");

// ---- pristine private database holding only the big session ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const pristine = path.join(scratch, "pristine-openclaw-agent.sqlite");
let bigKey;
{
  fs.rmSync(path.join(stateB, dbRel), { force: true });
  for (const s of ["-wal", "-shm"]) fs.rmSync(path.join(stateB, dbRel) + s, { force: true });
  const vec = path.join(runtimeB, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(path.join(sharedState, dbRel), { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(pristine, { allowExtension: true });
  src.loadExtension(vec); dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  const row = src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(SESSION_ID);
  assert(row, `session ${SESSION_ID} is not in the shared VLab mirror`);
  bigKey = row.session_key;
  const convs = new Set(src.prepare("SELECT conversation_id FROM session_conversations WHERE session_id = ?").all(SESSION_ID).map((r) => r.conversation_id));
  const w = src.prepare("SELECT primary_conversation_id FROM session_windows WHERE session_id = ?").get(SESSION_ID);
  if (w?.primary_conversation_id) convs.add(w.primary_conversation_id);
  for (const t of tables) {
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    let where = "", args = [];
    if (cols.includes("session_id")) { where = `"session_id" = ?`; args = [SESSION_ID]; }
    else if (cols.includes("session_key")) { where = `"session_key" = ?`; args = [bigKey]; }
    else if (cols.includes("conversation_id")) { if (!convs.size) continue; where = `"conversation_id" IN (${[...convs].map(() => "?").join(",")})`; args = [...convs]; }
    const list = cols.map((c) => `"${c}"`).join(",");
    const rows = src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).all(...args);
    if (!rows.length) continue;
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN"); for (const r of rows) ins.run(...cols.map((c) => r[c])); dst.exec("COMMIT");
  }
  assert.equal(dst.prepare("PRAGMA foreign_key_check").all().length, 0, "copied rows reference missing parents");
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = DELETE");
  src.close(); dst.close();
}
const restoreDb = (state) => {
  const target = path.join(state, dbRel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(target + s, { force: true });
  fs.copyFileSync(pristine, target);
};
restoreDb(stateB);

// ---- Gateways (same mechanics as lab/candidate/upstream-5xx-fallback.mjs) ----
const portRangeFree = async (base, span) => {
  for (let p = base; p < base + span; p++) {
    const ok = await new Promise((resolve) => { const s = net.createServer(); s.once("error", () => resolve(false)); s.listen(p, "127.0.0.1", () => s.close(() => resolve(true))); });
    if (!ok) return false;
  }
  return true;
};
const cloneArm = async (from, name, runtime) => {
  const state = path.join(scratch, `arm-${name}`);
  fs.rmSync(state, { recursive: true, force: true });
  assert.equal(spawnSync("cp", ["-a", from.state, state]).status, 0, `copy state for ${name}`);
  let port = from.port + 40;
  while (!(await portRangeFree(port, 12))) port += 13;
  const configPath = path.join(state, `openclaw-${name}.json`);
  const rewrite = (text) => text.replaceAll(from.configPath, configPath).replaceAll(from.state, state).replaceAll(from.runtime, runtime).replaceAll(`"port": ${from.port}`, `"port": ${port}`);
  fs.writeFileSync(configPath, rewrite(fs.readFileSync(from.configPath, "utf8")), { mode: 0o600 });
  fs.writeFileSync(path.join(state, workerRel), rewrite(fs.readFileSync(path.join(from.state, workerRel), "utf8")), { mode: 0o600 });
  return { name, runtime, state, configPath, port };
};
const startGateway = async (arm) => {
  const tmp = path.join(scratch, `tmp-${arm.name}`);
  for (const dir of [tmp, path.join(scratch, `cache-${arm.name}`)]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const base = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, String(v).replaceAll(configPathB, arm.configPath).replaceAll(stateB, arm.state).replaceAll(runtimeB, arm.runtime)]));
  const env = { ...base, OPENCLAW_CONFIG_PATH: arm.configPath, OPENCLAW_STATE_DIR: arm.state, OPENCLAW_GATEWAY_PORT: String(arm.port),
    TMPDIR: tmp, XDG_CACHE_HOME: path.join(scratch, `cache-${arm.name}`), npm_config_cache: path.join(scratch, `cache-${arm.name}`, "npm") };
  delete env.VLAB_OPENCLAW_AGENT_RUNTIME;
  arm.env = env;
  const dist = path.join(arm.runtime, "openclaw", "dist");
  const lines = [];
  let starts = 0;
  const launch = () => {
    starts += 1;
    arm.proc = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(arm.port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const s of [arm.proc.stdout, arm.proc.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); if (lines.length > 60000) lines.splice(0, lines.length - 60000); });
    }
  };
  arm.lines = lines;
  arm.events = [];
  const t0 = Date.now();
  launch();
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (arm.proc.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { launch(); continue; }
      throw new Error(`${arm.name} Gateway exited ${arm.proc.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { arm.client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        arm.client = new GatewayClient({
          url: `ws://127.0.0.1:${arm.port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
          onEvent: (e) => { if (e.event === "chat" && e.payload?.runId) arm.events.push({ at: Date.now(), ...e.payload }); },
        });
        arm.client.start();
      });
      arm.readyMs = Date.now() - t0;
      await sleep(15_000);
      log(`${arm.name} ready in ${arm.readyMs} ms on port ${arm.port}`);
      return arm;
    } catch (error) {
      lastError = error;
      arm.client?.stop();
      await sleep(1_000);
    }
  }
  throw lastError ?? new Error(`${arm.name} Gateway did not become ready`);
};
const stopGateway = async (arm) => {
  arm.client?.stop();
  arm.proc?.kill("SIGTERM");
  for (let i = 0; i < 40 && arm.proc?.exitCode === null; i++) await sleep(1_000);
  if (arm.proc?.exitCode === null) arm.proc.kill("SIGKILL");
  await sleep(3_000);
};

// ---- one turn ----
const textOf = (message) => !message ? "" : typeof message === "string" ? message : typeof message.content === "string" ? message.content
  : (Array.isArray(message.content) ? message.content : []).filter((b) => b?.type === "text").map((b) => b.text).join("");
const DECISION_RE = /overflow|compaction|compact|precheck|settled|replay|incomplete turn|surfac|agent end|Try \/reset|这段对话|fast-quality|summar/iu;
const NOISE_RE = /firsttext-|prompt-prep|memory-prep|bundle-prep|project-memory|card-phase|CLIENT-SIDE HEARTBEAT|sqlite\/transaction|\[diagnostic\] (?:lane|session)|Skipping invalid skill/u;
const transcriptSince = (state, sessionKey, sinceMs) => {
  const db = new DatabaseSync(path.join(state, dbRel), { readOnly: true });
  try {
    const windows = db.prepare("SELECT session_id FROM session_windows WHERE session_key = ?").all(sessionKey).map((r) => r.session_id);
    if (!windows.length) return { compactions: [], tools: [], assistants: [] };
    const rows = db.prepare(`SELECT event_json FROM transcript_events WHERE session_id IN (${windows.map(() => "?").join(",")}) AND created_at >= ? ORDER BY created_at, seq`).all(...windows, sinceMs);
    const out = { compactions: [], tools: [], assistants: [] };
    for (const { event_json } of rows) {
      const j = JSON.parse(event_json);
      if (j.type === "compaction") out.compactions.push({ tokensBefore: j.tokensBefore, summaryChars: String(j.summary ?? "").length, summaryHead: String(j.summary ?? "").slice(0, 160) });
      else if (j.message?.role === "toolResult") out.tools.push({ tool: j.message.toolName, afterCompaction: out.compactions.length > 0, text: JSON.stringify(j.message.content ?? "").slice(0, 120) });
      else if (j.message?.role === "assistant") out.assistants.push({ stopReason: j.message.stopReason, afterCompaction: out.compactions.length > 0, text: textOf(j.message).slice(0, 160), error: j.message.errorMessage?.slice(0, 120),
        toolCalls: (j.message.content ?? []).filter((b) => b?.type === "toolCall").map((b) => `${b.name}:${JSON.stringify(b.arguments ?? {}).slice(0, 80)}`) });
    }
    return out;
  } finally { db.close(); }
};
const runTurn = async (arm, scenario, n) => {
  const big = scenario !== "small";
  const sessionKey = big ? bigKey : `agent:makaron:feishu:direct:ou_ovf_${arm.name}_${scenario}_${n}`;
  const probe = `ovf-probe-${arm.name}-${scenario}-${n}`;
  const message = scenario === "midtool"
    ? `[ovf ${arm.name} ${scenario} ${n}] 请用 exec 工具执行一次命令 \`echo ${probe} >> ovf-probe.log; echo ${probe}\`（只执行这一次），然后用一句话告诉我输出是什么。`
    : `[ovf ${arm.name} ${scenario} ${n}] 用一句话回答：现在这个群主要在讨论什么？不要调用工具，也不要提参考材料。`;
  const t0 = Date.now();
  let waited, events = [], cli;
  if (big && !CHAT_BIG) {
    // A webchat chat.send into a mirrored group session replays only its own conversation (2 messages,
    // ~52k tokens with tools and system prompt: candidate-fd5f16c3). The agent CLI replays the session
    // branch like midturn-precheck did (~484k real tokens).
    const child = spawn(process.execPath, [path.join(arm.runtime, "openclaw", "dist", "index.js"), "agent", "--agent", "makaron", "--session-key", sessionKey,
      "--model", MODEL, "--message", message, "--json", "--timeout", String(Math.round(TURN_TIMEOUT_MS / 1000))], { env: arm.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    const exit = await new Promise((resolve) => child.on("close", resolve));
    let meta;
    try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
    const payloads = meta?.result?.payloads ?? meta?.payloads ?? [];
    cli = { exit, text: payloads.map((p) => p.text ?? "").join(" | "), isError: payloads.some((p) => p.isError), stderr: exit === 0 ? undefined : redact(stderr).slice(-600) };
    waited = { status: exit === 0 ? "cli-ok" : `cli-exit-${exit}` };
  } else {
    const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: TURN_TIMEOUT_MS, idempotencyKey: `ovf-${arm.name}-${scenario}-${n}-${t0}` });
    assert(sent?.runId, `${arm.name} ${scenario}: chat.send returned no runId`);
    try { waited = await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: TURN_TIMEOUT_MS + 20_000 }); } catch (error) { waited = { status: `wait-error:${error.message}` }; }
    await sleep(2_000);
    events = arm.events.filter((e) => e.runId === sent.runId);
  }
  const t1 = Date.now();
  const firstText = events.find((e) => textOf(e.message).trim());
  const terminal = events.filter((e) => ["final", "error", "aborted"].includes(e.state));
  const finalText = cli ? cli.text : terminal.map((e) => textOf(e.message) || e.errorMessage || "").join(" | ");
  const lines = arm.lines.filter((l) => l.at >= t0 && l.at <= t1 + 2000);
  const at = (re) => { const l = lines.find((x) => re.test(x.line)); return l ? l.at : null; };
  const compactStart = at(/attempting auto-compaction|compacting and continuing/u);
  const compactEnd = at(/auto-compaction succeeded|auto-compaction removed nothing/u);
  let probeCount = null;
  try { probeCount = (fs.readFileSync(path.join(arm.state, "workspace", "ovf-probe.log"), "utf8").match(new RegExp(probe, "gu")) ?? []).length; } catch {}
  const mine = requests.filter((r) => r.arm === arm.name && r.scenario === scenario && r.n === n);
  return { arm: arm.name, scenario, n, sessionKey: big ? "big" : "small", via: cli ? "agent-cli" : "chat.send", cli, waitStatus: waited?.status, totalS: (t1 - t0) / 1000,
    firstTextS: firstText ? (firstText.at - t0) / 1000 : null, states: terminal.map((e) => e.state), finalText: finalText.slice(0, 500),
    english: /Context overflow|Try \/reset|Auto-compaction could not|Context limit exceeded/u.test(finalText), chineseNotice: finalText.includes("这段对话"),
    compactionS: compactStart && compactEnd ? (compactEnd - compactStart) / 1000 : null, probeCount,
    fastCompactionFellBack: lines.some((l) => /versa-fast-quality-v1" (?:failed|is configured but not registered)/u.test(l.line)),
    requests: mine.map((r) => ({ t: (r.at - t0) / 1000, step: r.step, bytes: r.bytes, sentBytes: r.sentBytes, maxTokens: r.maxTokens, status: r.status, padded: !!r.padded, error: r.error?.slice(0, 240), usageIn: r.usage ? (r.usage.prompt_tokens ?? null) : null, ms: r.ms })),
    transcript: big || scenario === "small" ? transcriptSince(arm.state, sessionKey, t0) : undefined,
    decisions: lines.filter((l) => DECISION_RE.test(l.line) && !NOISE_RE.test(l.line)).map((l) => `${((l.at - t0) / 1000).toFixed(1)}s ${redact(l.line).replace(/\u001b\[[0-9;]*m/gu, "").replace(/\s+/gu, " ").slice(0, 360)}`).slice(0, 80) };
};

// ---- run ----
const runtimeA = runtimeB;
const armB = { name: "B", runtime: runtimeB, state: stateB, configPath: configPathB, port: portB };
const results = [];
let armA;
try {
  armA = await cloneArm(armB, "A", runtimeA);
  for (const file of [armA.configPath, path.join(armA.state, workerRel)]) {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    setBudget(config, OLD);
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }
  for (const arm of [armA, armB]) installed.push({ arm: arm.name, gateway: budgets(JSON.parse(fs.readFileSync(arm.configPath, "utf8"))), worker: budgets(JSON.parse(fs.readFileSync(path.join(arm.state, workerRel), "utf8"))) });
  log("budgets", JSON.stringify(installed));
  for (let n = 1; n <= REPEAT; n++) {
    for (const scenario of BIG) {
      for (const arm of (n % 2 ? [armA, armB] : [armB, armA])) {
        restoreDb(arm.state);
        fs.rmSync(path.join(arm.state, "workspace", "ovf-probe.log"), { force: true });
        await startGateway(arm);
        try {
          const r = await runTurn(arm, scenario, n);
          results.push(r);
          log(JSON.stringify(r, null, 1));
        } finally { await stopGateway(arm); }
      }
    }
  }
  if (SMALL > 0) {
    for (const arm of [armA, armB]) await startGateway(arm);
    for (const arm of [armA, armB]) {
      const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey: `agent:makaron:feishu:direct:ou_ovf_warm_${arm.name}`, message: "预热，回复 ok", deliver: false, timeoutMs: 300_000, idempotencyKey: `ovf-warm-${arm.name}-${Date.now()}` });
      await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: 300_000 }, { timeoutMs: 320_000 });
    }
    for (let n = 1; n <= SMALL; n++) for (const arm of (n % 2 ? [armA, armB] : [armB, armA])) {
      const r = await runTurn(arm, "small", n);
      delete r.decisions;
      results.push(r);
      log(JSON.stringify(r));
    }
  }
} finally {
  for (const arm of [armA, armB]) if (arm?.proc && arm.proc.exitCode === null) await stopGateway(arm);
  proxy.close();
}

const out = {
  runtime: EMBEDDED ? "embedded" : "vlab-worker", session: SESSION_ID, padWords: PAD_WORDS, installed, fastCompactionModel: FAST_COMPACTION_MODEL,
  summary: results.map(({ arm, scenario, n, via, cli, totalS, firstTextS, states, english, chineseNotice, compactionS, fastCompactionFellBack, probeCount, finalText, transcript, requests: reqs }) => ({
    arm, scenario, n, via, cliExit: cli?.exit, totalS, firstTextS, states: states.join(","), english, chineseNotice, compactionS, fastCompactionFellBack, probeCount,
    compactions: transcript?.compactions.length ?? null, toolsRun: transcript?.tools.length ?? null, requests: reqs.length, rejected400: reqs.filter((r) => r.status === 400).length, maxTokensSent: [...new Set(reqs.map((r) => r.maxTokens))].join(","),
    firstRequestBytes: reqs[0]?.bytes ?? null, firstRequestTokens: reqs.find((r) => r.usageIn)?.usageIn ?? null, firstError: reqs.find((r) => r.error)?.error?.slice(0, 240) ?? null, finalText: finalText.slice(0, 200) })),
  otherRequests: other.length,
  results,
};
const outPath = process.env.OVF_OUT ?? path.join(scratch, "deepseek-output-budget-result.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
