// Candidate for lab/release-files/luna-fallback-takeover (2026-11-03): when DeepSeek fails, does the
// fallback model (gpt-6-luna) take over a ~580k-token session and answer?
//
// V 2026-11-03 16:53-17:47: turns that reached luna all finished (mid-turn precheck compacted
// 443k-503k sessions), but most failing turns never reached it. This candidate replays the three
// DeepSeek behaviours seen that day on a big mirrored session (copied as in lab/candidate/model-switch-fallback.mjs),
// with V's model, fallback and compaction setup, in arms
//   A = the runtime's live bytes (checked equal to V's before shas)
//   B = the same runtime with lab/patch-luna-fallback-takeover.mjs applied
//   C = B plus the gpt-6-luna row (contextTokens 850000) in both configs
//   D = B plus lab/patch-session-budget-maintenance.mjs (what V runs since 2026-11-04)
//   E = D plus the gpt-6-luna row (scripts/configure-v-luna-context.mjs)
// DeepSeek scenarios (tag in the user message):
//   s503      every request 503 "Service is too busy" (what already worked on V)
//   s503hang  the first LF_FAIL_FIRST requests 503 (the Worker's whole first attempt), later requests
//             answer 200 and then stay silent (V: turns lost after the Gateway's profile rotation)
//   hang      every request answers 200 and stays silent (V: idle timeout, no fallback)
//   hangpin   like hang, on a session whose model the user picked (no fallback: what does the user see?)
//   s503nocompact  every DeepSeek request 503 and the fast-compaction model 503 too (compaction.model is DeepSeek)
//   ok        DeepSeek healthy (speed check, small and big session)
//   switch    a fresh session grown on DeepSeek to LF_SWITCH_EMOJI emoji, then /model luna and one small
//             turn: the first luna turn's pre-turn check (V 2026-11-04: 272000 / 252000 without the row)
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
// oc_f164f1c7: ~583k DeepSeek tokens, never compacted (faa116bd was compacted by earlier shared tests).
const SESSION_ID = process.env.LF_SESSION ?? "ac50d9cc-b3d1-477c-b232-183eb7f53624";
const TURN_TIMEOUT_MS = Number(process.env.LF_TURN_TIMEOUT_MS ?? 900_000);
const DS = "deepseek/deepseek-flash";
// LF_LUNA_REAL=1: the fallback is V's own openai/gpt-6-luna (forward-compat entry in openai-chatgpt-provider, model
// catalog, context caches), only its baseUrl points at the stand-in and its OAuth profile is fake. Otherwise a
// lunastub provider whose config row carries contextTokens, which hides any budget read from the model catalog.
const LUNA_REAL = process.env.LF_LUNA_REAL === "1";
const LUNA = LUNA_REAL ? "openai/gpt-6-luna" : "lunastub/gpt-6-luna";
const COMPACT = "compactstub/sol-stub";
const BUSY = "Service is too busy. We advise users to temporarily switch to alternative LLM API service providers.";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { FILES } = await import(path.join(repoRoot, "lab/patch-luna-fallback-takeover.mjs"));
// Arm A must run V's bytes. Shared VLab may already carry this release, so fall back to the captured V bytes.
const CAPTURED = { "openclaw/dist": "release/captured/v2026.9.1-db91.6-codex-context-batch-20261101/dist", "production-worker": "release/captured/v2026.9.1-db91.6-codex-context-batch-20261101.worker/dist" };
const live = FILES.map((file) => {
  const target = path.join(runtime, file.target, file.name);
  const runtimeBytes = fs.readFileSync(target, "utf8");
  const captured = path.join(repoRoot, CAPTURED[file.target], file.name);
  const bytes = sha(runtimeBytes) === file.before ? runtimeBytes : fs.readFileSync(captured, "utf8");
  assert.equal(sha(bytes), file.before, `no V bytes for ${file.name}`);
  return { file, target, bytes, liveIsV: sha(runtimeBytes) === file.before, runtimeSha: sha(runtimeBytes) };
});
log("runtime vs V", JSON.stringify(live.map((l) => ({ target: `${l.file.target}/${l.file.name}`, liveIsV: l.liveIsV }))));
const installB = () => {
  for (const l of live) {
    fs.writeFileSync(`${l.target}.next`, l.file.patch(l.bytes));
    fs.renameSync(`${l.target}.next`, l.target);
  }
};
// Arm D: B plus lab/patch-session-budget-maintenance.mjs (session maintenance uses the turn's budget).
const { FILES: MAINT_FILES } = await import(path.join(repoRoot, "lab/patch-session-budget-maintenance.mjs"));
const maint = MAINT_FILES.map((file) => {
  const target = path.join(runtime, file.target, file.name);
  const runtimeBytes = fs.readFileSync(target, "utf8");
  const bytes = sha(runtimeBytes) === file.before ? runtimeBytes : fs.readFileSync(path.join(repoRoot, CAPTURED[file.target], file.name), "utf8");
  assert.equal(sha(bytes), file.before, `no pre-maintenance bytes for ${file.name}`);
  return { file, target, bytes };
});
const setMaintenance = (on) => { for (const m of maint) fs.writeFileSync(m.target, on ? m.file.patch(m.bytes) : m.bytes); };
const restoreA = () => { for (const l of live) fs.writeFileSync(l.target, l.bytes); setMaintenance(false); };

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
// Emoji count about 2.4 tokens each on the real luna backend (shared VLab, 2026-11-03: 200k emoji -> 491,681).
const estimateTokens = (s) => { const cjk = (s.match(/[　-鿿＀-￯]/gu) ?? []).length; const emoji = (s.match(/\p{Extended_Pictographic}/gu) ?? []).length; return Math.round(cjk * 0.7 + emoji * 2.4 + (s.length - cjk - emoji * 2) / 3.6); };
const ccChunk = (model, delta, finish, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
const dsCount = new Map();
// Compaction requests do not carry the turn's tag (the current prompt is never summarized): they follow the turn in flight.
let activeScenario = null;
const deepseek = (req, res, body, turn, rec) => {
  const key = turn ? `${turn.arm}-${turn.scenario}-${turn.n}` : "untagged";
  const nth = (dsCount.get(key) ?? 0) + 1;
  dsCount.set(key, nth);
  rec.nth = nth;
  const scenario = turn?.scenario ?? activeScenario ?? "ok";
  const fail503 = scenario === "s503" || scenario === "s503nocompact" || (scenario === "s503hang" && nth <= FAIL_FIRST);
  const hang = scenario === "hang" || scenario === "hangpin" || (scenario === "s503hang" && nth > FAIL_FIRST);
  if (fail503) { rec.status = 503; res.writeHead(503, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: BUSY } })); }
  if (hang) {
    rec.status = "200-silent";
    // V 2026-11-03: the stream opened and then no model event came ("LLM idle timeout ... no response from
    // model"). A queued DeepSeek request keeps the connection alive with SSE comments, so the transport
    // never times out; only the model idle timeout fires.
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(": keep-alive\n\n");
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 3_000);
    req.on("close", () => clearInterval(keepAlive));
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
const compactor = (res, body, turn, rec) => {
  if ((turn?.scenario ?? activeScenario) === "s503nocompact") { rec.status = 503; res.writeHead(503, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: "upstream unavailable" } })); }
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
  // LF_LUNA_USAGE: report the real backend's prompt size (2026-11-03 shared VLab: 222,061 for the same message);
  // the post-turn checks compare the persisted usage, not the request.
  const inputTokens = Number(process.env.LF_LUNA_USAGE ?? 0) || rec.estTokens;
  const usage = { input_tokens: inputTokens, output_tokens: 30, total_tokens: inputTokens + 30 };
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
    // Re-serialize: the ChatGPT route escapes non-ASCII (\uXXXX), which would hide emoji from the estimate.
    const rec = { at, role, model: body.model, bytes: raw.length, items: items.length, estTokens: estimateTokens(raw.startsWith("{") ? JSON.stringify(body) : raw), ...turn };
    requests.push(rec);
    if (role === "luna") return luna(res, body, turn, rec);
    if (role === "compaction") return compactor(res, body, turn, rec);
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
// OpenClaw skips the model idle watchdog for loopback/private provider hosts (isLocalProviderHostname), so a
// DeepSeek stand-in on 127.0.0.1 never produces V's "LLM idle timeout". lvh.me is public DNS for 127.0.0.1.
const deepseekStandin = `http://${process.env.LF_DS_HOST ?? "lvh.me"}:${server.address().port}/v1`;

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
  // lvh.me resolves to loopback: let the provider request through the SSRF guard (stand-in only).
  providers.deepseek.request = { ...(providers.deepseek.request ?? {}), allowPrivateNetwork: true };
  Object.assign(providers.deepseek, { baseUrl: deepseekStandin, apiKey: "sk-standin-loopback", agentRuntime: { id: "vlab-worker" }, timeoutSeconds: DS_TIMEOUT_S });
  providers.deepseek.models = [...(providers.deepseek.models ?? []).filter((m) => m.id !== V_FLASH.id), V_FLASH];
  if (LUNA_REAL) {
    // Provider-level baseUrl only, no model row: on V gpt-6-luna resolves through the forward-compat entry.
    // Provider-level api keeps the ChatGPT subscription route (an unofficial baseUrl alone reads as the API-key
    // route and filters out OAuth, docs/v-add-openai-model-by-config.md); it adds no model row.
    providers.openai = { ...(providers.openai ?? {}), baseUrl: `http://${process.env.LF_DS_HOST ?? "lvh.me"}:${server.address().port}/v1`, api: "openai-chatgpt-responses", request: { allowPrivateNetwork: true } };
    if (Array.isArray(providers.openai.models)) providers.openai.models = providers.openai.models.filter((m) => m.id !== "gpt-6-luna");
    config.auth = { ...(config.auth ?? {}), order: { ...(config.auth?.order ?? {}), openai: ["openai:lf-fake"] } };
    if (config.auth.profiles) for (const id of Object.keys(config.auth.profiles)) if (id.startsWith("openai:")) delete config.auth.profiles[id];
    config.auth.profiles = { ...(config.auth.profiles ?? {}), "openai:lf-fake": { provider: "openai", mode: "oauth" } };
  } else providers.lunastub = { baseUrl: standin, apiKey: "luna-standin-loopback", api: "openai-responses", models: [LUNA_MODEL] };
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
// The row V gets from scripts/configure-v-luna-context.mjs.
const { LUNA_ROW } = await import(path.join(repoRoot, "scripts/configure-v-luna-context.mjs"));
const setLunaRow = (on) => {
  for (const file of [configPath, workerPlugin.workerConfigPath]) {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    const rest = (config.models.providers.openai.models ?? []).filter((m) => m.id !== "gpt-6-luna");
    config.models.providers.openai.models = on ? [...rest, LUNA_ROW] : rest;
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }
};
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
  // V resolves two deepseek auth candidates (a deepseek:default profile, then the provider key), which is what
  // lets the prompt stage rotate profiles after a 5xx. Give the private store the same profile, on the stand-in.
  {
    const row = dst.prepare("SELECT store_key, store_json FROM auth_profile_store").get();
    const store = row ? JSON.parse(row.store_json) : { version: 1, profiles: {} };
    store.profiles = { ...(store.profiles ?? {}), "deepseek:default": { type: "api_key", provider: "deepseek", key: "sk-standin-profile-loopback" } };
    // Never carry a real OpenAI refresh token into a candidate (a refresh rotates the shared account's chain).
    for (const id of Object.keys(store.profiles)) if (id.startsWith("openai")) delete store.profiles[id];
    if (LUNA_REAL) {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
      const access = `${b64({ alg: "none", typ: "JWT" })}.${b64({ exp, "https://api.openai.com/auth": { chatgpt_account_id: "acct-lf-fake", chatgpt_plan_type: "pro" } })}.fake`;
      store.profiles["openai:lf-fake"] = { type: "oauth", provider: "openai", email: "lf-fake@example.invalid", access, refresh: "lf-fake-refresh-never-valid", accountId: "acct-lf-fake", chatgptPlanType: "pro", expires: exp * 1000 };
    }
    if (row) dst.prepare("UPDATE auth_profile_store SET store_json = ?, updated_at = ? WHERE store_key = ?").run(JSON.stringify(store), Date.now(), row.store_key);
    else dst.prepare("INSERT INTO auth_profile_store (store_key, store_json, updated_at) VALUES ('primary', ?, ?)").run(JSON.stringify(store), Date.now());
  }
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = DELETE");
  src.close(); dst.close();
}
// Other agents' stores in the candidate state may hold the shared VLab's OpenAI OAuth; drop them.
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
  for (let i = 0; i < 60 && !(await portRangeFree(port, 12)); i++) await sleep(2_000);
  assert(await portRangeFree(port, 12), `port ${port} is busy`);
  const tmp = path.join(scratch, "tmp-gw");
  for (const dir of [tmp, path.join(scratch, "cache-gw")]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // OPENCLAW_GATEWAY_PORT: the agent CLI otherwise inherits the shared VLab Gateway's port and runs there.
  // DEEPSEEK_API_KEY: V's Gateway has the provider key both in config and in its environment, i.e. two
  // auth candidates for deepseek, which is what lets the prompt stage rotate profiles.
  const env = { ...process.env, ...(process.env.LF_DEBUG_LOG === "1" ? { OPENCLAW_LOG_LEVEL: "debug" } : {}), DEEPSEEK_API_KEY: "sk-standin-env-loopback", OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_GATEWAY_PORT: String(port),
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
// With LF_DEBUG_LOG=1 the file logs carry logVerbose decisions (preflightCompaction check/triggered ...).
const DEBUG_RE = /preflightCompaction|memoryFlush|memory flush|compaction|Compaction|contextWindow|threshold/u;
const debugLines = (t0, t1) => {
  if (process.env.LF_DEBUG_LOG !== "1") return undefined;
  const out = [];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 6 && !/node_modules|agents|workspace|npm/u.test(e.name)) walk(p, depth + 1);
      else if (e.isFile() && /^openclaw-.*\.log$/u.test(e.name)) {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
          if (!DEBUG_RE.test(line)) continue;
          const time = /"time":"([^"]+)"/u.exec(line)?.[1] ?? /"date":"([^"]+)"/u.exec(line)?.[1];
          const at = time ? Date.parse(time) : NaN;
          if (at >= t0 && at <= t1 + 5000) out.push(`${((at - t0) / 1000).toFixed(1)}s ${line.replace(/\s+/gu, " ").slice(0, 600)}`);
        }
      }
    }
  };
  walk(scratch, 0);
  walk("/tmp", 1);
  return out.sort().slice(0, 120);
};
// The agent CLI replays the whole branch of the mirrored session (chat.send into a mirrored group only replays its own conversation).
const bigTurn = async (arm, scenario, n) => {
  const message = `[lf ${arm} ${scenario} ${n}] 用一句话回答：现在这个群主要在讨论什么？不要调用工具。`;
  const t0 = Date.now();
  const args = [path.join(runtime, "openclaw", "dist", "index.js"), "agent", "--agent", "makaron", "--session-key", bigKey, "--message", message, "--json", "--timeout", String(Math.round(TURN_TIMEOUT_MS / 1000))];
  if (scenario === "manual") args.push("--model", LUNA);
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
  // By time window: the ChatGPT Responses route shapes its input differently and the tag is not always parsed.
  const mine = requests.filter((r) => r.at >= t0 && r.at <= t1);
  // Every scenario reaches the DeepSeek stand-in first; none means the turn ran on some other Gateway.
  if (!mine.some((r) => r.role === (scenario === "manual" ? "luna" : "deepseek"))) log("turn reached no stand-in", JSON.stringify({ text, stderr: redact(stderr).slice(-1500), decisions: decisions(t0, t1).slice(0, 40), other: gw.lines.filter((l) => l.at >= t0 && l.at <= t1 + 2000 && /openai|luna|auth|route|error|fail/iu.test(l.line) && !NOISE_RE.test(l.line)).map((l) => redact(l.line).slice(0, 300)).slice(0, 40) }, null, 1));
  assert(mine.some((r) => r.role === (scenario === "manual" ? "luna" : "deepseek")), `turn ${arm}/${scenario} never reached the stand-ins (Gateway target: ${/Gateway target: (\S+)/u.exec(stderr)?.[1] ?? "?"})`);
  const lunaAnswered = /Luna 的回答/u.test(text);
  return { arm, scenario, exit, totalS: (t1 - t0) / 1000, lunaAnswered, text: text.slice(0, 300), isError: payloads.some((p) => p.isError),
    stderr: exit === 0 ? undefined : redact(stderr).slice(-600),
    requests: mine.map((r) => ({ t: +((r.at - t0) / 1000).toFixed(1), role: r.role, status: r.status, nth: r.nth, items: r.items, estTokens: r.estTokens })),
    compactionRequests: requests.filter((r) => r.role === "compaction" && r.at >= t0 && r.at <= t1).length,
    // Compaction relative to luna's answer: before = pre-turn / in-turn, after = post-turn.
    compactionTimeline: requests.filter((r) => r.at >= t0 && r.at <= t1 && (r.role === "compaction" || r.role === "luna")).map((r) => `${((r.at - t0) / 1000).toFixed(1)}s ${r.role} ${r.estTokens}`),
    fastCompactionFellBack: gw.lines.some((l) => l.at >= t0 && /versa-fast-quality-v1" (?:failed|is configured but not registered|returned empty)/u.test(l.line)),
    transcript: transcriptSince(bigKey, t0),
    debug: debugLines(t0, t1),
    decisions: decisions(t0, t1) };
};
// The shared VLab acceptance on 2026-11-03: a fresh session, /model openai/gpt-6-luna, then one ~222k-token message
// over chat.send (the Gateway reply pipeline, not the agent CLI).
const chatLunaTurn = async (arm, emojiCount) => {
  const sessionKey = `agent:makaron:explicit:vlab-dev-lf-chat-${arm.toLowerCase()}-${Date.now()}`;
  const send = async (message, tag) => {
    const t0 = Date.now();
    const sent = await gw.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: TURN_TIMEOUT_MS, idempotencyKey: `lf-chat-${arm}-${tag}-${t0}` });
    if (sent?.runId) await gw.client.request("agent.wait", { runId: sent.runId, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: TURN_TIMEOUT_MS + 20_000 }).catch(() => null);
    return { t0, runId: sent?.runId };
  };
  await send(`/model ${LUNA}`, "model");
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let body = ""; for (let i = 0; i < emojiCount; i++) { body += String.fromCodePoint(0x1F300 + Math.floor(rnd() * 0x2FF)); if (i % 60 === 59) body += "\n"; }
  const { t0 } = await send(`[lf ${arm} chat 1] 上下文容量测试，只回复暗号 LF-CHAT-OK。\n\n${body}`, "big");
  await sleep(20_000); // a post-turn compaction lands after the reply
  const t1 = Date.now();
  const db = new DatabaseSync(path.join(stateDir, dbRel), { readOnly: true });
  let entry;
  try { entry = JSON.parse(db.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(sessionKey)?.entry_json ?? "null"); } finally { db.close(); }
  return { arm, scenario: "chat", sessionKey, totalS: (t1 - t0) / 1000,
    entry: entry && { compactionCount: entry.compactionCount ?? 0, totalTokens: entry.totalTokens, contextTokens: entry.contextTokens, model: entry.model,
      checkpoints: (entry.compactionCheckpoints ?? []).map((c) => ({ reason: c.reason, tokensBefore: c.tokensBefore, tokensAfter: c.tokensAfter })) },
    requests: requests.filter((r) => r.at >= t0 && r.at <= t1).map((r) => ({ t: +((r.at - t0) / 1000).toFixed(1), role: r.role, status: r.status, estTokens: r.estTokens })),
    debug: debugLines(t0, t1), decisions: decisions(t0, t1) };
};
// Healthy DeepSeek: a small session over chat.send, chat.send -> first DeepSeek request / first delta / final.
// V 2026-11-04: a session over 252k tokens on DeepSeek (or vcodex/terra), then /luna. The first luna turn's
// pre-turn check cannot use the entry's budget (the entry still records the previous model) and looks the model up.
const switchLunaTurn = async (arm, emojiCount) => {
  const sessionKey = `agent:makaron:explicit:vlab-dev-lf-switch-${arm.toLowerCase()}-${Date.now()}`;
  const send = async (message, tag) => {
    const t0 = Date.now();
    const sent = await gw.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: TURN_TIMEOUT_MS, idempotencyKey: `lf-switch-${arm}-${tag}-${t0}` });
    if (sent?.runId) await gw.client.request("agent.wait", { runId: sent.runId, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: TURN_TIMEOUT_MS + 20_000 }).catch(() => null);
    return { t0, runId: sent?.runId };
  };
  const readEntry = () => {
    const db = new DatabaseSync(path.join(stateDir, dbRel), { readOnly: true });
    try { return JSON.parse(db.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(sessionKey)?.entry_json ?? "null"); } finally { db.close(); }
  };
  const brief = (e) => e && { model: e.model, modelOverride: e.modelOverride, totalTokens: e.totalTokens, contextTokens: e.contextTokens, compactionCount: e.compactionCount ?? 0,
    checkpoints: (e.compactionCheckpoints ?? []).map((c) => ({ reason: c.reason, tokensBefore: c.tokensBefore, tokensAfter: c.tokensAfter })) };
  let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let body = ""; for (let i = 0; i < emojiCount; i++) { body += String.fromCodePoint(0x1F300 + Math.floor(rnd() * 0x2FF)); if (i % 60 === 59) body += "\n"; }
  const grow = await send(`[lf ${arm} switch 1] 上下文容量测试，只回复暗号 LF-GROW-OK。\n\n${body}`, "grow");
  await sleep(20_000); // let any post-turn maintenance land before switching
  const afterGrow = brief(readEntry());
  await send(`/model ${LUNA}`, "model");
  const afterSwitch = brief(readEntry());
  const { t0 } = await send(`[lf ${arm} switch 2] 只回复暗号 LF-SWITCH-OK。`, "luna");
  await sleep(20_000);
  const t1 = Date.now();
  const window = requests.filter((r) => r.at >= t0 && r.at <= t1);
  return { arm, scenario: "switch", sessionKey, totalS: (t1 - t0) / 1000,
    growRequests: requests.filter((r) => r.at >= grow.t0 && r.at < t0).map((r) => ({ role: r.role, status: r.status, estTokens: r.estTokens })),
    afterGrow, afterSwitch, entry: brief(readEntry()),
    requests: window.map((r) => ({ t: +((r.at - t0) / 1000).toFixed(1), role: r.role, status: r.status, estTokens: r.estTokens })),
    // A compaction request before luna's answer = the pre-turn check compacted the session.
    compactedBeforeLuna: window.findIndex((r) => r.role === "compaction") !== -1 && window.findIndex((r) => r.role === "compaction") < window.findIndex((r) => r.role === "luna"),
    debug: debugLines(t0, t1), decisions: decisions(t0, t1) };
};
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
    if (arm === "B" || arm === "C" || arm === "D" || arm === "E") installB(); else restoreA();
    setMaintenance(arm === "D" || arm === "E");
    // Arm C: B plus the luna model row with contextTokens, as tried on shared VLab 2026-11-03; E: D plus the row.
    if (LUNA_REAL) setLunaRow(arm === "C" || arm === "E");
    if (!LUNA_REAL) setLunaContextTokens(LUNA_CTX[arm]);
    for (const scenario of SCENARIOS) {
      // A database swapped under a running Gateway fails DB91 integrity; every scenario starts cold.
      restoreDb({ userPickedModel: scenario === "hangpin" });
      await startGateway();
      activeScenario = scenario;
      const r = scenario === "chat" ? await chatLunaTurn(arm, Number(process.env.LF_CHAT_EMOJI ?? 80000))
        : scenario === "switch" ? await switchLunaTurn(arm, Number(process.env.LF_SWITCH_EMOJI ?? 130000))
        : await bigTurn(arm, scenario, 1);
      activeScenario = null;
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
