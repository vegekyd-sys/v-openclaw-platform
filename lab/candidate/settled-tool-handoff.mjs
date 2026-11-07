// Candidate for lab/patch-settled-tool-handoff.mjs (2026-11-07): when DeepSeek keeps failing AFTER a turn's
// tools ran, does the fallback model (gpt-6-luna) finish the turn from the saved transcript, without the
// user's request being sent again and without the tool running twice?
//
// V 2026-11-07 15:00-15:54: five Feishu turns ran exec/read, then DeepSeek answered 500 six times in a row;
// the user got "⚠️ 模型服务暂时不可用 ... 这一轮没能完成" after 89-128 s. Turns without a tool reached luna.
//
// Arms: A = runtime bytes equal to V (checked against the patch's before shas), B = A + the patch.
// DeepSeek stand-in (one loopback server, model by request):
//   first request of a turn         -> one exec tool call that appends a line to a counter file and echoes a marker
//   after the tool result, by scenario:
//     tool500      every request 500 (V 15:00)                      expect A: error, B: luna answers
//     tool500once  the first request 500, then a normal answer      expect A = B: DeepSeek answers, luna untouched
//     tool500pin   every request 500, user picked /model deepseek   expect A = B: error, no fallback (user's choice)
//   ok             no tool, plain answer (healthy path timing)
// luna stand-in (/v1/responses) answers "Luna 的回答 <tag>" and records its input.
// Entry: cli = `openclaw agent --session-key` (agentCommand), chat = chat.send (Gateway reply pipeline).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const scratch = process.env.VLAB_CANDIDATE_DATA ?? path.dirname(stateDir);
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const ARMS = (process.env.STH_ARMS ?? "A,B").split(",").filter(Boolean);
// entry:scenario pairs
const CASES = (process.env.STH_CASES ?? "chat:tool500,cli:tool500,chat:tool500once,chat:tool500pin").split(",").filter(Boolean).map((c) => { const [entry, scenario] = c.split(":"); return { entry, scenario }; });
const SPEED_N = Number(process.env.STH_SPEED_N ?? 5);
const DS_TIMEOUT_S = Number(process.env.STH_DS_TIMEOUT_S ?? 60);
const TURN_TIMEOUT_MS = Number(process.env.STH_TURN_TIMEOUT_MS ?? 600_000);
const DS = "deepseek/deepseek-flash";
// A model the user picks with /model: 9.1 disables configured fallbacks for a user-selected model.
const DS_PRO = "deepseek/deepseek-v4-pro";
const LUNA = "lunastub/gpt-6-luna";
const CONTINUATION = "Continue from the current transcript after the latest tool result.";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { FILES, MARKER } = await import(path.join(repoRoot, "lab/patch-settled-tool-handoff.mjs"));
// Arm A must run V's bytes. Prefer the runtime's own file when it is V's; otherwise the captured V bytes.
const CAPTURED = { "openclaw/dist": "release/captured/v2026.9.1-db91.6-luna-fallback-takeover-20261104/dist", "production-worker": "release/captured/v2026.9.1-db91.6-luna-fallback-takeover-20261104.worker/dist" };
const live = FILES.map((file) => {
  const target = path.join(runtime, file.target, file.name);
  const runtimeBytes = fs.readFileSync(target, "utf8");
  let bytes = runtimeBytes;
  if (sha(runtimeBytes) !== file.before) {
    const captured = path.join(repoRoot, CAPTURED[file.target], file.name);
    assert(fs.existsSync(captured), `runtime ${file.name} is not V's bytes and nothing is captured`);
    bytes = fs.readFileSync(captured, "utf8");
  }
  assert.equal(sha(bytes), file.before, `no V bytes for ${file.name}`);
  return { file, target, bytes, liveIsV: sha(runtimeBytes) === file.before };
});
log("runtime vs V", JSON.stringify(live.map((l) => ({ target: `${l.file.target}/${l.file.name}`, liveIsV: l.liveIsV }))));
const install = (arm) => { for (const l of live) { fs.writeFileSync(`${l.target}.next`, arm === "B" ? l.file.patch(l.bytes) : l.bytes); fs.renameSync(`${l.target}.next`, l.target); } };

// ---- loopback stand-ins ----
const requests = [];
const counterFile = path.join(scratch, "sth-tool-runs.log");
fs.writeFileSync(counterFile, "");
const textOfBlock = (b) => typeof b === "string" ? b : b?.text ?? b?.content ?? "";
const flatten = (content) => typeof content === "string" ? content : Array.isArray(content) ? content.map(textOfBlock).join("") : "";
const TAG_RE = /\[sth (\w+) (\w+) (\w+) (\d+)\]/u;
const tagIn = (texts) => { for (let i = texts.length - 1; i >= 0; i--) { const t = TAG_RE.exec(texts[i]); if (t) return { arm: t[1], entry: t[2], scenario: t[3], n: Number(t[4]) }; } };
const ccChunk = (model, delta, finish, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
const postToolCount = new Map();
const deepseek = (res, body, turn, rec) => {
  const key = turn ? `${turn.arm}-${turn.entry}-${turn.scenario}-${turn.n}` : "untagged";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const hasToolResult = messages.some((m) => m.role === "tool");
  rec.phase = hasToolResult ? "after-tool" : "before-tool";
  const scenario = turn?.scenario ?? "ok";
  const usage = { prompt_tokens: 1000, completion_tokens: 30, total_tokens: 1030 };
  if (!hasToolResult && scenario !== "ok") {
    rec.status = 200;
    const command = `echo ${key} >> ${counterFile}; echo STH-OUT-${key}`;
    res.writeHead(200, { "content-type": "text/event-stream" });
    return res.end(ccChunk(body.model, { role: "assistant", reasoning_content: "先跑一下命令。" }, null)
      + ccChunk(body.model, { tool_calls: [{ index: 0, id: `call_${key.replace(/\W/gu, "_")}`, type: "function", function: { name: "exec", arguments: JSON.stringify({ command }) } }] }, null)
      + ccChunk(body.model, {}, "tool_calls", usage) + "data: [DONE]\n\n");
  }
  const nth = (postToolCount.get(key) ?? 0) + 1;
  if (hasToolResult) postToolCount.set(key, nth);
  rec.nth = nth;
  const fail = hasToolResult && (scenario === "tool500" || scenario === "tool500pin" || (scenario === "tool500once" && nth === 1));
  if (fail) {
    rec.status = 500;
    res.writeHead(500, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: { message: "Internal Server Error", type: "server_error" } }));
  }
  rec.status = 200;
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(ccChunk(body.model, { role: "assistant", reasoning_content: "想好了。" }, null)
    + ccChunk(body.model, { content: `DeepSeek 的回答 ${key}。` }, null)
    + ccChunk(body.model, {}, "stop", usage) + "data: [DONE]\n\n");
};
const luna = (res, body, turn, rec) => {
  rec.status = 200;
  const input = Array.isArray(body.input) ? body.input : [];
  const raw = JSON.stringify(input);
  const userTexts = input.filter((m) => (m.role ?? m.type) === "user").map((m) => flatten(m.content));
  rec.luna = {
    userTagged: userTexts.filter((t) => TAG_RE.test(t)).length,
    continuationPrompt: raw.includes(CONTINUATION),
    toolOutputSeen: raw.includes("STH-OUT-"),
    toolCallSeen: /function_call|"exec"/u.test(raw),
    lastUser: (userTexts.at(-1) ?? "").slice(0, 200),
  };
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const text = `Luna 的回答 ${turn ? `${turn.arm}-${turn.entry}-${turn.scenario}-${turn.n}` : ""}。`;
  const msg = { type: "message", id: "msg_sth", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
  const usage = { input_tokens: 1000, output_tokens: 30, total_tokens: 1030 };
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(ev("response.created", { response: { id: "resp_sth", object: "response", status: "in_progress", model: body.model, output: [] } })
    + ev("response.output_item.added", { output_index: 0, item: { ...msg, status: "in_progress", content: [] } })
    + ev("response.content_part.added", { item_id: "msg_sth", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } })
    + ev("response.output_text.delta", { item_id: "msg_sth", output_index: 0, content_index: 0, delta: text })
    + ev("response.output_text.done", { item_id: "msg_sth", output_index: 0, content_index: 0, text })
    + ev("response.content_part.done", { item_id: "msg_sth", output_index: 0, content_index: 0, part: msg.content[0] })
    + ev("response.output_item.done", { output_index: 0, item: msg })
    + ev("response.completed", { response: { id: "resp_sth", object: "response", status: "completed", model: body.model, output: [msg], usage } }));
};
const server = http.createServer((req, res) => {
  const at = Date.now();
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    let body = {};
    try { body = JSON.parse(raw); } catch {}
    const isResponses = /\/responses\b/u.test(req.url ?? "");
    const items = isResponses ? (Array.isArray(body.input) ? body.input : []) : (Array.isArray(body.messages) ? body.messages : []);
    const turn = tagIn(items.filter((m) => (m.role ?? m.type) === "user").map((m) => flatten(m.content)));
    const role = isResponses ? "luna" : "deepseek";
    const rec = { at, role, model: body.model, items: items.length, ...turn };
    requests.push(rec);
    if (role === "luna") return luna(res, body, turn, rec);
    if (/\/chat\/completions\b/u.test(req.url ?? "")) return deepseek(res, body, turn, rec);
    res.writeHead(404); res.end();
  });
});
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config0.gateway?.port);
const token = config0.gateway?.auth?.token;
assert(Number.isInteger(port) && token, "candidate Gateway port/token missing");
for (;;) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  if (Math.abs(server.address().port - port) > 200) break;
  await new Promise((resolve) => server.close(resolve));
}
const standin = `http://127.0.0.1:${server.address().port}/v1`;
const deepseekStandin = `http://${process.env.STH_DS_HOST ?? "lvh.me"}:${server.address().port}/v1`;

// ---- V's model and fallback setup (both config files) ----
const V_FLASH = { id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 980000, maxTokens: 64000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
const LUNA_MODEL = { id: "gpt-6-luna", name: "GPT-6 Luna (stand-in)", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1050000, contextTokens: 850000, maxTokens: 64000 };
const asV = (config) => {
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  const providers = config.models.providers;
  providers.deepseek.request = { ...(providers.deepseek.request ?? {}), allowPrivateNetwork: true };
  Object.assign(providers.deepseek, { baseUrl: deepseekStandin, apiKey: "sk-standin-loopback", agentRuntime: { id: "vlab-worker" }, timeoutSeconds: DS_TIMEOUT_S });
  providers.deepseek.models = [...(providers.deepseek.models ?? []).filter((m) => m.id !== V_FLASH.id && m.id !== "deepseek-v4-pro"), V_FLASH, { ...V_FLASH, id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" }];
  providers.lunastub = { baseUrl: standin, apiKey: "luna-standin-loopback", api: "openai-responses", models: [LUNA_MODEL] };
  const rt = { agentRuntime: { id: "vlab-worker" } };
  const model = { primary: DS, fallbacks: [LUNA] };
  config.agents.defaults.model = model;
  config.agents.defaults.models = { ...(config.agents.defaults.models ?? {}), [DS]: { alias: "deepseek", ...rt, params: { thinking: "high" } }, [DS_PRO]: { alias: "v4pro", ...rt }, [LUNA]: { alias: "luna", ...rt } };
  const makaron = config.agents.entries?.makaron;
  if (makaron) { makaron.model = model; makaron.models = { ...(makaron.models ?? {}), [DS]: config.agents.defaults.models[DS] }; }
  const allow = config.agents.defaults.modelPolicy?.allow;
  for (const ref of [DS, DS_PRO, LUNA]) if (Array.isArray(allow) && !allow.includes(ref)) allow.push(ref);
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), mode: "safeguard", midTurnPrecheck: { enabled: true } };
  delete config.agents.defaults.compaction.provider;
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  return config;
};
const workerPlugin = config0.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPath });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const sharedRuntime = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
{
  const workerConfig = JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8").replaceAll(sharedState, stateDir).replaceAll(sharedRuntime, runtime));
  const pluginPath = (config0.plugins?.load?.paths ?? []).find((p) => /production-worker$/u.test(p));
  assert(pluginPath, "Gateway config has no production-worker plugin path");
  workerConfig.plugins ??= {}; workerConfig.plugins.load ??= {}; workerConfig.plugins.load.paths ??= [];
  if (!workerConfig.plugins.load.paths.includes(pluginPath)) workerConfig.plugins.load.paths.push(pluginPath);
  workerConfig.plugins.entries ??= {};
  const wp = (workerConfig.plugins.entries["vlab-agent-worker-isolation"] ??= { enabled: true });
  wp.enabled = true;
  if (Array.isArray(workerConfig.plugins.allow) && !workerConfig.plugins.allow.includes("vlab-agent-worker-isolation")) workerConfig.plugins.allow.push("vlab-agent-worker-isolation");
  wp.config = { ...(wp.config ?? {}), ...workerPlugin };
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(asV(workerConfig), null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(configPath, `${JSON.stringify(asV(config0), null, 2)}\n`, { mode: 0o600 });
}
if (!fs.existsSync(path.join(stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");

// ---- pristine private agent database: shared VLab schema, no sessions, a stand-in deepseek profile ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const pristine = path.join(scratch, "pristine-openclaw-agent.sqlite");
{
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(path.join(sharedState, dbRel), { readOnly: true, allowExtension: true });
  fs.rmSync(pristine, { force: true });
  const dst = new DatabaseSync(pristine, { allowExtension: true });
  src.loadExtension(vec); dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  // Agent-level rows (DB91 ownership, schema identity, ...) as in lab/candidate/luna-fallback-takeover.mjs; no session rows.
  for (const t of tables) {
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts") || t.name === "auth_profile_store") continue;
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (cols.some((c) => ["session_id", "session_key", "conversation_id"].includes(c))) continue;
    const list = cols.map((c) => `"${c}"`).join(",");
    const rows = src.prepare(`SELECT ${list} FROM "${t.name}"`).all();
    if (!rows.length || rows.length > 50000) continue;
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN"); for (const r of rows) ins.run(...cols.map((c) => r[c])); dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  const store = { version: 1, profiles: { "deepseek:default": { type: "api_key", provider: "deepseek", key: "sk-standin-profile-loopback" } } };
  dst.prepare("INSERT INTO auth_profile_store (store_key, store_json, updated_at) VALUES ('primary', ?, ?)").run(JSON.stringify(store), Date.now());
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = DELETE");
  src.close(); dst.close();
}
for (const agent of fs.readdirSync(path.join(stateDir, "agents"))) {
  const file = path.join(stateDir, "agents", agent, "agent", "openclaw-agent.sqlite");
  if (!fs.existsSync(file) || file === path.join(stateDir, dbRel)) continue;
  try {
    const db = new DatabaseSync(file);
    for (const row of db.prepare("SELECT store_key, store_json FROM auth_profile_store").all()) {
      const store = JSON.parse(row.store_json);
      const ids = Object.keys(store.profiles ?? {}).filter((id) => id.startsWith("openai"));
      if (!ids.length) continue;
      for (const id of ids) delete store.profiles[id];
      db.prepare("UPDATE auth_profile_store SET store_json = ? WHERE store_key = ?").run(JSON.stringify(store), row.store_key);
    }
    db.close();
  } catch (error) { log("auth store scrub skipped", agent, error.message); }
}
const restoreDb = () => {
  const target = path.join(stateDir, dbRel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(target + s, { force: true });
  fs.copyFileSync(pristine, target);
};

// ---- Gateway ----
const portRangeFree = async (base, span) => {
  for (let p = base; p < base + span; p++) {
    const ok = await new Promise((resolve) => { const s = net.createServer(); s.once("error", () => resolve(false)); s.listen(p, "127.0.0.1", () => s.close(() => resolve(true))); });
    if (!ok) return false;
  }
  return true;
};
const gw = { lines: [], events: [] };
const startGateway = async () => {
  for (let i = 0; i < 60 && !(await portRangeFree(port, 12)); i++) await sleep(2_000);
  assert(await portRangeFree(port, 12), `port ${port} is busy`);
  const tmp = path.join(scratch, "tmp-gw");
  for (const dir of [tmp, path.join(scratch, "cache-gw")]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const env = { ...process.env, DEEPSEEK_API_KEY: "sk-standin-env-loopback", OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_GATEWAY_PORT: String(port),
    TMPDIR: tmp, XDG_CACHE_HOME: path.join(scratch, "cache-gw"), npm_config_cache: path.join(scratch, "cache-gw", "npm") };
  delete env.VLAB_OPENCLAW_AGENT_RUNTIME;
  gw.env = env;
  const dist = path.join(runtime, "openclaw", "dist");
  let starts = 0;
  const launch = () => {
    starts += 1;
    gw.proc = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const s of [gw.proc.stdout, gw.proc.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) gw.lines.push({ at: Date.now(), line }); if (gw.lines.length > 80000) gw.lines.splice(0, gw.lines.length - 80000); });
    }
  };
  const t0 = Date.now();
  launch();
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gw.proc.exitCode !== null) {
      if (starts === 1 && gw.lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { launch(); continue; }
      throw new Error(`Gateway exited ${gw.proc.exitCode}\n${redact(gw.lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { gw.client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        gw.client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
          onEvent: (e) => { if (e.event === "chat" && e.payload?.runId) gw.events.push({ at: Date.now(), ...e.payload }); },
        });
        gw.client.start();
      });
      gw.readyMs = Date.now() - t0;
      await sleep(15_000);
      log(`Gateway ready in ${gw.readyMs} ms on port ${port}`);
      return;
    } catch (error) {
      lastError = error;
      gw.client?.stop();
      await sleep(1_000);
    }
  }
  throw lastError ?? new Error("Gateway did not become ready");
};
const stopGateway = async () => {
  gw.client?.stop();
  gw.proc?.kill("SIGTERM");
  for (let i = 0; i < 40 && gw.proc?.exitCode === null; i++) await sleep(1_000);
  if (gw.proc?.exitCode === null) gw.proc.kill("SIGKILL");
  await sleep(3_000);
};

// ---- turns ----
const textOf = (message) => !message ? "" : typeof message === "string" ? message : typeof message.content === "string" ? message.content
  : (Array.isArray(message.content) ? message.content : []).filter((b) => b?.type === "text").map((b) => b.text).join("");
const DECISION_RE = new RegExp(`model fallback decision|failover decision|incomplete turn|surfac|upstream-5xx-fallback|Worker Agent request failed|worker provider failure|settled tool|${MARKER}`, "iu");
const NOISE_RE = /firsttext-|prompt-prep|memory-prep|bundle-prep|project-memory|card-phase|CLIENT-SIDE HEARTBEAT|sqlite\/transaction|\[diagnostic\] (?:lane|session)|Skipping invalid skill|first-thinking/u;
const decisions = (t0, t1) => gw.lines.filter((l) => l.at >= t0 && l.at <= t1 + 2000 && DECISION_RE.test(l.line) && !NOISE_RE.test(l.line))
  .map((l) => `${((l.at - t0) / 1000).toFixed(1)}s ${redact(l.line).replace(/\u001b\[[0-9;]*m/gu, "").replace(/\s+/gu, " ").slice(0, 360)}`).slice(0, 80);
const transcriptOf = (sessionKey, sinceMs) => {
  const db = new DatabaseSync(path.join(stateDir, dbRel), { readOnly: true });
  try {
    const windows = db.prepare("SELECT session_id FROM session_windows WHERE session_key = ?").all(sessionKey).map((r) => r.session_id);
    const out = { users: [], assistants: [], toolResults: 0 };
    if (!windows.length) return out;
    const rows = db.prepare(`SELECT event_json FROM transcript_events WHERE session_id IN (${windows.map(() => "?").join(",")}) AND created_at >= ? ORDER BY created_at, seq`).all(...windows, sinceMs);
    for (const { event_json } of rows) {
      const j = JSON.parse(event_json);
      const m = j.message;
      if (m?.role === "user") out.users.push(textOf(m).slice(0, 120));
      else if (m?.role === "toolResult") out.toolResults += 1;
      else if (m?.role === "assistant") out.assistants.push({ model: `${m.provider}/${m.model}`, stopReason: m.stopReason, text: textOf(m).slice(0, 120), tools: (Array.isArray(m.content) ? m.content : []).filter((b) => b?.type === "toolCall").map((b) => b.name), error: m.errorMessage?.slice(0, 120) });
    }
    return out;
  } finally { db.close(); }
};
const toolRuns = (key) => fs.readFileSync(counterFile, "utf8").split("\n").filter((l) => l.trim() === key).length;
const chatSend = async (sessionKey, message, tag) => {
  const t0 = Date.now();
  const sent = await gw.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: TURN_TIMEOUT_MS, idempotencyKey: `sth-${tag}-${t0}` });
  if (sent?.runId) await gw.client.request("agent.wait", { runId: sent.runId, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: TURN_TIMEOUT_MS + 20_000 }).catch(() => null);
  await sleep(1_500);
  const events = sent?.runId ? gw.events.filter((e) => e.runId === sent.runId) : [];
  const finals = events.filter((e) => ["final", "error", "aborted"].includes(e.state));
  const final = finals.at(-1);
  return { t0, runId: sent?.runId, final: final?.state, text: finals.map((e) => [textOf(e.message), e.errorMessage].filter(Boolean).join(" | ")).filter(Boolean).join(" | ") };
};
const turn = async (arm, entry, scenario, n) => {
  const key = `${arm}-${entry}-${scenario}-${n}`;
  const sessionKey = entry === "chat" ? `agent:makaron:feishu:direct:ou_sth_${arm}_${scenario}_${n}`.toLowerCase() : `agent:makaron:explicit:sth-${arm}-${scenario}-${n}`.toLowerCase();
  if (scenario === "tool500pin") await chatSend(sessionKey, `/model ${DS_PRO}`, `${key}-pin`);
  const message = `[sth ${arm} ${entry} ${scenario} ${n}] 用 exec 运行一次命令看看结果，然后一句话告诉我。`;
  const t0 = Date.now();
  let text = "", isError = false, exit = 0, stderr = "";
  if (entry === "chat") {
    const r = await chatSend(sessionKey, message, key);
    text = r.text; isError = r.final !== "final";
  } else {
    const args = [path.join(runtime, "openclaw", "dist", "index.js"), "agent", "--agent", "makaron", "--session-key", sessionKey, "--message", message, "--json", "--timeout", String(Math.round(TURN_TIMEOUT_MS / 1000))];
    const child = spawn(process.execPath, args, { env: gw.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    exit = await new Promise((resolve) => child.on("close", resolve));
    let meta;
    try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
    const payloads = meta?.result?.payloads ?? meta?.payloads ?? [];
    text = payloads.map((p) => p.text ?? "").join(" | ");
    isError = exit !== 0 || payloads.some((p) => p.isError);
  }
  const t1 = Date.now();
  const mine = requests.filter((r) => r.at >= t0 && r.at <= t1 && r.arm === arm && r.scenario === scenario && r.n === n && r.entry === entry);
  if (!mine.some((r) => r.role === "deepseek")) log("turn reached no stand-in", JSON.stringify({ text, isError, stderr: redact(stderr).slice(-1500), any: requests.filter((r) => r.at >= t0).map((r) => ({ role: r.role, arm: r.arm, scenario: r.scenario, entry: r.entry, items: r.items })),
    lines: gw.lines.filter((l) => l.at >= t0 - 1000 && !NOISE_RE.test(l.line)).map((l) => redact(l.line).replace(/\u001b\[[0-9;]*m/gu, "").slice(0, 300)).slice(-60) }, null, 1));
  assert(mine.some((r) => r.role === "deepseek"), `turn ${key} never reached the DeepSeek stand-in`);
  const lunaReqs = mine.filter((r) => r.role === "luna");
  const transcript = transcriptOf(sessionKey, t0);
  const lastAssistant = transcript.assistants.at(-1);
  return { arm, entry, scenario, totalS: (t1 - t0) / 1000, text: text.slice(0, 300), isError,
    lunaAnswered: /Luna 的回答/u.test(text) || (lastAssistant?.model === LUNA && lastAssistant?.stopReason === "stop" && /Luna 的回答/u.test(lastAssistant.text)),
    deepseekAnswered: /DeepSeek 的回答/u.test(text) || /DeepSeek 的回答/u.test(lastAssistant?.text ?? ""), failureCard: /模型服务暂时不可用|没能完成|request failed|Agent couldn't/u.test(text),
    toolRuns: toolRuns(key),
    deepseekAfterTool: mine.filter((r) => r.role === "deepseek" && r.phase === "after-tool").map((r) => `${r.status}`),
    lunaRequests: lunaReqs.length, luna: lunaReqs.map((r) => r.luna),
    requests: mine.map((r) => ({ t: +((r.at - t0) / 1000).toFixed(1), role: r.role, status: r.status, phase: r.phase })),
    transcript,
    stderr: exit === 0 ? undefined : redact(stderr).slice(-600),
    decisions: decisions(t0, t1) };
};
const speedTurn = async (arm, n) => {
  const sessionKey = `agent:makaron:feishu:direct:ou_sth_speed_${arm.toLowerCase()}`;
  const t0 = Date.now();
  const r = await chatSend(sessionKey, `[sth ${arm} chat ok ${n}] 回一句话就好。`, `${arm}-ok-${n}`);
  const firstRequest = requests.find((q) => q.arm === arm && q.scenario === "ok" && q.n === n);
  return { n, firstRequestMs: firstRequest ? firstRequest.at - t0 : null, finalMs: Date.now() - t0 - 1500, final: r.final, text: r.text.slice(0, 60) };
};
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ---- expectations ----
const check = (r) => {
  const fails = [];
  const expect = (ok, what) => { if (!ok) fails.push(what); };
  expect(r.toolRuns === 1, `tool ran ${r.toolRuns} times (expected exactly 1)`);
  // agentCommand over the Worker writes the user line twice on V's bytes too (arm A); compare arms there.
  const persisted = r.transcript.users.filter((u) => u.includes("[sth ")).length;
  expect(r.entry === "cli" ? persisted <= 2 : persisted === 1, `user request persisted ${persisted} times`);
  expect(!r.transcript.users.some((u) => u.includes("Continue from the current transcript")), "the continuation prompt was written to the transcript");
  if (r.scenario === "tool500" && r.arm === "A") { expect(r.lunaRequests === 0 && !r.lunaAnswered, "A reached luna"); expect(r.failureCard || r.isError, "A did not fail (fault path not triggered?)"); }
  if (r.scenario === "tool500" && r.arm === "B") {
    expect(r.lunaAnswered, "B: luna did not answer");
    expect(!r.failureCard, "B: the user still got a failure card");
    // luna must see the user's request only as persisted (agentCommand over the Worker already persists it twice, arm A too), plus the continuation prompt.
    expect(r.lunaRequests >= 1 && r.luna.every((l) => l.continuationPrompt && l.toolOutputSeen && l.userTagged === persisted), `B: luna input not a continuation ${JSON.stringify(r.luna)}`);
    expect(r.deepseekAfterTool.length === 2, `B: ${r.deepseekAfterTool.length} DeepSeek requests after the tool (expected 2: failure + one continuation)`);
    expect(r.decisions.some((d) => d.includes(MARKER)), "B: no hand-off decision logged");
  }
  if (r.scenario === "tool500once") { expect(r.deepseekAnswered && r.lunaRequests === 0, `${r.arm}: tool500once should stay on DeepSeek`); }
  if (r.scenario === "tool500pin") { expect(r.lunaRequests === 0 && !r.lunaAnswered, `${r.arm}: pinned model fell back`); expect(r.failureCard || r.isError, `${r.arm}: pinned model did not fail`); }
  return fails;
};

const results = { turns: [], speed: {} };
try {
  for (const arm of ARMS) {
    install(arm);
    restoreDb();
    await startGateway();
    for (const c of CASES) {
      const r = await turn(arm, c.entry, c.scenario, 1);
      r.fails = check(r);
      results.turns.push(r);
      log(JSON.stringify(r, null, 1));
    }
    if (SPEED_N > 0) {
      const turns = [];
      for (let n = 1; n <= SPEED_N; n++) turns.push(await speedTurn(arm, n));
      results.speed[arm] = { turns, median: { firstRequestMs: median(turns.slice(1).map((t) => t.firstRequestMs)), finalMs: median(turns.slice(1).map((t) => t.finalMs)) } };
      log(JSON.stringify(results.speed[arm]));
    }
    await stopGateway();
  }
} finally {
  if (gw.proc && gw.proc.exitCode === null) await stopGateway();
  install("A");
  server.close();
}
const summary = results.turns.map((r) => ({ arm: r.arm, entry: r.entry, scenario: r.scenario, totalS: r.totalS, lunaAnswered: r.lunaAnswered, deepseekAnswered: r.deepseekAnswered, failure: r.failureCard || r.isError, toolRuns: r.toolRuns, dsAfterTool: r.deepseekAfterTool.join("/"), lunaRequests: r.lunaRequests, fails: r.fails }));
const out = { marker: MARKER, runtimeVsV: live.map((l) => ({ target: `${l.file.target}/${l.file.name}`, liveIsV: l.liveIsV })), summary, speed: results.speed, results };
fs.writeFileSync(process.env.STH_OUT ?? path.join(scratch, "settled-tool-handoff-result.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
const failed = summary.filter((s) => s.fails.length);
if (failed.length) { console.error("FAILED", JSON.stringify(failed, null, 1)); process.exitCode = 1; }
