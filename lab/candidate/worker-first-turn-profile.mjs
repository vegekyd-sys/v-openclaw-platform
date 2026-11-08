// Candidate for lab/patch-subagent-restore-narrow.mjs: a fresh Worker's first turn on V spends ~18-19 s
// between prompt-prep and its first model call (2026-11-07), growing with Night Shift since 10/06.
// restoreSubagentRunsOnce -> reconcileOrphanedRestoredRuns reads every child session entry in full;
// on V all 15,495 Night Shift children exist with ~80 KB of entry JSON each.
//
// Derived from lab/candidate/worker-first-turn-ack.mjs (branch claude/worker-stream-ack-first-turn):
// same private Gateway, loopback DeepSeek stand-in and synthetic V-sized task/subagent registries,
// with one difference that matters: subagent_runs.child_session_key points at the cloned Night Shift
// session rows, as on V. In the earlier candidate the children were random keys with no row, so restore
// pruned them cheaply and VLab never showed V's stall.
//
// ARM=base    core dist as on V
// ARM=narrow  + lab/release-files/subagent-restore-narrow (two core files)
// Per round: vlab.workers.roll -> MIN fresh Workers; turn A (fresh Worker), turn B (the other fresh
// Worker), turn C (A's session again: warm control). Measures worker-agent-enter -> first model
// request at the stand-in, Gateway start (spawn -> hello) with the registry seeded, and restore
// outcome (rows kept, orphan prunes) so both arms prove the same registry.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadProfiles, summarizeWindow } from "./cpuprofile-window.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const ARM = process.env.ARM ?? "base";
const V_CHILDREN = 15_495; // V 2026-11-07: distinct Night Shift children of subagent_runs, all present
const SEED = process.env.SEED ?? "v";
// SESSIONS=v: grow the private agent database to V's session table (V 2026-11-06: 16,769 session_nodes,
// 14,875 of them Night Shift subagent sessions, entry_json 1,255 MB; the VLab mirror has 3,813 / 125 MB)
const SESSIONS = process.env.SESSIONS ?? "v";
const N = Number(process.env.N ?? 3);
const MIN = Number(process.env.MIN_WORKERS ?? 1);
const MAX = Number(process.env.MAX_WORKERS ?? 2);
// VLab candidate units are capped at MemoryHigh 7G (2026-11-08) (page cache of the 1.2 GB private database counts):
// a throttled unit slows the base arm's whole-entry reads more than the patched arm, so stay below it
const GATEWAY_HEAP_MB = Number(process.env.GATEWAY_HEAP_MB ?? 6144);
const SPW = Number(process.env.SESSIONS_PER_WORKER ?? 3);
const ROUNDS = Number(process.env.ROUNDS ?? 4);
const MODEL_DELAY_MS = Number(process.env.MODEL_DELAY_MS ?? 1200);
const TEXT_CHUNKS = Number(process.env.TEXT_CHUNKS ?? 12);
const ACK_TIMEOUT_MS = process.env.ACK_TIMEOUT_MS; // optional override of VLAB_WORKER_STREAM_ACK_TIMEOUT_MS
const PROFILE = process.env.PROFILE === "1";
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);
// a GatewayClient reconnecting to a Gateway that is still starting can surface ECONNREFUSED as an
// uncaught error (base run 11/07); keep waiting instead of dying
process.on("uncaughtException", (error) => { if (error?.code === "ECONNREFUSED") { log("ignored", error.code); return; } throw error; });
const dist = path.join(runtime, "openclaw", "dist");
const workerSource = fs.readFileSync(path.join(runtime, "production-worker", "worker.mjs"), "utf8");
const narrowBytes = fs.readFileSync(path.join(dist, "subagent-completion-admission.store-JmpNDYTF.js"), "utf8").includes("subagent-restore-narrow-v1");
assert.equal(narrowBytes, ARM === "narrow", `runtime dist does not match ARM=${ARM}`);
// worker-first-turn-profile: ARM names the runtime under test; PROFILE=1 writes every Worker's CPU profile
assert(!workerSource.includes("const workerLoopStall = "), "worker.mjs is not V's");

// ---- loopback DeepSeek: reasoning, one tool call, then a streamed answer ----
const calls = []; // {at, tag, call, tool}
const TOOL_PREFERENCE = ["session_status", "sessions_list", "agents_list"];
const ccChunk = (model, delta, finish, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
const flatten = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => typeof b === "string" ? b : b?.text ?? "").join("") : "";
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const at = Date.now();
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
    if (!/\/chat\/completions\b/u.test(req.url ?? "")) { res.writeHead(404); return res.end(); }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const users = messages.filter((m) => m.role === "user").map((m) => flatten(m.content));
    let tag;
    for (let i = users.length - 1; i >= 0 && !tag; i--) tag = /\[fta (\d+)-(\d+)\]/u.exec(users[i])?.slice(1, 3).join("-");
    const toolDone = messages.some((m) => m.role === "tool");
    const names = (body.tools ?? []).map((t) => t?.function?.name).filter(Boolean);
    const tool = TOOL_PREFERENCE.find((n) => names.includes(n));
    const call = { at, tag: tag ?? null, call: toolDone ? 2 : 1, tool: !toolDone ? tool ?? null : null, tools: names.length };
    calls.push(call);
    const model = body.model;
    const usage = { prompt_tokens: 1000, completion_tokens: 40, total_tokens: 1040 };
    res.writeHead(200, { "content-type": "text/event-stream" });
    await sleep(MODEL_DELAY_MS);
    res.write(ccChunk(model, { role: "assistant", reasoning_content: "先看一下会话状态，再回答。" }, null));
    if (!toolDone && tool && tag) {
      await sleep(200);
      res.write(ccChunk(model, { tool_calls: [{ index: 0, id: `call_fta_${tag}`, type: "function", function: { name: tool, arguments: "{}" } }] }, null));
      res.end(ccChunk(model, {}, "tool_calls", usage) + "data: [DONE]\n\n");
      return;
    }
    for (let i = 0; i < TEXT_CHUNKS; i++) { res.write(ccChunk(model, { content: `第${i + 1}段，` }, null)); await sleep(150); }
    res.end(ccChunk(model, { content: `FTA-DONE ${tag ?? "x"}` }, null) + ccChunk(model, {}, "stop", usage) + "data: [DONE]\n\n");
  });
});
const baseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(baseConfig.gateway?.port);
const token = baseConfig.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0 && token, "candidate Gateway port/token missing");
for (;;) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  if (Math.abs(server.address().port - port) > 200) break;
  await new Promise((resolve) => server.close(resolve));
}
const standin = `http://127.0.0.1:${server.address().port}/v1`;

// ---- configuration: V's routing, the stand-in model, no channels ----
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  Object.assign(deepseek, { baseUrl: standin, apiKey: "sk-standin-loopback" });
  const model = { primary: MODEL, fallbacks: [] };
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent; }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  // V 2026-11-06: Gateway and Worker both warn-only (16.7k session rows stay)
  config.session = { ...(config.session ?? {}), maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  return config;
}
const config = asProduction(structuredClone(baseConfig), "vlab-worker");
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured");
// V: minWorkers 5, maxWorkers 24, sessionsPerWorker 3, idle 180 s, stall 120 s
Object.assign(workerPlugin, { minWorkers: MIN, maxWorkers: MAX, sessionsPerWorker: SPW, idleTimeoutMs: 600_000, requestStallTimeoutMs: 120_000 });
delete workerPlugin.warmSpareWorkers;
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- private makaron database: session metadata, no transcripts ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });
const META = ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members"];
function buildPrivateDatabase() {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec); dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    if (!META.includes(t.name) && (cols.includes("session_id") || cols.includes("session_key") || cols.includes("conversation_id"))) continue;
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}"`).iterate()) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  // fresh sessions: mirrored ones may carry a per-session model on another harness (codex is off here)
  const keys = Array.from({ length: N * (ROUNDS + 1) }, (_, i) => `agent:makaron:explicit:srn-${randomUUID().slice(0, 8)}-${i}`);
  const childKeys = [];
  if (SESSIONS === "v" || /^\d+$/u.test(SESSIONS)) {
    const template = dst.prepare(`SELECT * FROM session_nodes WHERE entry_valid = 1 AND session_key LIKE 'agent:makaron:subagent:%' ORDER BY length(entry_json) DESC LIMIT 1`).get();
    assert(template, "mirror has no subagent session to clone");
    const cols = Object.keys(template);
    const ins = dst.prepare(`INSERT INTO session_nodes (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
    const now = Date.now();
    // SESSIONS=<n>: add n Night Shift sessions instead of growing to V's 14,875
    const target = SESSIONS === "v" ? V_CHILDREN - dst.prepare("SELECT count(*) n FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%'").get().n : Number(SESSIONS);
    // pad each clone to V's average Night Shift entry (77 KB) inside a field the runtime keeps opaque
    let entry = JSON.parse(template.entry_json);
    const pad = Math.max(0, 77 * 1024 - template.entry_json.length);
    if (pad > 0) entry = { ...entry, systemPromptReport: { ...(entry.systemPromptReport ?? {}), vSizedPadding: "补".repeat(Math.floor(pad / 3)) } };
    const entryJson = JSON.stringify(entry);
    // every clone gets its own identity: on V no two Night Shift children share a label, lifecycle
    // revision or writer run id, and shared values made the private Gateway rescan entries in a loop
    const ids = [template.current_session_id, template.session_key, entry.lifecycleRevision, entry.activeWriterRunId, entry.lastRunId].filter((v) => typeof v === "string" && v.length >= 8);
    const labelJson = typeof entry.label === "string" ? `"label":${JSON.stringify(entry.label)}` : null;
    dst.exec("BEGIN");
    for (let i = 0; i < target; i++) {
      const key = `agent:makaron:subagent:workboard-nightshift-${randomUUID()}`;
      childKeys.push(key);
      const sid = randomUUID();
      const label = `nightshift-${randomUUID().slice(0, 8)}`;
      let json1 = entryJson;
      for (const id of ids) json1 = json1.replaceAll(id, id === template.current_session_id ? sid : id === template.session_key ? key : randomUUID());
      if (labelJson) json1 = json1.replaceAll(labelJson, `"label":${JSON.stringify(label)}`);
      // parseSqliteSessionEntryRecord rejects a row whose updated_at differs from entry.updatedAt
      const updatedAt = now - Math.floor(Math.random() * 7 * 86_400_000);
      if (typeof entry.updatedAt === "number") json1 = json1.replace(`"updatedAt":${entry.updatedAt}`, `"updatedAt":${updatedAt}`);
      const row = { ...template, session_key: key, current_session_id: sid, ...("label" in template ? { label } : {}),
        entry_json: json1,
        updated_at: typeof entry.updatedAt === "number" ? updatedAt : template.updated_at, created_at: now - Math.floor(Math.random() * 7 * 86_400_000) };
      ins.run(...cols.map((c) => row[c]));
    }
    dst.exec("COMMIT");
  }
  const sizes = dst.prepare("SELECT count(*) n, round(sum(length(entry_json)) / 1048576.0) mb FROM session_nodes").get();
  const sessions = `${sizes.n} rows / ${sizes.mb} MB`;
  src.close(); dst.close();
  return { sessions, keys, childKeys };
}

// ---- V-sized registries in the private state database (synthetic rows) ----
const privateStateDb = path.join(stateDir, "state", "openclaw.sqlite");
function subagentRowCount() {
  const db = new DatabaseSync(privateStateDb, { readOnly: true });
  try { return db.prepare("SELECT count(*) n FROM subagent_runs").get().n; } finally { db.close(); }
}
function seedRegistries(childKeys) {
  assert(childKeys.length > 0, "no cloned children to point subagent_runs at");
  const db = new DatabaseSync(privateStateDb);
  const pool = "的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处理府研";
  let blob = "";
  while (blob.length < 200_000) blob += pool[Math.floor(Math.random() * pool.length)] + (Math.random() < 0.08 ? "，" : "");
  const text = (n) => { const at = Math.floor(Math.random() * (blob.length - n - 1)); return blob.slice(at, at + n); };
  const around = (mean) => Math.max(1, Math.round(mean * (0.6 + Math.random() * 0.8)));
  const id8 = () => randomUUID().slice(0, 8);
  const now = Date.now();
  const insertAll = (table, rows) => {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
    const ins = db.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
    db.exec("BEGIN");
    for (const row of rows()) ins.run(...cols.map((c) => row[c] ?? null));
    db.exec("COMMIT");
  };
  const groups = Array.from({ length: 58 }, (_, i) => `agent:makaron:feishu:group:oc_${randomUUID().replaceAll("-", "").slice(0, 24)}${i}`);
  const subagentRows = function* () {
    for (let i = 0; i < 16_663; i++) { // V 2026-11-07: 16,663 rows
      const created = now - Math.floor(Math.random() * 14 * 86_400_000) - 3_600_000;
      const runId = `workboard:${randomUUID()}:${created}`;
      const child = childKeys[i % childKeys.length]; // every row's child exists, as on V
      const requester = i < 15_896 ? "agent:makaron:main" : groups[i % groups.length];
      const reply = text(around(810));
      const payload = {
        accumulatedRuntimeMs: 0, browserCleanupDispatchedAt: created + 205_000, childSessionKey: child, cleanup: "keep",
        cleanupCompletedAt: created + 205_100, cleanupHandled: true,
        completion: { capturedAt: created + 204_700, required: false, resultText: reply, terminalReply: { disposition: "visible", text: reply } },
        controllerSessionKey: requester, createdAt: created, delivery: { status: "not_required" }, endedHookEmittedAt: created + 205_000,
        endedReason: "subagent-complete",
        execution: { endedAt: created + 204_700, lifecycleGeneration: randomUUID(), outcome: { elapsedMs: 204_600, endedAt: created + 204_700, startedAt: created + 100, status: "ok" }, startedAt: created + 100, status: "terminal" },
        expectsCompletionMessage: false, generation: 1, label: `nightshift-${id8()}`, requesterAgentId: "makaron",
        requesterDisplayKey: requester === "agent:makaron:main" ? "main" : requester.slice(-20), requesterSessionKey: requester,
        runId, runTimeoutSeconds: 0, sessionStartedAt: created, spawnMode: "run", swarmLaunchPending: false,
        task: text(around(8_868)), taskRunId: runId,
      };
      yield { run_id: runId, child_session_key: child, controller_session_key: requester, requester_session_key: requester, created_at: created, payload_json: JSON.stringify(payload) };
    }
  };
  // V: cli/exec 10459, cron/automation_run 7921, subagent 4562; 4160 distinct owners
  const kinds = [["cli", "exec", "succeeded", 9728], ["cron", "automation_run", "succeeded", 7832], ["subagent", null, "succeeded", 4445], ["cli", "exec", "failed", 371], ["cli", "exec", "cancelled", 263], ["cli", null, "succeeded", 245], ["cli", "exec", "timed_out", 97], ["subagent", null, "failed", 90], ["cron", "automation_run", "failed", 76], ["subagent", null, "cancelled", 14], ["cron", "automation_run", "timed_out", 13], ["subagent", null, "timed_out", 13]];
  const owners = Array.from({ length: 4_150 }, () => `agent:makaron:subagent:workboard-nightshift-${randomUUID()}`);
  const taskIds = [];
  const taskRows = function* () {
    let k = 0;
    for (const [rt, kind, status, count] of kinds) for (let i = 0; i < count; i++, k++) {
      const created = now - Math.floor(Math.random() * 14 * 86_400_000) - 3_600_000;
      const taskId = randomUUID();
      taskIds.push(taskId);
      const cron = rt === "cron", sub = rt === "subagent";
      const owner = cron ? "" : sub ? "agent:makaron:main" : k % 7 === 0 ? "agent:makaron:main" : owners[k % owners.length];
      const summary = text(around(234));
      const detail = cron
        ? { kind: "cron-run", status: status === "succeeded" ? "ok" : "error", completionStatus: status, error: null, summary, storeKey: `cron:${id8()}${id8()}${id8()}${id8()}`, diagnostics: { summary, entries: [{ ts: created + 7000, source: "exec", severity: "info", message: text(around(104)), exitCode: 0, truncated: false }] }, deliveryStatus: "not-requested", delivery: { intended: { channel: "last", source: "explicit" } }, runAtMs: created, durationMs: 7232, nextRunAtMs: created + 300_000 }
        : sub ? { kind: "task_backing_instance", runtime: "subagent", generation: 1 } : { exitCode: status === "succeeded" ? 0 : 1 };
      yield {
        task_id: taskId, runtime: rt, task_kind: kind, source_id: cron ? `cron:${randomUUID()}` : `${rt}:${randomUUID()}`.slice(0, 29),
        requester_session_key: owner, owner_key: owner, scope_kind: cron ? "system" : "session",
        child_session_key: sub ? `agent:makaron:subagent:workboard-nightshift-${randomUUID()}`.slice(0, 81) : null,
        agent_id: "makaron", requester_agent_id: cron ? null : "makaron",
        run_id: cron ? `cron:${randomUUID()}:${created}:${randomUUID().slice(0, 30)}` : sub ? `workboard:${randomUUID()}:${created}` : `exec:${id8()}-${id8()}`.slice(0, 21),
        label: `label-${id8()}`, task: sub ? text(around(8_000)) : cron ? text(around(1_200)) : text(around(22)),
        status, delivery_status: "not_applicable", notify_policy: "silent",
        created_at: created, started_at: created + 50, ended_at: created + 60_000, last_event_at: created + 60_000,
        cleanup_after: now + 30 * 86_400_000, tool_use_count: sub ? 12 : null, last_tool_name: sub ? "exec" : null,
        error: status === "succeeded" ? null : text(around(31)), progress_summary: text(around(251)),
        terminal_summary: status === "succeeded" ? text(around(84)) : null, terminal_outcome: null, detail_json: JSON.stringify(detail),
      };
    }
  };
  const before = { tasks: db.prepare("SELECT count(*) n FROM task_runs").get().n, subagents: db.prepare("SELECT count(*) n FROM subagent_runs").get().n };
  // refill to exactly V's size each time (a Gateway persist may rewrite the table between rounds)
  db.exec("BEGIN"); db.exec("DELETE FROM task_delivery_state"); db.exec("DELETE FROM task_runs"); db.exec("DELETE FROM subagent_runs"); db.exec("COMMIT");
  insertAll("subagent_runs", subagentRows);
  insertAll("task_runs", taskRows);
  insertAll("task_delivery_state", function* () { for (const taskId of taskIds.slice(0, 253)) yield { task_id: taskId, requester_origin_json: JSON.stringify({ channel: "feishu" }), last_notified_event_at: null }; });
  const after = {
    tasks: db.prepare("SELECT count(*) n FROM task_runs").get().n,
    subagents: db.prepare("SELECT count(*) n FROM subagent_runs").get().n,
    subagentMb: Math.round(db.prepare("SELECT sum(length(payload_json)) b FROM subagent_runs").get().b / 1048576),
    taskMb: Math.round(db.prepare("SELECT sum(length(task) + length(coalesce(progress_summary,'')) + length(coalesce(terminal_summary,'')) + length(coalesce(detail_json,''))) b FROM task_runs").get().b / 1048576),
  };
  db.close();
  return { before, after };
}

// ---- private Gateway ----
const profDir = path.join(stateDir, "cpu-prof");
// Workers are stopped with SIGTERM, which ends a Node process without writing its --cpu-prof profile.
// For profiling runs only, a Worker exits normally on SIGTERM so the profile is written.
function profPreload() {
  const file = path.join(stateDir, "cpu-prof-preload.mjs");
  // also record one (monotonic microseconds, wall ms) pair per Worker so profile samples map onto the
  // [firsttext-worker-phases] wall-clock marks
  fs.writeFileSync(file, `import fs from "node:fs";\nfs.mkdirSync(${JSON.stringify(profDir)}, { recursive: true }); fs.writeFileSync(${JSON.stringify(profDir)} + "/clock-" + process.pid + ".json", JSON.stringify({ pid: process.pid, timeOrigin: performance.timeOrigin, wallMs: Date.now(), worker: process.argv.some((a) => a.endsWith("production-worker/worker.mjs")) }));\nif (process.argv.some((a) => a.endsWith("production-worker/worker.mjs"))) process.on("SIGTERM", () => process.exit(0));\n`);
  return file;
}
const env = {
  ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1",
  ...(ACK_TIMEOUT_MS ? { VLAB_WORKER_STREAM_ACK_TIMEOUT_MS: ACK_TIMEOUT_MS } : {}),
};
const lines = [];
let gateway, client;
function startGateway() {
  // Workers inherit the Gateway's execArgv (not NODE_OPTIONS: the pool passes an allowlisted environment)
  const profArgs = PROFILE ? [`--import=${profPreload()}`, "--cpu-prof", `--cpu-prof-dir=${profDir}`, "--cpu-prof-interval=1000"] : [];
  gateway = spawn(process.execPath, [`--max-old-space-size=${GATEWAY_HEAP_MB}`, ...profArgs, `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 60_000) lines.splice(0, lines.length - 60_000);
    });
  }
}
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError, restarted = false;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (!restarted && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { restarted = true; startGateway(); continue; }
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
async function stopGateway() {
  if (PROFILE) {
    // let this Gateway's Workers write their profiles before the pool shuts them down
    const mine = fs.readdirSync("/proc").filter((d) => /^\d+$/u.test(d)).filter((d) => {
      try { const c = fs.readFileSync(`/proc/${d}/cmdline`, "utf8"); return c.includes(`${runtime}/production-worker/worker.mjs`) && c.includes("--cpu-prof"); } catch { return false; }
    });
    for (const pid of mine) { try { process.kill(Number(pid), "SIGTERM"); } catch {} }
    for (let i = 0; i < 60 && mine.some((pid) => fs.existsSync(`/proc/${pid}`)); i += 1) await sleep(500);
    log("profiled workers stopped", mine.join(" "));
  }
  client?.stop();
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 90 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await sleep(1_000);
}
// every Worker of this Gateway: logical bytes read (rchar), CPU seconds, turns served
function workerIo() {
  const tck = 100;
  const served = new Map();
  for (const s of json("[worker-loop-stall.1]")) served.set(s.pid, Math.max(served.get(s.pid) ?? 0, s.requestsServed));
  const out = [];
  for (const d of fs.readdirSync("/proc").filter((x) => /^\d+$/u.test(x))) {
    try {
      if (!fs.readFileSync(`/proc/${d}/cmdline`, "utf8").includes(`${runtime}/production-worker/worker.mjs`)) continue;
      const stat = fs.readFileSync(`/proc/${d}/stat`, "utf8").split(") ")[1].split(" ");
      const io = Object.fromEntries(fs.readFileSync(`/proc/${d}/io`, "utf8").trim().split("\n").map((l) => l.split(": ")).map(([k, v]) => [k, Number(v)]));
      out.push({ pid: Number(d), cpuS: Math.round((Number(stat[11]) + Number(stat[12])) / tck), rcharMb: Math.round(io.rchar / 1048576), turns: m0().get(Number(d)) ?? 0 });
    } catch { /* exited */ }
  }
  return out;
}
const m0 = () => { const c = new Map(); for (const v of marks().values()) if (v.pid) c.set(v.pid, (c.get(v.pid) ?? 0) + 1); return c; };
const json = (tag) => lines.filter((l) => l.line.includes(tag)).map((l) => { try { return { ...JSON.parse(l.line.slice(l.line.indexOf("{", l.line.indexOf(tag)))), lineAt: l.at }; } catch { return null; } }).filter(Boolean);
const pct = (v, q) => { const s = v.filter((x) => typeof x === "number").sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
const marks = () => {
  const runs = new Map();
  for (const d of json("[firsttext-worker-phases]")) {
    if (!d.runId) continue;
    const r = runs.get(d.runId) ?? {}; runs.set(d.runId, r);
    if (d.stage && !(d.stage in r)) r[d.stage] = d.atMs;
    if (d.stage === "worker-agent-enter") r.pid = d.pid;
  }
  for (const d of json("[bundle-prep-observer]")) {
    const r = d.runId && runs.get(d.runId);
    if (r && d.kind && !(`bundle-${d.kind}` in r)) r[`bundle-${d.kind}`] = Date.parse(d.at);
  }
  for (const d of json("[prompt-prep-observer.1]")) {
    const r = d.runId && runs.get(d.runId);
    if (r && d.stage && !(`pp-${d.stage}` in r)) r[`pp-${d.stage}`] = d.atMs;
  }
  return runs;
};

// ---- run ----
const built = buildPrivateDatabase();
log("private database", built.sessions, "children", built.childKeys.length);
const restoreLines = () => lines.filter((l) => /Subagent orphan run pruned|failed to restore subagent runs/u.test(l.line)).length;
async function timedStart(label) {
  lines.length = 0;
  const t0 = Date.now();
  startGateway();
  await connectGateway();
  const helloMs = Date.now() - t0;
  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline && json("[worker-runtime-prewarm.3]").length < MIN) await sleep(500);
  const readyMs = Date.now() - t0;
  log(label, "hello", helloMs, "workers ready", readyMs);
  return { helloMs, readyMs };
}
// this candidate's own cgroup: memory.high throttling during a measured turn would slow the base arm's
// whole-entry reads more than the patched arm, so every turn records the high-event delta
const cgroupEvents = (() => {
  try { const rel = fs.readFileSync("/proc/self/cgroup", "utf8").trim().split("\n").find((l) => l.startsWith("0::"))?.slice(3); if (!rel) return null; let dir = `/sys/fs/cgroup${rel}`; while (!fs.existsSync(`${dir}/memory.high`) && dir.includes(".service/")) dir = path.dirname(dir); return `${dir}/memory.events`; } catch { return null; }
})();
const memoryHigh = () => { try { return Number(/^high (\d+)/mu.exec(fs.readFileSync(cgroupEvents, "utf8"))?.[1] ?? NaN); } catch { return NaN; } };
log("cgroup events", cgroupEvents, "high now", memoryHigh(), (() => { try { return fs.readFileSync("/proc/self/cgroup", "utf8").trim(); } catch (e) { return String(e.message); } })());
async function turn(sessionKey, tag) {
  const highBefore = memoryHigh();
  const runId = `workboard:${randomUUID()}:${Date.now()}`;
  const sent = Date.now();
  const r = { tag, runId, sent };
  try {
    await client.request("chat.send", { agentId: "makaron", sessionKey, message: `（自动化测试 worker-first-turn-profile）[fta ${tag}] 回答一句`, deliver: false, thinking: "low", timeoutMs: 600_000, idempotencyKey: runId });
  } catch (error) { r.sendError = redact(error?.message ?? error).slice(0, 200); return r; }
  const until = Date.now() + 900_000;
  while (Date.now() < until) {
    try {
      const w = await client.request("agent.wait", { runId, timeoutMs: 5_000 });
      if (w?.status && w.status !== "timeout") { r.status = w.status; r.error = w.error ? redact(w.error).slice(0, 240) : undefined; r.doneMs = Date.now() - sent; break; }
    } catch (error) { r.waitError = redact(error?.message ?? error).slice(0, 200); await sleep(1_000); }
  }
  await sleep(1_500);
  r.memoryHighDelta = memoryHigh() - highBefore;
  const mine = calls.filter((c) => c.tag === tag);
  const pm = marks().get(runId) ?? {};
  r.workerPid = pm.pid ?? null;
  r.marks = pm;
  r.modelAt = mine.length ? mine[0].at : null;
  r.firstModelMs = mine.length ? mine[0].at - sent : null;
  r.enterToModelMs = pm["worker-agent-enter"] && mine.length ? mine[0].at - pm["worker-agent-enter"] : null;
  try {
    const h = await client.request("chat.history", { sessionKey, limit: 6 });
    r.replyVisible = JSON.stringify(h?.messages ?? h ?? []).includes(`FTA-DONE ${tag}`);
  } catch (error) { r.historyError = redact(error?.message ?? error).slice(0, 160); }
  log("turn", tag, JSON.stringify({ status: r.status, pid: r.workerPid, enterToModelMs: r.enterToModelMs, firstModelMs: r.firstModelMs, replyVisible: r.replyVisible, memoryHighDelta: r.memoryHighDelta, error: r.error, sendError: r.sendError, waitError: r.waitError }));
  if (r.status !== "ok") {
    const tail = lines.slice(-400).map((l) => l.line).filter((l) => /error|Error|fail|warn|denied|refus|timed out|worker/iu.test(l) && !/\[skills\]|ExperimentalWarning/u.test(l)).slice(-25);
    log("gateway tail", redact(tail.join("\n")).slice(0, 6000));
  }
  return r;
}

let summary;
const startedAt = Date.now();
try {
  // The Gateway starts on the mirror's small registry; Workers forked later restore the seeded one on
  // their first turn, which is the V path being measured. (A Gateway start on the V-sized registry is
  // measured last, with its own deadline: on base bytes it did not answer within 15 min on busy VLab.)
  const emptyStart = await timedStart("start on the small registry");
  await sleep(15_000);
  const rounds = [];
  let keyIndex = 0;
  let seeded;
  for (let round = 1; round <= ROUNDS; round++) {
    // seed once; refill only if a persist shrank the tables (rewriting them under a running Gateway
    // closed its connection in round 2 of the 02:41 run)
    if (round === 1 || subagentRowCount() < 16_663) {
      seeded = seedRegistries(built.childKeys);
      log("seeded", round, JSON.stringify(seeded));
    }
    if (gateway.exitCode !== null) throw new Error(`private Gateway exited ${gateway.exitCode} before round ${round}\n${redact(lines.slice(-80).map((l) => l.line).join("\n")).slice(-8000)}`);
    const before = json("[worker-runtime-prewarm.3]").length;
    const roll = await client.request("vlab.workers.roll", { reason: `candidate worker-first-turn-profile round ${round}` }, { timeoutMs: 600_000 });
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline && json("[worker-runtime-prewarm.3]").length < before + MIN) await sleep(500);
    await sleep(10_000); // fresh Workers idle before their first turn, as on V
    const a = built.keys[keyIndex++], b = built.keys[keyIndex++];
    const turns = [];
    turns.push({ kind: "cold", ...(await turn(a, `${round}-0`)) });
    turns.push({ kind: "warm", ...(await turn(b, `${round}-1`)) });
    rounds.push({ round, rolledGeneration: roll?.generation ?? null, turns });
  }
  const prunedAtStart = restoreLines();
  let seededStart = null;
  if (process.env.SEEDED_START !== "0") {
    await stopGateway();
    seedRegistries(built.childKeys);
    lines.length = 0;
    const t0 = Date.now();
    startGateway();
    const deadline = Date.now() + Number(process.env.SEEDED_START_DEADLINE_MS ?? 1_200_000);
    let helloMs = null;
    while (Date.now() < deadline && gateway.exitCode === null) {
      try { await connectGateway(); helloMs = Date.now() - t0; break; } catch { await sleep(2_000); }
    }
    seededStart = { helloMs, deadlineMs: deadline - t0, exited: gateway.exitCode };
    log("seeded start", JSON.stringify(seededStart));
  }
  const all = rounds.flatMap((r) => r.turns);
  const cold = all.filter((t) => t.kind === "cold");
  const coldFirst = []; const seenPid = new Set();
  // a cold sample counts only if it was the first turn its Worker ever ran
  for (const t of all) { if (t.workerPid && !seenPid.has(t.workerPid)) { seenPid.add(t.workerPid); if (t.kind === "cold") coldFirst.push(t); } }
  const warm = all.filter((t) => t.kind === "warm");
  const stat = (v) => ({ n: v.filter((x) => typeof x === "number").length, p50: pct(v, 0.5), max: pct(v, 1), all: v });
  summary = {
    arm: ARM, sessions: built.sessions, children: built.childKeys.length, seeded,
    gatewayStart: { empty: emptyStart, seeded: seededStart }, prunedOrRestoreFailedLines: prunedAtStart, prunedTotalLines: restoreLines(),
    firstTurnEnterToModelMs: stat(coldFirst.map((t) => t.enterToModelMs)),
    warmEnterToModelMs: stat(warm.map((t) => t.enterToModelMs)),
    coldSamplesNotFirstOnWorker: cold.length - coldFirst.length,
    memoryHighDuringTurns: all.map((t) => t.memoryHighDelta), cgroupEvents,
    ok: all.filter((t) => t.status === "ok").length, n: all.length, replyVisible: all.filter((t) => t.replyVisible).length,
    rounds, elapsedS: Math.round((Date.now() - startedAt) / 1000),
  };
} finally {
  await stopGateway();
  server.close();
}
if (PROFILE && summary) {
  await sleep(3_000);
  const profiles = loadProfiles(profDir);
  summary.profiles = { files: profiles.map((p) => ({ file: p.file, pid: p.pid, worker: p.clock?.worker ?? null, clock: Boolean(p.clock) })), windows: [] };
  for (const r of summary.rounds) for (const t of r.turns) {
    if (!t.modelAt) continue;
    for (const p of profiles) {
      const w = summarizeWindow(p, t.sent, t.modelAt);
      if (w && w.busyMs > 150) summary.profiles.windows.push({ tag: t.tag, kind: t.kind, worker: p.clock?.worker ?? null, ...w });
    }
  }
}
console.log(JSON.stringify(summary, null, 1));
console.log(`RESULT arm=${ARM} firstTurn enter->model p50 ${summary.firstTurnEnterToModelMs.p50} ms (n=${summary.firstTurnEnterToModelMs.n}) warm p50 ${summary.warmEnterToModelMs.p50} ms; gateway seeded hello ${summary.gatewayStart.seeded?.helloMs ?? "-"} ms; ok ${summary.ok}/${summary.n} visible ${summary.replyVisible}/${summary.n}; prune lines ${summary.prunedTotalLines}`);
assert.equal(summary.ok, summary.n, "some turns failed");
assert.equal(summary.replyVisible, summary.n, "some replies not visible");
