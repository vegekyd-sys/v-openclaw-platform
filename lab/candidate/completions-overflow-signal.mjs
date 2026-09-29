// Candidate test for lab/release-files/completions-overflow-signal: an oversized
// deepseek-flash session must compact and answer, not stop after one token.
//
// Production V 2026-09-26..29, the whole chain (read in 2026.9.1 db91.6):
// 1. compaction.provider=versa-fast-quality-v1 forces compaction mode "safeguard",
//    which turns off the runtime's usage-threshold auto-compaction; the pre-prompt
//    check only logs "admitted ... route=compact_only". A session compacts only
//    when a provider call fails as a context overflow.
// 2. The completions transport clamps max_tokens to
//    max(1, context - estimatedInput - 1) for proxy-like endpoints. The estimate
//    counts a CJK character as 1.25 tokens (DeepSeek: ~0.6), so a Chinese-heavy
//    session of 484k-900k real tokens estimates past the window and is sent with
//    max_tokens=1 (recorded on the wire). DeepSeek stops with finish_reason=length
//    after one token: an incomplete turn, not an overflow, so nothing compacts.
// 3. The run falls back to xai/grok-4.6 (500k window), which overflows for real.
//
// The patch turns "no room left for output" into a "Context overflow:" error, the
// signal OpenClaw already answers with auto-compaction and a retry.
//
// Both modes run production V's model entry with contextTokens=CTX_CAP (700000 by
// default) so the two mirrored sessions land on either side of the estimate limit:
//   faa116bd  484k real, estimated ~600k: fits, must answer without compacting
//   fbf5d45f  761k real, estimated ~940k: over the limit
// CTX_EXPECT=bug    unpatched: the over-limit session is sent with max_tokens=1 and
//                   stops on length -- the failure path must reproduce
// CTX_EXPECT=fixed  patched: it compacts with a real summary, the retried prompt is
//                   under the cap, and a visible reply arrives; no request carries a
//                   max_tokens under 4096
//
// Configuration mirrors V (primary deepseek-flash, compaction model deepseek-flash,
// vlab-worker -> openclaw runtime) on the Gateway and Worker config copies. Channels
// and cron are cleared. Sessions are copied row by row from the shared VLab mirror
// into a fresh private database; a local recorder in front of DeepSeek logs each
// request's max_tokens and the stream's finish_reason. Nothing is written to shared
// state.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");

const capRaw = process.env.CTX_CAP ?? "700000";
const cap = capRaw === "none" ? null : Number(capRaw);
assert(cap === null || (Number.isInteger(cap) && cap > 0), `bad CTX_CAP ${capRaw}`);
const sessionIds = (process.env.CTX_SESSIONS ?? "fbf5d45f-0183-4afc-9f08-5728740a9390,faa116bd-0fbf-40ee-b157-52022411c7d1")
  .split(",").map((s) => s.trim()).filter(Boolean);
const MODEL = "deepseek/deepseek-flash";
const STUB = "No reliable summary text was returned";
const expect = process.env.CTX_EXPECT ?? "fixed";
assert(["bug", "fixed"].includes(expect), `bad CTX_EXPECT ${expect}`);
const patched = fs.readFileSync(path.join(process.env.VLAB_CANDIDATE_RUNTIME, "openclaw", "node_modules", "@openclaw", "ai", "dist", "transports.mjs"), "utf8").includes("completions-overflow-signal-v1");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");


// ---- wire recorder in front of DeepSeek: what OpenClaw really sends, what comes back ----
// finish_reason=length with 1 output token is not what DeepSeek does on an oversized
// request (it answers 400 "maximum context length is 1048576"), so record max_tokens,
// payload size and the stream's finish_reason/usage for every call.
const upstream = JSON.parse(fs.readFileSync(configPath, "utf8")).models.providers.deepseek.baseUrl.replace(/\/$/u, "");
const wire = [];
const proxy = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const rec = { at: Date.now(), path: req.url, bytes: body.length };
    try {
      const j = JSON.parse(body.toString("utf8"));
      Object.assign(rec, { model: j.model, max_tokens: j.max_tokens ?? j.max_completion_tokens ?? null, messages: j.messages?.length,
        tools: j.tools?.length ?? 0, stream: j.stream, reasoning_effort: j.reasoning_effort, thinking: j.thinking });
    } catch {}
    wire.push(rec);
    try {
      const headers = { ...req.headers };
      delete headers.host; delete headers["content-length"];
      const up = await fetch(`${upstream}${req.url.replace(/^\/v1/u, "")}`, { method: req.method, headers, body });
      rec.status = up.status;
      res.writeHead(up.status, Object.fromEntries([...up.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k))));
      let tail = "";
      for await (const c of up.body) {
        res.write(c);
        tail = (tail + Buffer.from(c).toString("utf8")).slice(-20000);
        const f = tail.match(/"finish_reason":"([a-z_]+)"/gu);
        if (f) rec.finish = f.at(-1).split(":")[1].replaceAll('"', "");
      }
      const u = tail.match(/"usage":(\{[^{}]*(\{[^{}]*\}[^{}]*)*\})/gu);
      if (u) { try { rec.usage = JSON.parse(u.at(-1).slice(8)); } catch {} }
      if (up.status >= 400) rec.error = tail.slice(0, 300);
      res.end();
    } catch (error) {
      rec.error = String(error.message ?? error).slice(0, 200);
      res.writeHead(502); res.end();
    }
    rec.secs = Math.round((Date.now() - rec.at) / 1000);
  });
});
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const proxyBase = `http://127.0.0.1:${proxy.address().port}/v1`;

// ---- production V's model entry and compaction model, on both config copies ----
// Same fields as V's models.providers.deepseek.models[id=deepseek-flash] (2026-09-29).
const flashEntry = {
  id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000000, maxTokens: 384000, api: "openai-completions",
  compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" },
  ...(cap ? { contextTokens: cap } : {}),
};
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  deepseek.baseUrl = proxyBase;
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
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
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

// ---- private makaron database holding only the chosen sessions ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });

function buildPrivateDatabase() {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec);
  dst.loadExtension(vec);
  // Tables are copied in schema order, not dependency order; check keys once at the end.
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);

  const keys = new Set();
  for (const id of sessionIds) {
    const row = src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(id);
    assert(row, `session ${id} is not in the shared VLab mirror`);
    keys.add(row.session_key);
  }
  const ids = new Set(sessionIds);
  const convs = new Set();
  for (const id of ids) {
    for (const r of src.prepare("SELECT conversation_id FROM session_conversations WHERE session_id = ?").all(id)) convs.add(r.conversation_id);
    const w = src.prepare("SELECT primary_conversation_id FROM session_windows WHERE session_id = ?").get(id);
    if (w?.primary_conversation_id) convs.add(w.primary_conversation_id);
  }
  const copied = {};
  const inList = (col, set) => `"${col}" IN (${[...set].map(() => "?").join(",")})`;
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    let where = "", args = [];
    if (cols.includes("session_id")) { where = inList("session_id", ids); args = [...ids]; }
    else if (cols.includes("session_key")) { where = inList("session_key", keys); args = [...keys]; }
    else if (cols.includes("conversation_id")) {
      if (!convs.size) continue;
      where = inList("conversation_id", convs); args = [...convs];
    }
    const list = cols.map((c) => `"${c}"`).join(",");
    const rows = src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).all(...args);
    if (!rows.length) continue;
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of rows) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
    copied[t.name] = rows.length;
  }
  const dangling = dst.prepare("PRAGMA foreign_key_check").all();
  assert.equal(dangling.length, 0, `copied rows reference missing parents: ${JSON.stringify(dangling.slice(0, 5))}`);
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();
  dst.close();
  return { keys: [...keys], copied };
}

// ---- what the private database says about one session key since a moment ----
function observe(sessionKey, sinceMs) {
  const db = new DatabaseSync(dstPath, { readOnly: true });
  const node = db.prepare("SELECT current_session_id, json_extract(entry_json, '$.contextTokens') ctx FROM session_nodes WHERE session_key = ?").get(sessionKey);
  const windows = db.prepare("SELECT session_id FROM session_windows WHERE session_key = ?").all(sessionKey).map((r) => r.session_id);
  const events = db.prepare(`SELECT session_id, seq, event_json FROM transcript_events
    WHERE session_id IN (${windows.map(() => "?").join(",")}) AND created_at >= ? ORDER BY created_at, seq`).all(...windows, sinceMs);
  db.close();
  const out = { currentSessionId: node?.current_session_id, entryContextTokens: node?.ctx ?? null, compactions: [], assistants: [] };
  for (const e of events) {
    const j = JSON.parse(e.event_json);
    if (j.type === "compaction") {
      out.compactions.push({ tokensBefore: j.tokensBefore, fromHook: j.fromHook ?? null, stub: String(j.summary ?? "").includes(STUB), summaryHead: String(j.summary ?? "").slice(0, 240) });
    } else if (j.type === "message" && j.message?.role === "assistant") {
      const u = j.message.usage ?? {};
      out.assistants.push({ model: j.message.model, stopReason: j.message.stopReason, promptTokens: (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0), output: u.output ?? 0, afterCompaction: out.compactions.length > 0 });
    }
  }
  return out;
}

function lastPromptTokens(sessionKey) {
  const db = new DatabaseSync(dstPath, { readOnly: true });
  const row = db.prepare(`SELECT json_extract(event_json, '$.message.usage') u FROM transcript_events
    WHERE session_id = (SELECT current_session_id FROM session_nodes WHERE session_key = ?)
      AND json_extract(event_json, '$.message.role') = 'assistant'
      AND json_extract(event_json, '$.message.usage.totalTokens') > 0 ORDER BY seq DESC LIMIT 1`).get(sessionKey);
  db.close();
  const u = row?.u ? JSON.parse(row.u) : {};
  return (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
}


// ---- diagnostics in this run's private runtime copy only (CTX_INSTRUMENT=1) ----
// Logs what the pre-prompt compaction check decided and what the completions
// transport estimated, which the normal log level does not show.
if (process.env.CTX_INSTRUMENT === "1") {
  const patch = (dir, pattern, marker, insert) => {
    const name = fs.readdirSync(dir).find((f) => /\.(m?js)$/u.test(f) && fs.readFileSync(path.join(dir, f), "utf8").includes(marker));
    assert(name, `instrumentation marker not found in ${dir}: ${marker}`);
    const file = path.join(dir, name);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(marker, `${marker}${insert}`));
  };
  patch(dist, /x/u, "if (shouldSkipPrecheck) preemptiveCompaction = null;",
    ` console.error("[ctx-probe] precheck " + JSON.stringify({ budget: input.contextTokenBudget, reserve: input.reserveTokens, skip: shouldSkipPrecheck, engine: input.activeContextEngine?.info?.id, owns: input.activeContextEngine?.info?.ownsCompaction, result: preemptiveCompaction && Object.fromEntries(Object.entries(preemptiveCompaction).filter(([k, v]) => typeof v !== "object")) }));`);
  patch(path.join(runtime, "openclaw", "node_modules", "@openclaw", "ai", "dist"), /x/u, "const estimatedInputTokens = estimateOpenAICompletionsInputTokens(params);",
    ` console.error("[ctx-probe] transport " + JSON.stringify({ model: model.id, effectiveContextTokens, estimatedInputTokens, requested: clampedMaxTokens }));`);
}

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

const PROMPT = "（自动化测试，请勿调用任何工具）请直接用两三句话概括：这个群最近在处理什么事情，还有什么没完成。";
async function runTurn(sessionKey) {
  const started = Date.now();
  const before = lastPromptTokens(sessionKey);
  const child = spawn(process.execPath, [
    `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", MODEL, "--message", PROMPT, "--json", "--timeout", "1500",
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const exit = await new Promise((resolve) => child.on("close", resolve));
  let meta;
  try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
  const reply = String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "");
  const seen = observe(sessionKey, started);
  const logs = lines.filter((l) => l.at >= started && /compact|overflow|context.?window|preemptive|stopReason=length|ctx-probe/iu.test(l.line))
    .map((l) => redact(l.line).slice(0, 300)).slice(-25);
  return { sessionKey, exit, secs: Math.round((Date.now() - started) / 1000), promptTokensBefore: before, reply: reply.slice(0, 300), ...seen, logs,
    wire: wire.filter((w) => w.at >= started),
    ...(process.env.CTX_INSTRUMENT === "1" ? { turnLog: lines.filter((l) => l.at >= started && !/firsttext-metrics|prompt-prep-observer|bundle-prep-observer|memory-preparation|card-phase|DingTalk|tools\.(profile|allow)|\[ws\]/u.test(l.line)).map((l) => redact(l.line).replace(/\x1b\[[0-9;]*m/gu, "").slice(0, 400)).slice(0, 200) } : {}),
    stderr: exit === 0 ? undefined : redact(stderr).slice(-800) };
}

const built = buildPrivateDatabase();
startGateway();
const results = [];
try {
  await connectGateway();
  for (const key of built.keys) results.push(await runTurn(key));
  console.log(JSON.stringify({ cap, sessions: sessionIds, copied: built.copied, results }, null, 1));

  assert(cap, "both modes need a contextTokens cap that splits the two sessions");
  assert.equal(patched, expect === "fixed", `patch marker ${patched} does not match CTX_EXPECT=${expect}`);
  const over = results.filter((r) => r.promptTokensBefore > cap * 0.8);
  const under = results.filter((r) => r.promptTokensBefore <= cap * 0.8);
  assert(over.length > 0 && under.length > 0, "need one session over and one under the estimate limit");
  for (const r of under) {
    // below the limit both builds must behave the same: a normal answer, no compaction
    assert.equal(r.exit, 0, `${r.sessionKey}: under-limit session failed`);
    assert.equal(r.compactions.length, 0, `${r.sessionKey}: under-limit session compacted`);
    assert(r.wire.length > 0 && r.wire.every((w) => w.max_tokens >= 4096), `${r.sessionKey}: max_tokens ${r.wire.map((w) => w.max_tokens)}`);
    assert(r.reply.trim().length > 0, `${r.sessionKey}: no visible reply`);
  }
  for (const r of over) {
    if (expect === "bug") {
      // the failure path must actually be triggered, or this control proves nothing
      assert(r.wire.some((w) => w.max_tokens === 1 && w.finish === "length"), `${r.sessionKey}: max_tokens=1/length did not reproduce: ${JSON.stringify(r.wire)}`);
      assert.equal(r.compactions.length, 0, `${r.sessionKey}: unpatched build compacted`);
      continue;
    }
    assert.equal(r.exit, 0, `${r.sessionKey}: openclaw agent failed`);
    assert(r.wire.every((w) => w.max_tokens === null || w.max_tokens >= 4096), `${r.sessionKey}: a request still carried max_tokens ${r.wire.map((w) => w.max_tokens)}`);
    assert(r.compactions.length > 0, `${r.sessionKey}: no compaction happened`);
    assert(r.compactions.every((c) => !c.stub), `${r.sessionKey}: compaction produced the stub summary`);
    const answered = r.assistants.filter((a) => a.afterCompaction && a.promptTokens > 0);
    assert(answered.length > 0, `${r.sessionKey}: no model turn ran after compaction`);
    assert(answered.every((a) => a.promptTokens < cap), `${r.sessionKey}: post-compaction prompt ${answered.map((a) => a.promptTokens)} is not under ${cap}`);
    assert(answered.every((a) => a.stopReason !== "length"), `${r.sessionKey}: still stopped on length`);
    assert(r.reply.trim().length > 0, `${r.sessionKey}: no visible reply`);
  }
} catch (error) {
  if (results.length) console.log(JSON.stringify({ cap, partial: results }, null, 1));
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  client?.stop();
  proxy.close();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
