// Candidate for DeepSeek <-> Grok switching on V (2026-10-28).
//
// Two questions, one run:
//   think  Does a /Grok -> /deepseek round trip keep the session's thinking level?
//          Arms A (runtime's live bytes) and B (lab/patch-model-switch-thinking.mjs applied).
//          Small sessions over chat.send, directives exactly as Feishu sends them.
//   big    What happens to a ~484k-token DeepSeek session when Grok takes over, by hand
//          (agent CLI --model xai/grok-4.7) or as the fallback after DeepSeek 503s, with a
//          500k window (Grok 4.7) and a 272k window (gpt-6-luna's size)? Arm A only.
//
// Both providers are loopback stand-ins: /v1/chat/completions plays DeepSeek (streams
// reasoning_content "DSR-MARK" + text, or 503 "too busy" when the turn asks), /v1/responses plays
// Grok (a reasoning item with encrypted_content + summary "GRK-MARK", then text; HTTP 400 in xAI's
// wording when its estimate of the prompt exceeds the window). Every request is recorded with
// its reasoning effort, size, and whether the other model's reasoning leaked into it as text.
// Compaction uses the Worker's versa-fast-quality-v1 provider on a real Azure model, as on V.
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
const PHASES = (process.env.MS_PHASES ?? "think,big").split(",").filter(Boolean);
const BIG = (process.env.MS_BIG ?? "manual,fallback").split(",").filter(Boolean);
const WINDOWS = (process.env.MS_WINDOWS ?? "500000,272000").split(",").map(Number);
const SESSION_ID = process.env.MS_SESSION ?? "faa116bd-0fbf-40ee-b157-52022411c7d1";
// V compacts with azure-openai/gpt-5.6-sol through versa-fast-quality-v1. In this candidate VLab's
// Azure route resolves to an OpenAI OAuth it does not have (candidate-11153c91), so a provider that
// reaches the real DeepSeek API stands in for "a compaction model that still works".
const FAST_COMPACTION_MODEL = process.env.FAST_COMPACTION_MODEL ?? "dsreal/deepseek-flash";
const TURN_TIMEOUT_MS = Number(process.env.MS_TURN_TIMEOUT_MS ?? 900_000);
const DS = "deepseek/deepseek-flash";
const GROK = "xai/grok-4.7";
const BUSY = "Service is too busy. We advise users to temporarily switch to alternative LLM API service providers.";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);

// ---- runtimes: A keeps the live bytes, B gets the thinking patch ----
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { FILES } = await import(path.join(repoRoot, "lab/patch-model-switch-thinking.mjs"));
// MS_ARMS=B skips the unpatched copy (VLab's data disk holds about one private runtime at a time);
// the big phase then runs on B, whose patch only touches thinking-level persistence.
const ARMS = (process.env.MS_ARMS ?? "A,B").split(",").filter(Boolean);
const runtimeA = path.join(scratch, "runtime-a");
const installed = [];
if (ARMS.includes("A") && !fs.existsSync(runtimeA)) { const cp = spawnSync("cp", ["-a", runtimeB, runtimeA], { encoding: "utf8" }); assert.equal(cp.status, 0, `copy runtime for A: ${cp.stderr?.slice(-800)}`); }
for (const file of FILES) {
  const target = path.join(runtimeB, file.target, file.name);
  const live = fs.readFileSync(target, "utf8");
  const next = file.patch(live);
  fs.writeFileSync(`${target}.next`, next);
  fs.renameSync(`${target}.next`, target);
  installed.push({ target: `${file.target}/${file.name}`, live: sha(live), liveIsV: sha(live) === file.before, b: sha(next) });
}
log("installed", JSON.stringify(installed));

// ---- loopback stand-ins ----
const requests = [];
const other = [];
let grokWindow = WINDOWS[0];
const textOfBlock = (b) => typeof b === "string" ? b : b?.text ?? b?.content ?? "";
const flatten = (content) => typeof content === "string" ? content : Array.isArray(content) ? content.map(textOfBlock).join("") : "";
const tagIn = (texts) => {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = /\[ms (\w+) ([\w-]+) (\d+)\]/u.exec(texts[i]);
    if (t) return { arm: t[1], scenario: t[2], n: Number(t[3]) };
  }
};
// Rough prompt tokens the way a provider would count them: CJK ~0.7/char, the rest ~1/3.6 chars.
const estimateTokens = (s) => { const cjk = (s.match(/[　-鿿＀-￯]/gu) ?? []).length; return Math.round(cjk * 0.7 + (s.length - cjk) / 3.6); };
const ccChunk = (model, delta, finish, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
const deepseek = (res, body, turn, rec) => {
  const model = body.model;
  if (turn?.scenario?.startsWith("fb")) { res.writeHead(503, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: BUSY } })); }
  const usage = { prompt_tokens: rec.estTokens, completion_tokens: 30, total_tokens: rec.estTokens + 30 };
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(ccChunk(model, { role: "assistant", reasoning_content: `DSR-MARK ${turn ? `${turn.scenario}-${turn.n}` : "x"}：先想一想用户要什么。` }, null)
    + ccChunk(model, { content: `DeepSeek 的回答 ${turn ? `${turn.scenario}-${turn.n}` : ""}。` }, null)
    + ccChunk(model, {}, "stop", usage) + "data: [DONE]\n\n");
};
const grok = (res, body, turn, rec) => {
  if (rec.estTokens > grokWindow) {
    res.writeHead(400, { "content-type": "application/json" });
    return res.end(JSON.stringify({ code: "Client specified an invalid argument", error: `This model's maximum prompt length is ${grokWindow} but the request contains ${rec.estTokens} tokens.` }));
  }
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const text = `Grok 的回答 ${turn ? `${turn.scenario}-${turn.n}` : ""}。`;
  const reasoning = { type: "reasoning", id: "rs_ms", summary: [{ type: "summary_text", text: "GRK-MARK 推理摘要" }], encrypted_content: "GRK-ENC-opaque" };
  const msg = { type: "message", id: "msg_ms", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
  const usage = { input_tokens: rec.estTokens, output_tokens: 30, total_tokens: rec.estTokens + 30 };
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(ev("response.created", { response: { id: "resp_ms", object: "response", status: "in_progress", model: body.model, output: [] } })
    + ev("response.output_item.added", { output_index: 0, item: { ...reasoning, summary: [] } })
    + ev("response.reasoning_summary_text.delta", { item_id: "rs_ms", output_index: 0, summary_index: 0, delta: "GRK-MARK 推理摘要" })
    + ev("response.output_item.done", { output_index: 0, item: reasoning })
    + ev("response.output_item.added", { output_index: 1, item: { ...msg, status: "in_progress", content: [] } })
    + ev("response.content_part.added", { item_id: "msg_ms", output_index: 1, content_index: 0, part: { type: "output_text", text: "", annotations: [] } })
    + ev("response.output_text.delta", { item_id: "msg_ms", output_index: 1, content_index: 0, delta: text })
    + ev("response.output_text.done", { item_id: "msg_ms", output_index: 1, content_index: 0, text })
    + ev("response.content_part.done", { item_id: "msg_ms", output_index: 1, content_index: 0, part: msg.content[0] })
    + ev("response.output_item.done", { output_index: 1, item: msg })
    + ev("response.completed", { response: { id: "resp_ms", object: "response", status: "completed", model: body.model, output: [reasoning, msg], usage } }));
};
const server = http.createServer((req, res) => {
  const at = Date.now();
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    let body = {};
    try { body = JSON.parse(raw); } catch {}
    const isGrok = /\/responses\b/u.test(req.url ?? "");
    const items = isGrok ? (Array.isArray(body.input) ? body.input : []) : (Array.isArray(body.messages) ? body.messages : []);
    const userTexts = items.filter((m) => (m.role ?? m.type) === "user").map((m) => flatten(m.content));
    const turn = tagIn(userTexts);
    const assistantText = items.filter((m) => m.role === "assistant").map((m) => flatten(m.content)).join("\n");
    const rec = { at, provider: isGrok ? "xai" : "deepseek", model: body.model, bytes: raw.length, items: items.length, estTokens: estimateTokens(raw), ...turn,
      effort: isGrok ? body.reasoning?.effort ?? null : body.reasoning_effort ?? body.thinking?.type ?? null,
      // the other model's reasoning, replayed as visible assistant text
      dsReasoningAsText: (assistantText.match(/DSR-MARK/gu) ?? []).length,
      grokReasoningAsText: (assistantText.match(/GRK-MARK/gu) ?? []).length,
      grokReasoningItems: isGrok ? items.filter((m) => m.type === "reasoning").length : undefined,
      dsReasoningContent: isGrok ? undefined : items.filter((m) => m.role === "assistant" && typeof m.reasoning_content === "string" && m.reasoning_content.length > 0).length,
      grokMarkInReasoningContent: isGrok ? undefined : items.filter((m) => m.role === "assistant" && /GRK-MARK/u.test(m.reasoning_content ?? "")).length,
      reasoningCharsAsText: isGrok ? undefined : undefined };
    if (!turn) other.push({ at, url: req.url, model: body.model, provider: rec.provider, bytes: rec.bytes });
    else requests.push(rec);
    if (isGrok) { rec.status = rec.estTokens > grokWindow ? 400 : 200; return grok(res, body, turn, rec); }
    if (/\/chat\/completions\b/u.test(req.url ?? "")) { rec.status = turn?.scenario?.startsWith("fb") ? 503 : 200; return deepseek(res, body, turn, rec); }
    res.writeHead(404); res.end();
  });
});
const configB = JSON.parse(fs.readFileSync(configPathB, "utf8"));
const portB = Number(configB.gateway?.port);
const token = configB.gateway?.auth?.token;
assert(Number.isInteger(portB) && token, "candidate Gateway port/token missing");
for (;;) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  if (Math.abs(server.address().port - portB) > 200) break;
  await new Promise((resolve) => server.close(resolve));
}
const standin = `http://127.0.0.1:${server.address().port}/v1`;

// ---- V's model, fallback and compaction setup ----
const V_FLASH = { id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 980000, maxTokens: 64000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
const grokModel = (window) => ({ id: "grok-4.7", name: "Grok 4.7", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: window, maxTokens: 64000 });
const realDeepseek = (() => {
  // configB is still the shared VLab configuration here; asV rewrites the files, not this object.
  const ds = structuredClone(configB.models?.providers?.deepseek ?? {});
  const apiKey = ds.apiKey ?? process.env.DEEPSEEK_API_KEY;
  assert(apiKey, "no DeepSeek credential for the compaction stand-in");
  return { baseUrl: ds.baseUrl ?? "https://api.deepseek.com/v1", apiKey, api: "openai-completions", models: [{ ...V_FLASH }] };
})();
const asV = (config, window) => {
  config.channels = {};
  // The mirrored session was last active long ago: keep V's idle reset and pruning from replacing it.
  config.session = { ...(config.session ?? {}), reset: { mode: "idle", idleMinutes: 5256000 },
    maintenance: { ...(config.session?.maintenance ?? {}), pruneAfter: "3650d", resetArchiveRetention: "3650d" } };
  config.cron = { ...(config.cron ?? {}), enabled: false };
  const providers = config.models.providers;
  const ds = providers.deepseek;
  Object.assign(ds, { baseUrl: standin, apiKey: "sk-standin-loopback", agentRuntime: { id: "vlab-worker" }, timeoutSeconds: 90 });
  ds.models = [...(ds.models ?? []).filter((m) => m.id !== V_FLASH.id), V_FLASH];
  providers.dsreal = realDeepseek;
  providers.xai = { ...(providers.xai ?? {}), baseUrl: standin, apiKey: "xai-standin-loopback", api: "openai-responses" };
  providers.xai.models = [...(providers.xai.models ?? []).filter((m) => m.id !== "grok-4.7"), grokModel(window)];
  const rt = { agentRuntime: { id: "vlab-worker" } };
  const dsEntry = { alias: "deepseek", ...rt, params: { thinking: "high" } };
  const grokEntry = { alias: "Grok", ...rt };
  const model = { primary: DS, fallbacks: [GROK] };
  config.agents.defaults.model = model;
  config.agents.defaults.models = { ...(config.agents.defaults.models ?? {}), [DS]: dsEntry, [GROK]: grokEntry };
  const makaron = config.agents.entries?.makaron;
  if (makaron) { makaron.model = model; makaron.models = { ...(makaron.models ?? {}), [DS]: dsEntry }; }
  const allow = config.agents.defaults.modelPolicy?.allow;
  for (const ref of [DS, GROK, FAST_COMPACTION_MODEL]) if (Array.isArray(allow) && !allow.includes(ref)) allow.push(ref);
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), mode: "safeguard", keepRecentTokens: 8000, recentTurnsPreserve: 3,
    midTurnPrecheck: { enabled: true }, timeoutSeconds: 360, model: DS, notifyUser: true, provider: "versa-fast-quality-v1", qualityGuard: { enabled: true, maxRetries: 1 } };
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  return config;
};
const workerPluginB = configB.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPluginB, "candidate Worker plugin configuration is missing");
const fastCompaction = { fastCompactionModel: FAST_COMPACTION_MODEL, fastCompactionMaxInputChars: 420000, fastCompactionMaxOutputTokens: 12000, fastCompactionMaxQualityRetries: 1 };
Object.assign(workerPluginB, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPathB, ...fastCompaction });
configB.plugins.entries["vlab-agent-worker-isolation"].llm = { allowModelOverride: true, allowedModels: [FAST_COMPACTION_MODEL, "openai/gpt-5.6-sol"] };
const workerRel = path.relative(stateB, workerPluginB.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const sharedRuntime = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
const writeConfigs = (state, configPath, runtime, window) => {
  const gw = asV(JSON.parse(fs.readFileSync(configPath, "utf8")), window);
  fs.writeFileSync(configPath, `${JSON.stringify(gw, null, 2)}\n`, { mode: 0o600 });
  const wPath = path.join(state, workerRel);
  const w = asV(JSON.parse(fs.readFileSync(wPath, "utf8")), window);
  fs.writeFileSync(wPath, `${JSON.stringify(w, null, 2)}\n`, { mode: 0o600 });
};
{
  const workerConfigB = JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8").replaceAll(sharedState, stateB).replaceAll(sharedRuntime, runtimeB));
  // V's Worker config loads the worker isolation plugin so versa-fast-quality-v1 is registered in each Worker.
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
  fs.mkdirSync(path.dirname(workerPluginB.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPluginB.workerConfigPath, `${JSON.stringify(workerConfigB, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(configPathB, `${JSON.stringify(configB, null, 2)}\n`, { mode: 0o600 });
  writeConfigs(stateB, configPathB, runtimeB, WINDOWS[0]);
}
if (!fs.existsSync(path.join(stateB, "npm"))) assert.equal(spawnSync("cp", ["-a", path.join(sharedState, "npm"), path.join(stateB, "npm")]).status, 0, "copy managed npm plugins");

// ---- pristine private database holding only the big session (lab/candidate/context-overflow-recovery.mjs) ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const pristine = path.join(scratch, "pristine-openclaw-agent.sqlite");
let bigKey;
let bigEntryBefore = null;
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
  // The mirrored session carries VLab's model choice as a user override, which disables configured
  // fallbacks (candidate-11153c91: next=none). Start it on the agent default like a V session.
  const entry = dst.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(bigKey);
  if (entry) {
    const e = JSON.parse(entry.entry_json);
    bigEntryBefore = Object.fromEntries(["modelOverride", "providerOverride", "modelOverrideSource", "agentRuntimeOverride", "thinkingLevel", "model", "modelProvider"].map((k) => [k, e[k] ?? null]));
    for (const k of ["modelOverride", "providerOverride", "modelOverrideSource", "agentRuntimeOverride", "liveModelSwitchPending", "thinkingLevel", "modelFallback"]) delete e[k];
    dst.prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?").run(JSON.stringify(e), bigKey);
  }
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
// What the big session's active history holds, before any turn.
const bigProfile = (() => {
  const db = new DatabaseSync(pristine, { readOnly: true });
  try {
    const out = { assistant: 0, thinkingChars: 0, textChars: 0, toolCalls: 0, toolResultChars: 0, userChars: 0, compactions: 0 };
    for (const { event_json } of db.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq").iterate(SESSION_ID)) {
      const j = JSON.parse(event_json);
      if (j.type === "compaction") { out.compactions++; continue; }
      const m = j.message;
      if (!m) continue;
      if (m.role === "user") out.userChars += flatten(m.content).length;
      if (m.role === "toolResult") out.toolResultChars += JSON.stringify(m.content ?? "").length;
      if (m.role !== "assistant") continue;
      out.assistant++;
      for (const b of Array.isArray(m.content) ? m.content : []) {
        if (b?.type === "thinking") out.thinkingChars += String(b.thinking ?? "").length;
        else if (b?.type === "text") out.textChars += String(b.text ?? "").length;
        else if (b?.type === "toolCall") out.toolCalls++;
      }
    }
    return out;
  } finally { db.close(); }
})();
log("big session", bigKey, JSON.stringify(bigProfile));

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

// ---- helpers ----
const textOf = (message) => !message ? "" : typeof message === "string" ? message : typeof message.content === "string" ? message.content
  : (Array.isArray(message.content) ? message.content : []).filter((b) => b?.type === "text").map((b) => b.text).join("");
const DECISION_RE = /model fallback decision|overflow|compaction|compact|precheck|incomplete turn|surfac|replay|Thinking level|thinking|failover/iu;
const NOISE_RE = /firsttext-|prompt-prep|memory-prep|bundle-prep|project-memory|card-phase|CLIENT-SIDE HEARTBEAT|sqlite\/transaction|\[diagnostic\] (?:lane|session)|Skipping invalid skill|first-thinking/u;
const entryOf = (arm, sessionKey) => {
  const db = new DatabaseSync(path.join(arm.state, dbRel), { readOnly: true });
  try {
    const row = db.prepare("SELECT entry_json FROM session_nodes WHERE lower(session_key) = lower(?)").get(sessionKey);
    if (!row) return null;
    const e = JSON.parse(row.entry_json);
    return { thinkingLevel: e.thinkingLevel ?? null, model: e.modelOverride ? `${e.providerOverride}/${e.modelOverride}` : null };
  } finally { db.close(); }
};
const chatTurn = async (arm, sessionKey, message, tag) => {
  const t0 = Date.now();
  const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: TURN_TIMEOUT_MS, idempotencyKey: `ms-${tag}-${t0}` });
  let waited;
  if (sent?.runId) {
    try { waited = await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: TURN_TIMEOUT_MS + 20_000 }); } catch (error) { waited = { status: `wait-error:${error.message}` }; }
  }
  await sleep(2_000);
  const events = sent?.runId ? arm.events.filter((e) => e.runId === sent.runId) : [];
  const finalText = events.filter((e) => ["final", "error", "aborted"].includes(e.state)).map((e) => textOf(e.message) || e.errorMessage || "").join(" | ");
  return { t0, t1: Date.now(), finalText, waitStatus: waited?.status ?? (sent?.runId ? null : "no-run") };
};
const decisions = (arm, t0, t1) => arm.lines.filter((l) => l.at >= t0 && l.at <= t1 + 2000 && DECISION_RE.test(l.line) && !NOISE_RE.test(l.line))
  .map((l) => `${((l.at - t0) / 1000).toFixed(1)}s ${redact(l.line).replace(/\u001b\[[0-9;]*m/gu, "").replace(/\s+/gu, " ").slice(0, 360)}`).slice(0, 60);

// ---- phase think: thinking level across /Grok -> /deepseek ----
const thinkPhase = async (arm) => {
  const out = [];
  for (const variant of ["explicit-high", "unset"]) {
    const sessionKey = `agent:makaron:feishu:direct:ou_ms_${arm.name}_${variant}`;
    const steps = [...(variant === "explicit-high" ? ["/think high"] : []), "msg", "/Grok", "msg", "/deepseek", "msg"];
    let n = 0;
    for (const step of steps) {
      const isMsg = step === "msg";
      if (isMsg) n += 1;
      const message = isMsg ? `[ms ${arm.name} ${variant} ${n}] 回一句话就好。` : step;
      const turn = await chatTurn(arm, sessionKey, message, `${arm.name}-${variant}-${step}-${n}`);
      const mine = requests.filter((r) => r.arm === arm.name && r.scenario === variant && r.n === n && r.at >= turn.t0);
      out.push({ arm: arm.name, variant, step: isMsg ? `msg${n}` : step, entryAfter: entryOf(arm, sessionKey), reply: turn.finalText.slice(0, 200),
        requests: isMsg ? mine.map(({ provider, model, effort, items, bytes, dsReasoningAsText, grokReasoningAsText, grokReasoningItems, dsReasoningContent, grokMarkInReasoningContent, status }) =>
          ({ provider, model, effort, items, bytes, dsReasoningAsText, grokReasoningAsText, grokReasoningItems, dsReasoningContent, grokMarkInReasoningContent, status })) : undefined,
        decisions: decisions(arm, turn.t0, turn.t1).filter((d) => /Thinking|thinking|fallback/u.test(d)).slice(0, 10) });
      log(JSON.stringify(out.at(-1)));
    }
  }
  return out;
};

// ---- phase big: Grok on a ~484k-token DeepSeek session ----
const transcriptSince = (state, sessionKey, sinceMs) => {
  const db = new DatabaseSync(path.join(state, dbRel), { readOnly: true });
  try {
    const windows = db.prepare("SELECT session_id FROM session_windows WHERE session_key = ?").all(sessionKey).map((r) => r.session_id);
    if (!windows.length) return { compactions: [], assistants: [] };
    const rows = db.prepare(`SELECT event_json FROM transcript_events WHERE session_id IN (${windows.map(() => "?").join(",")}) AND created_at >= ? ORDER BY created_at, seq`).all(...windows, sinceMs);
    const out = { compactions: [], assistants: [] };
    for (const { event_json } of rows) {
      const j = JSON.parse(event_json);
      if (j.type === "compaction") out.compactions.push({ tokensBefore: j.tokensBefore, summaryChars: String(j.summary ?? "").length, summaryHead: String(j.summary ?? "").slice(0, 120) });
      else if (j.message?.role === "assistant") out.assistants.push({ model: `${j.message.provider}/${j.message.model}`, stopReason: j.message.stopReason, text: textOf(j.message).slice(0, 160), error: j.message.errorMessage?.slice(0, 200) });
    }
    return out;
  } finally { db.close(); }
};
const bigTurn = async (arm, scenario, window, model) => {
  const n = window;
  const message = `[ms ${arm.name} ${scenario} ${n}] 用一句话回答：现在这个群主要在讨论什么？不要调用工具。`;
  const t0 = Date.now();
  // The agent CLI replays the whole session branch (chat.send into a mirrored group only replays its own conversation).
  const args = [path.join(arm.runtime, "openclaw", "dist", "index.js"), "agent", "--agent", "makaron", "--session-key", bigKey, "--message", message, "--json", "--timeout", String(Math.round(TURN_TIMEOUT_MS / 1000))];
  if (model) args.push("--model", model);
  const child = spawn(process.execPath, args, { env: arm.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const exit = await new Promise((resolve) => child.on("close", resolve));
  const t1 = Date.now();
  let meta;
  try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
  const payloads = meta?.result?.payloads ?? meta?.payloads ?? [];
  const mine = requests.filter((r) => r.arm === arm.name && r.scenario === scenario && r.n === n);
  const lines = arm.lines.filter((l) => l.at >= t0 && l.at <= t1 + 2000);
  return { arm: arm.name, scenario, grokWindow: window, model: model ?? "(agent default)", exit, totalS: (t1 - t0) / 1000,
    text: payloads.map((p) => p.text ?? "").join(" | ").slice(0, 400), isError: payloads.some((p) => p.isError), stderr: exit === 0 ? undefined : redact(stderr).slice(-600),
    requests: mine.map((r) => ({ t: (r.at - t0) / 1000, provider: r.provider, status: r.status, effort: r.effort, items: r.items, bytes: r.bytes, estTokens: r.estTokens, dsReasoningAsText: r.dsReasoningAsText, grokReasoningItems: r.grokReasoningItems })),
    fastCompactionFellBack: lines.some((l) => /versa-fast-quality-v1" (?:failed|is configured but not registered)/u.test(l.line)),
    transcript: transcriptSince(arm.state, bigKey, t0),
    decisions: decisions(arm, t0, t1) };
};

// ---- run ----
const armB = { name: "B", runtime: runtimeB, state: stateB, configPath: configPathB, port: portB };
const results = { think: [], big: [] };
let armA;
try {
  armA = ARMS.includes("A") ? await cloneArm(armB, "A", runtimeA) : null;
  const bigArm = armA ?? armB;
  if (PHASES.includes("think")) {
    for (const arm of [armA, armB].filter(Boolean)) {
      restoreDb(arm.state);
      await startGateway(arm);
      results.think.push(...await thinkPhase(arm));
      await stopGateway(arm);
    }
  }
  if (PHASES.includes("big")) {
    for (const window of WINDOWS) {
      grokWindow = window;
      writeConfigs(bigArm.state, bigArm.configPath, bigArm.runtime, window);
      for (const scenario of BIG) {
        // A database swapped under a running Gateway fails DB91 integrity; every scenario starts cold.
        restoreDb(bigArm.state);
        await startGateway(bigArm);
        const r = scenario === "manual" ? await bigTurn(bigArm, "manual", window, GROK) : await bigTurn(bigArm, "fb503", window, undefined);
        results.big.push(r);
        log(JSON.stringify(r, null, 1));
        await stopGateway(bigArm);
      }
    }
  }
} finally {
  for (const arm of [armA, armB]) if (arm?.proc && arm.proc.exitCode === null) await stopGateway(arm);
  server.close();
}

const out = { installed, bigSession: { key: bigKey, profile: bigProfile, entryBefore: bigEntryBefore }, phases: PHASES, windows: WINDOWS, otherRequests: other.length, results };
const outPath = process.env.MS_OUT ?? path.join(scratch, "model-switch-fallback-result.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
