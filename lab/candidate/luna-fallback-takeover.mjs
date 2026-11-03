// Candidate for lab/release-files/luna-fallback-takeover (2026-11-03): when DeepSeek fails, does the
// fallback model (gpt-6-luna, 272k window) take over a ~484k-token session and answer?
//
// V 2026-11-03 16:53-17:47: turns that reached luna all finished (mid-turn precheck compacted
// 443k-503k sessions), but most failing turns never reached it. This candidate replays the three
// DeepSeek behaviours seen that day on the big mirrored session (lab/candidate/model-switch-fallback.mjs),
// with V's model, fallback and compaction setup, in arms
//   A = the runtime's live bytes (checked equal to V's before shas)
//   B = the same runtime with lab/patch-luna-fallback-takeover.mjs applied
// DeepSeek scenarios (tag in the user message):
//   s503      every request 503 "Service is too busy" (what already worked on V)
//   s503hang  the first LF_FAIL_FIRST requests 503 (the Worker's whole first attempt), later requests
//             answer 200 and then stay silent (V: turns lost after the Gateway's profile rotation)
//   hang      every request answers 200 and stays silent (V: idle timeout, no fallback)
//   hangpin   like hang, on a session whose model the user picked (no fallback: what does the user see?)
//   ok        DeepSeek healthy (speed check, small and big session)
// Stand-ins on one loopback server: /v1/chat/completions model deepseek-flash plays DeepSeek,
// /v1/responses plays luna (rejects a prompt over its window like OpenAI), /v1/chat/completions model
// sol-stub plays the fast-compaction model (V: azure-openai/gpt-5.6-sol through versa-fast-quality-v1).
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
const ARMS = (process.env.LF_ARMS ?? "A,B").split(",").filter(Boolean);
const SCENARIOS = (process.env.LF_SCENARIOS ?? "s503,s503hang,hang").split(",").filter(Boolean);
const SPEED_N = Number(process.env.LF_SPEED_N ?? 5);
const FAIL_FIRST = Number(process.env.LF_FAIL_FIRST ?? 3);
// V runs DeepSeek with timeoutSeconds 90; a shorter idle timeout keeps the hang scenarios short.
const DS_TIMEOUT_S = Number(process.env.LF_DS_TIMEOUT_S ?? 20);
// The ChatGPT subscription accepts luna prompts up to about 872k tokens (shared VLab, real account, 2026-11-03).
const LUNA_WINDOW = Number(process.env.LF_LUNA_WINDOW ?? 872000);
// OpenClaw's budget for luna: 272000 on V today (v91-gpt6-sol-luna-v1), 850000 with this release.
const LUNA_CTX = { A: Number(process.env.LF_LUNA_CTX_A ?? 272000), B: Number(process.env.LF_LUNA_CTX_B ?? 850000) };
const SESSION_ID = process.env.LF_SESSION ?? "faa116bd-0fbf-40ee-b157-52022411c7d1";
const TURN_TIMEOUT_MS = Number(process.env.LF_TURN_TIMEOUT_MS ?? 900_000);
const DS = "deepseek/deepseek-flash";
const LUNA = "lunastub/gpt-6-luna";
const COMPACT = "compactstub/sol-stub";
const BUSY = "Service is too busy. We advise users to temporarily switch to alternative LLM API service providers.";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { FILES } = await import(path.join(repoRoot, "lab/patch-luna-fallback-takeover.mjs"));
const live = FILES.map((file) => {
  const target = path.join(runtime, file.target, file.name);
  const bytes = fs.readFileSync(target, "utf8");
  return { file, target, bytes, liveIsV: sha(bytes) === file.before };
});
log("runtime vs V", JSON.stringify(live.map((l) => ({ target: `${l.file.target}/${l.file.name}`, liveIsV: l.liveIsV }))));
const installB = () => {
  for (const l of live) {
    fs.writeFileSync(`${l.target}.next`, l.file.patch(l.bytes));
    fs.renameSync(`${l.target}.next`, l.target);
  }
};
const restoreA = () => { for (const l of live) fs.writeFileSync(l.target, l.bytes); };

// ---- loopback stand-ins ----
const requests = [];
const openHangs = new Set();
const textOfBlock = (b) => typeof b === "string" ? b : b?.text ?? b?.content ?? "";
const flatten = (content) => typeof content === "string" ? content : Array.isArray(content) ? content.map(textOfBlock).join("") : "";
const tagIn = (texts) => {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = /\[lf (\w+) (\w+) (\d+)\]/u.exec(texts[i]);
    if (t) return { arm: t[1], scenario: t[2], n: Number(t[3]) };
  }
};
const estimateTokens = (s) => { const cjk = (s.match(/[　-鿿＀-￯]/gu) ?? []).length; return Math.round(cjk * 0.7 + (s.length - cjk) / 3.6); };
const ccChunk = (model, delta, finish, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
const dsCount = new Map();
const deepseek = (req, res, body, turn, rec) => {
  const key = turn ? `${turn.arm}-${turn.scenario}-${turn.n}` : "untagged";
  const nth = (dsCount.get(key) ?? 0) + 1;
  dsCount.set(key, nth);
  rec.nth = nth;
  const scenario = turn?.scenario ?? "ok";
  const fail503 = scenario === "s503" || (scenario === "s503hang" && nth <= FAIL_FIRST);
  const hang = scenario === "hang" || scenario === "hangpin" || (scenario === "s503hang" && nth > FAIL_FIRST);
  if (fail503) { rec.status = 503; res.writeHead(503, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: BUSY } })); }
  if (hang) {
    rec.status = "200-silent";
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.flushHeaders?.();
    openHangs.add(res);
    req.on("close", () => openHangs.delete(res));
    return;
  }
  rec.status = 200;
  const usage = { prompt_tokens: rec.estTokens, completion_tokens: 30, total_tokens: rec.estTokens + 30 };
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(ccChunk(body.model, { role: "assistant", reasoning_content: "先想一想。" }, null)
    + ccChunk(body.model, { content: `DeepSeek 的回答 ${key}。` }, null)
    + ccChunk(body.model, {}, "stop", usage) + "data: [DONE]\n\n");
};
const SUMMARY = ["## Decisions", "- 候选测试用的压缩摘要。", "## Open TODOs", "- 无", "## Constraints/Rules", "- 无",
  "## Pending user asks", "- 用户刚问：现在这个群主要在讨论什么。", "## Exact identifiers", "- LF-COMPACT-STUB"].join("\n");
const compactor = (res, body, rec) => {
  rec.status = 200;
  const usage = { prompt_tokens: rec.estTokens, completion_tokens: 200, total_tokens: rec.estTokens + 200 };
  if (!body.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ id: "cmp", object: "chat.completion", created: 1, model: body.model, choices: [{ index: 0, message: { role: "assistant", content: SUMMARY }, finish_reason: "stop" }], usage }));
  }
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(ccChunk(body.model, { role: "assistant", content: SUMMARY }, null) + ccChunk(body.model, {}, "stop", usage) + "data: [DONE]\n\n");
};
const luna = (res, body, turn, rec) => {
  if (rec.estTokens > LUNA_WINDOW) {
    rec.status = 400;
    res.writeHead(400, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: { type: "invalid_request_error", code: "context_length_exceeded", message: `Your input exceeds the context window of this model. (${rec.estTokens} > ${LUNA_WINDOW})` } }));
  }
  rec.status = 200;
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const text = `Luna 的回答 ${turn ? `${turn.arm}-${turn.scenario}-${turn.n}` : ""}。`;
  const reasoning = { type: "reasoning", id: "rs_lf", summary: [{ type: "summary_text", text: "LUNA-MARK" }], encrypted_content: "LUNA-ENC-opaque" };
  const msg = { type: "message", id: "msg_lf", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
  const usage = { input_tokens: rec.estTokens, output_tokens: 30, total_tokens: rec.estTokens + 30 };
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(ev("response.created", { response: { id: "resp_lf", object: "response", status: "in_progress", model: body.model, output: [] } })
    + ev("response.output_item.added", { output_index: 0, item: { ...reasoning, summary: [] } })
    + ev("response.output_item.done", { output_index: 0, item: reasoning })
    + ev("response.output_item.added", { output_index: 1, item: { ...msg, status: "in_progress", content: [] } })
    + ev("response.content_part.added", { item_id: "msg_lf", output_index: 1, content_index: 0, part: { type: "output_text", text: "", annotations: [] } })
    + ev("response.output_text.delta", { item_id: "msg_lf", output_index: 1, content_index: 0, delta: text })
    + ev("response.output_text.done", { item_id: "msg_lf", output_index: 1, content_index: 0, text })
    + ev("response.content_part.done", { item_id: "msg_lf", output_index: 1, content_index: 0, part: msg.content[0] })
    + ev("response.output_item.done", { output_index: 1, item: msg })
    + ev("response.completed", { response: { id: "resp_lf", object: "response", status: "completed", model: body.model, output: [reasoning, msg], usage } }));
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
    const role = isResponses ? "luna" : body.model === "sol-stub" ? "compaction" : "deepseek";
    const rec = { at, role, model: body.model, bytes: raw.length, items: items.length, estTokens: estimateTokens(raw), ...turn };
    requests.push(rec);
    if (role === "luna") return luna(res, body, turn, rec);
    if (role === "compaction") return compactor(res, body, rec);
    if (/\/chat\/completions\b/u.test(req.url ?? "")) return deepseek(req, res, body, turn, rec);
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

// ---- V's model, fallback and compaction setup (both config files) ----
const V_FLASH = { id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 980000, maxTokens: 64000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
const LUNA_MODEL = { id: "gpt-6-luna", name: "GPT-6 Luna (stand-in)", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1050000, contextTokens: LUNA_CTX.A, maxTokens: 64000 };
const SOL_STUB = { id: "sol-stub", name: "fast compaction stand-in", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 32000 };
const asV = (config) => {
  config.channels = {};
  config.session = { ...(config.session ?? {}), reset: { mode: "idle", idleMinutes: 5256000 },
    maintenance: { ...(config.session?.maintenance ?? {}), pruneAfter: "3650d", resetArchiveRetention: "3650d" } };
  config.cron = { ...(config.cron ?? {}), enabled: false };
  const providers = config.models.providers;
  Object.assign(providers.deepseek, { baseUrl: standin, apiKey: "sk-standin-loopback", agentRuntime: { id: "vlab-worker" }, timeoutSeconds: DS_TIMEOUT_S });
  providers.deepseek.models = [...(providers.deepseek.models ?? []).filter((m) => m.id !== V_FLASH.id), V_FLASH];
  providers.lunastub = { baseUrl: standin, apiKey: "luna-standin-loopback", api: "openai-responses", models: [LUNA_MODEL] };
  providers.compactstub = { baseUrl: standin, apiKey: "compact-standin-loopback", api: "openai-completions", models: [SOL_STUB] };
  const rt = { agentRuntime: { id: "vlab-worker" } };
  const model = { primary: DS, fallbacks: [LUNA] };
  config.agents.defaults.model = model;
  config.agents.defaults.models = { ...(config.agents.defaults.models ?? {}), [DS]: { alias: "deepseek", ...rt, params: { thinking: "high" } }, [LUNA]: { alias: "luna", ...rt } };
  const makaron = config.agents.entries?.makaron;
  if (makaron) { makaron.model = model; makaron.models = { ...(makaron.models ?? {}), [DS]: config.agents.defaults.models[DS] }; }
  const allow = config.agents.defaults.modelPolicy?.allow;
  for (const ref of [DS, LUNA, COMPACT]) if (Array.isArray(allow) && !allow.includes(ref)) allow.push(ref);
  // V 2026-11-03, both files: provider versa-fast-quality-v1 first, compaction.model as its LLM fallback.
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), mode: "safeguard", keepRecentTokens: 8000, recentTurnsPreserve: 3,
    midTurnPrecheck: { enabled: true }, timeoutSeconds: 360, model: DS, notifyUser: true, provider: "versa-fast-quality-v1", qualityGuard: { enabled: true, maxRetries: 1 } };
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  return config;
};
const workerPlugin = config0.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
const fastCompaction = { fastCompactionModel: COMPACT, fastCompactionMaxInputChars: 420000, fastCompactionMaxOutputTokens: 12000, fastCompactionMaxQualityRetries: 1 };
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPath, ...fastCompaction });
config0.plugins.entries["vlab-agent-worker-isolation"].llm = { allowModelOverride: true, allowedModels: [COMPACT] };
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
  wp.llm = { allowModelOverride: true, allowedModels: [COMPACT] };
  wp.config = { ...(wp.config ?? {}), ...workerPlugin };
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(asV(workerConfig), null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(configPath, `${JSON.stringify(asV(config0), null, 2)}\n`, { mode: 0o600 });
}
const setLunaContextTokens = (n) => {
  for (const file of [configPath, workerPlugin.workerConfigPath]) {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const m of config.models.providers.lunastub.models) m.contextTokens = n;
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }
};
if (!fs.existsSync(path.join(stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");

// ---- pristine private database holding only the big session (same copy as model-switch-fallback.mjs) ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const pristine = path.join(scratch, "pristine-openclaw-agent.sqlite");
let bigKey;
{
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(path.join(stateDir, dbRel) + s, { force: true });
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
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
  // A user model override disables configured fallbacks; start the session on the agent default like a V session.
  const entry = dst.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(bigKey);
  if (entry) {
    const e = JSON.parse(entry.entry_json);
    for (const k of ["modelOverride", "providerOverride", "modelOverrideSource", "agentRuntimeOverride", "liveModelSwitchPending", "thinkingLevel", "modelFallback"]) delete e[k];
    dst.prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?").run(JSON.stringify(e), bigKey);
  }
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = DELETE");
  src.close(); dst.close();
}
const restoreDb = ({ userPickedModel = false } = {}) => {
  const target = path.join(stateDir, dbRel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(target + s, { force: true });
  fs.copyFileSync(pristine, target);
  if (!userPickedModel) return;
  // /deepseek picked by the user: configured fallbacks are disabled for this session (9.1 resolveModelFallbackAvailability).
  const db = new DatabaseSync(target);
  try {
    const e = JSON.parse(db.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(bigKey).entry_json);
    Object.assign(e, { providerOverride: "deepseek", modelOverride: "deepseek-flash", modelOverrideSource: "user" });
    db.prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?").run(JSON.stringify(e), bigKey);
  } finally { db.close(); }
};
log("big session", bigKey, `${fs.statSync(pristine).size} bytes`);

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
  assert(await portRangeFree(port, 12), `port ${port} is busy`);
  const tmp = path.join(scratch, "tmp-gw");
  for (const dir of [tmp, path.join(scratch, "cache-gw")]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // OPENCLAW_GATEWAY_PORT: the agent CLI otherwise inherits the shared VLab Gateway's port and runs there.
  const env = { ...process.env, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_GATEWAY_PORT: String(port),
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
  for (const res of openHangs) res.destroy();
  gw.client?.stop();
  gw.proc?.kill("SIGTERM");
  for (let i = 0; i < 40 && gw.proc?.exitCode === null; i++) await sleep(1_000);
  if (gw.proc?.exitCode === null) gw.proc.kill("SIGKILL");
  await sleep(3_000);
};

// ---- turns ----
const textOf = (message) => !message ? "" : typeof message === "string" ? message : typeof message.content === "string" ? message.content
  : (Array.isArray(message.content) ? message.content : []).filter((b) => b?.type === "text").map((b) => b.text).join("");
const DECISION_RE = /model fallback decision|failover decision|overflow|compaction|precheck|incomplete turn|surfac|luna-fallback-takeover|upstream-5xx-fallback|Worker Agent request failed|worker provider failure/iu;
const NOISE_RE = /firsttext-|prompt-prep|memory-prep|bundle-prep|project-memory|card-phase|CLIENT-SIDE HEARTBEAT|sqlite\/transaction|\[diagnostic\] (?:lane|session)|Skipping invalid skill|first-thinking|worker-compaction-runtime-loaded/u;
const decisions = (t0, t1) => gw.lines.filter((l) => l.at >= t0 && l.at <= t1 + 2000 && DECISION_RE.test(l.line) && !NOISE_RE.test(l.line))
  .map((l) => `${((l.at - t0) / 1000).toFixed(1)}s ${redact(l.line).replace(/\u001b\[[0-9;]*m/gu, "").replace(/\s+/gu, " ").slice(0, 360)}`).slice(0, 80);
const transcriptSince = (sessionKey, sinceMs) => {
  const db = new DatabaseSync(path.join(stateDir, dbRel), { readOnly: true });
  try {
    const windows = db.prepare("SELECT session_id FROM session_windows WHERE session_key = ?").all(sessionKey).map((r) => r.session_id);
    if (!windows.length) return { compactions: [], assistants: [] };
    const rows = db.prepare(`SELECT event_json FROM transcript_events WHERE session_id IN (${windows.map(() => "?").join(",")}) AND created_at >= ? ORDER BY created_at, seq`).all(...windows, sinceMs);
    const out = { compactions: [], assistants: [], users: 0 };
    for (const { event_json } of rows) {
      const j = JSON.parse(event_json);
      if (j.type === "compaction") out.compactions.push({ tokensBefore: j.tokensBefore, summaryChars: String(j.summary ?? "").length, stub: String(j.summary ?? "").includes("LF-COMPACT-STUB") });
      else if (j.message?.role === "assistant") out.assistants.push({ model: `${j.message.provider}/${j.message.model}`, stopReason: j.message.stopReason, text: textOf(j.message).slice(0, 160), error: j.message.errorMessage?.slice(0, 200) });
      else if (j.message?.role === "user") out.users += 1;
    }
    return out;
  } finally { db.close(); }
};
// The agent CLI replays the whole branch of the mirrored session (chat.send into a mirrored group only replays its own conversation).
const bigTurn = async (arm, scenario, n) => {
  const message = `[lf ${arm} ${scenario} ${n}] 用一句话回答：现在这个群主要在讨论什么？不要调用工具。`;
  const t0 = Date.now();
  const args = [path.join(runtime, "openclaw", "dist", "index.js"), "agent", "--agent", "makaron", "--session-key", bigKey, "--message", message, "--json", "--timeout", String(Math.round(TURN_TIMEOUT_MS / 1000))];
  const child = spawn(process.execPath, args, { env: gw.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const exit = await new Promise((resolve) => child.on("close", resolve));
  const t1 = Date.now();
  let meta;
  try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
  const payloads = meta?.result?.payloads ?? meta?.payloads ?? [];
  const text = payloads.map((p) => p.text ?? "").join(" | ");
  const mine = requests.filter((r) => r.arm === arm && r.scenario === scenario && r.n === n);
  // Every scenario reaches the DeepSeek stand-in first; none means the turn ran on some other Gateway.
  assert(mine.some((r) => r.role === "deepseek"), `turn ${arm}/${scenario} never reached the stand-ins (Gateway target: ${/Gateway target: (\S+)/u.exec(stderr)?.[1] ?? "?"})`);
  const lunaAnswered = /Luna 的回答/u.test(text);
  return { arm, scenario, exit, totalS: (t1 - t0) / 1000, lunaAnswered, text: text.slice(0, 300), isError: payloads.some((p) => p.isError),
    stderr: exit === 0 ? undefined : redact(stderr).slice(-600),
    requests: mine.map((r) => ({ t: +((r.at - t0) / 1000).toFixed(1), role: r.role, status: r.status, nth: r.nth, items: r.items, estTokens: r.estTokens })),
    compactionRequests: requests.filter((r) => r.role === "compaction" && r.at >= t0 && r.at <= t1).length,
    fastCompactionFellBack: gw.lines.some((l) => l.at >= t0 && /versa-fast-quality-v1" (?:failed|is configured but not registered|returned empty)/u.test(l.line)),
    transcript: transcriptSince(bigKey, t0),
    decisions: decisions(t0, t1) };
};
// Healthy DeepSeek: a small session over chat.send, chat.send -> first DeepSeek request / first delta / final.
const speedTurn = async (arm, n) => {
  const sessionKey = `agent:makaron:feishu:direct:ou_lf_speed_${arm.toLowerCase()}`;
  const message = `[lf ${arm} ok ${n}] 回一句话就好。`;
  const t0 = Date.now();
  const sent = await gw.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: TURN_TIMEOUT_MS, idempotencyKey: `lf-${arm}-${n}-${t0}` });
  if (sent?.runId) await gw.client.request("agent.wait", { runId: sent.runId, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: TURN_TIMEOUT_MS + 20_000 }).catch(() => null);
  await sleep(1_000);
  const events = sent?.runId ? gw.events.filter((e) => e.runId === sent.runId) : [];
  const firstDelta = events.find((e) => e.state === "delta" && textOf(e.message));
  const final = events.find((e) => ["final", "error", "aborted"].includes(e.state));
  const firstRequest = requests.find((r) => r.arm === arm && r.scenario === "ok" && r.n === n);
  return { n, firstRequestMs: firstRequest ? firstRequest.at - t0 : null, firstTextMs: firstDelta ? firstDelta.at - t0 : null, finalMs: final ? final.at - t0 : null, final: final?.state, text: textOf(final?.message).slice(0, 80) };
};
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ---- run: arm A on the live bytes, then the same runtime patched for B ----
const results = { big: [], speed: {} };
try {
  for (const arm of ARMS) {
    if (arm === "B") installB(); else restoreA();
    setLunaContextTokens(LUNA_CTX[arm]);
    for (const scenario of SCENARIOS) {
      // A database swapped under a running Gateway fails DB91 integrity; every scenario starts cold.
      restoreDb({ userPickedModel: scenario === "hangpin" });
      await startGateway();
      const r = await bigTurn(arm, scenario, 1);
      results.big.push(r);
      log(JSON.stringify(r, null, 1));
      await stopGateway();
    }
    if (SPEED_N > 0) {
      restoreDb();
      await startGateway();
      const turns = [];
      for (let n = 1; n <= SPEED_N; n++) { turns.push(await speedTurn(arm, n)); log(JSON.stringify(turns.at(-1))); }
      const big = await bigTurn(arm, "ok", 1);
      results.speed[arm] = { turns, median: { firstRequestMs: median(turns.slice(1).map((t) => t.firstRequestMs)), firstTextMs: median(turns.slice(1).map((t) => t.firstTextMs)), finalMs: median(turns.slice(1).map((t) => t.finalMs)) },
        bigOk: { totalS: big.totalS, text: big.text, requests: big.requests.length, firstRequestS: big.requests[0]?.t } };
      log(JSON.stringify(results.speed[arm]));
      await stopGateway();
    }
  }
} finally {
  if (gw.proc && gw.proc.exitCode === null) await stopGateway();
  restoreA();
  server.close();
}

const out = { lunaContextTokens: LUNA_CTX, runtimeVsV: live.map((l) => ({ target: `${l.file.target}/${l.file.name}`, liveIsV: l.liveIsV })), bigSession: bigKey, lunaWindow: LUNA_WINDOW, dsTimeoutS: DS_TIMEOUT_S, failFirst: FAIL_FIRST, results };
const outPath = process.env.LF_OUT ?? path.join(scratch, "luna-fallback-takeover-result.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
