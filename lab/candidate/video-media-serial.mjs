// Worker CPU profile of cold first turns (r2 + #252 + #254 + gap-marks). Private Gateway, real model,
// WORKERS Workers; NODE_OPTIONS carries --cpu-prof and a preload that turns SIGTERM into exit(0) in
// worker.mjs so each Worker writes its profile when the pool stops it. Cold batch (8 parallel, n=8),
// warm batch (8 parallel, n=16), then a normal Gateway stop. Reports top self/total frames in each
// cold run's worker-command-enter -> model-call-enter window and in workspace-ensured >500 ms windows. (PR #243): the reply path's pre-reply
// memory flush. Production V 2026-10-06 19:40: a large vlab-worker session's first message
// after 3 h idle waited 38.6 s because a 34.9 s housekeeping flush (transcript-size trigger,
// far below compaction) ran in front of it on the session lane.
//
// Private Gateway with V's routing (vlab-worker, 2 Workers) and the real model. Private agent
// database: every session's metadata plus ONE large makaron session copied whole (transcript
// over 2 MiB, known token count far below the flush threshold), with its memory-flush markers
// cleared so this compaction cycle has not flushed yet. Rebuilt from the mirror for every arm.
//   ARM=off        OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH=0; one message; the flush runs first
//   ARM=on         one message; [memory-flush-deferred.1] deferred, fast first text, then ran
//                  after IDLE_MS of idle, memory file written
//   ARM=interrupt  as on, plus a second message 2 s into the deferred flush: yielded, and the
//                  second reply is not held by the flush
// Per message: chat.send -> first chat delta (the first text a client can show). No message
// text is printed: only timings, phases, counts and memory file names/sizes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const ARMS = (process.env.ARMS ?? "off,on,interrupt").split(",");
const IDLE_MS = Number(process.env.IDLE_MS ?? 15000);
const WORKERS = Number(process.env.WORKERS ?? 2);
const MODEL = "deepseek/deepseek-flash";
const MIN_TRANSCRIPT = 2.5 * 1048576;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
// gap marks are optional here: worker-command-enter comes from [firsttext-worker-phases], model-call-enter from [firsttext-metrics]

// ---- configuration: V's routing with the real model, no channels, no cron ----
function asProduction(config, runtimeId) {
  assert(config.models?.providers?.deepseek, "shared VLab config has no deepseek provider");
  const model = { primary: MODEL, fallbacks: [] };
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "low" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent; }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  // FORCE_FLUSH_BYTES lowers the transcript-size flush trigger in this private config only, so a
  // VLab session (compacted, ~0.7 MB active) crosses it the way V's 25 MB session crossed 2 MiB
  if (process.env.FORCE_FLUSH_BYTES) { const c = (config.agents.defaults.compaction ??= {}); c.memoryFlush = { ...(c.memoryFlush ?? {}), forceFlushTranscriptBytes: Number(process.env.FORCE_FLUSH_BYTES) }; }
  config.session = { ...(config.session ?? {}), maintenance: { mode: runtimeId === "openclaw" ? "warn" : "enforce", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "32gb" } };
  return config;
}
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured");
Object.assign(workerPlugin, { minWorkers: WORKERS, maxWorkers: WORKERS, sessionsPerWorker: Number(process.env.SESSIONS_PER_WORKER ?? 1), warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
// ---- fake media CLIs (V's tools.media shape: audio = ASR CLI, video = analysis CLI), timings logged ----
const ASR_S = Number(process.env.ASR_S ?? 10), VIDEO_S = Number(process.env.VIDEO_S ?? 30);
const fakeDir = path.join(stateDir, "fake-media"); fs.mkdirSync(fakeDir, { recursive: true });
const fakeLog = path.join(fakeDir, "calls.log"); fs.writeFileSync(fakeLog, "");
// each analysis carries a marker from its file name (one / three-N), so the transcript shows which reached the model
const mkFake = (name, secs, out) => { const f = path.join(fakeDir, `${name}.sh`); fs.writeFileSync(f, `#!/bin/sh\necho "$(date +%s%3N) start ${name} $1" >> ${fakeLog}\nsleep ${secs}\necho "$(date +%s%3N) end ${name} $1" >> ${fakeLog}\nm=$(basename "$1" | sed -E 's/---.*//; s/\\.mp4$//')\necho "${out} 标记MK-$m"\n`, { mode: 0o755 }); return f; };
config.tools = config.tools ?? {};
config.tools.media = { ...(config.tools.media ?? {}), audio: { ...(config.tools.media?.audio ?? {}), enabled: true, timeoutSeconds: 60 }, video: { ...(config.tools.media?.video ?? {}), enabled: true, timeoutSeconds: 60 },
  models: [
    { type: "cli", command: mkFake("asr", ASR_S, "（测试转写）一段测试音频"), args: ["{{MediaPath}}"], timeoutSeconds: 60, capabilities: ["audio"] },
    { type: "cli", command: mkFake("video", VIDEO_S, "（测试视频分析）画面是彩条测试图"), args: ["{{MediaPath}}", "{{Prompt}}"], timeoutSeconds: 60, capabilities: ["video"] },
  ] };
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const workspace = config.agents.entries?.makaron?.workspace ?? config.agents.defaults.workspace;
const sharedConfig = JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_PATH, "utf8"));
const sharedWorkspace = sharedConfig.agents?.entries?.makaron?.workspace ?? sharedConfig.agents?.defaults?.workspace;
assert(workspace && workspace !== sharedWorkspace, `makaron workspace ${workspace} is not private to this candidate`);
const memoryDir = path.join(workspace, "memory");
const memoryFiles = () => (fs.existsSync(memoryDir) ? fs.readdirSync(memoryDir).filter((f) => f.endsWith(".md")).map((f) => { const s = fs.statSync(path.join(memoryDir, f)); return { f, size: s.size, mtime: s.mtimeMs }; }) : []);


// ---- private agent database: metadata only ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
const META = ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members"];
function buildPrivateDatabase(pick) {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dstPath + suffix, { force: true });
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
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
  const copied = {};
  for (const t of tables) {
    if (virtual.includes(t.name)) continue;
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    let where = "", args = [];
    if (!META.includes(t.name)) {
      // session-scoped tables: only the chosen session's rows (transcript, trajectory, ...)
      if (cols.includes("session_id")) { where = "WHERE session_id = ?"; args = [pick.sessionId]; }
      else if (cols.includes("session_key")) { where = "WHERE session_key = ?"; args = [pick.sessionKey]; }
      else if (cols.includes("conversation_id")) continue;
    }
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    let n = 0;
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}" ${where}`).iterate(...args)) { ins.run(...cols.map((c) => r[c])); n += 1; }
    dst.exec("COMMIT");
    if (where) copied[t.name] = n;
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  // this compaction cycle has not flushed yet: drop the flush markers from the entry
  const row = dst.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(pick.sessionKey);
  const entry = row ? JSON.parse(row.entry_json) : {};
  const cleared = Object.keys(entry).filter((k) => /^memoryFlush/iu.test(k));
  for (const k of cleared) delete entry[k];
  if (row) dst.prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?").run(JSON.stringify(entry), pick.sessionKey);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close(); dst.close();
  return { copied: Object.fromEntries(Object.entries(copied).filter(([, n]) => n > 0)), clearedEntryKeys: cleared };
}
// ---- private Gateway ----
const lines = [];
let gateway, client;
const runs = new Map();
function startGateway(extraEnv) {
  const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1", ...extraEnv };
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port), "--verbose"], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); if (lines.length > 60_000) lines.splice(0, lines.length - 60_000); });
  }
}
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError, restarted = false;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (!restarted && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { restarted = true; startGateway(gateway.extraEnv); continue; }
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
          onEvent: (evt) => {
            if (evt?.event !== "chat") return;
            const p = evt.payload ?? {}; const r = runs.get(p.runId); if (!r) return;
            if (p.state === "delta") { r.deltas = (r.deltas ?? 0) + 1; if (r.firstDeltaAt === undefined) r.firstDeltaAt = Date.now(); }
            if (["final", "error", "aborted"].includes(p.state)) { r.endAt ??= Date.now(); r.endState ??= p.state; }
          },
        });
        client.start();
      });
      return;
    } catch (error) { lastError = error; client?.stop(); await sleep(1_000); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}
async function stopGateway() {
  client?.stop();
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 60 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await sleep(1_000);
}
const probes = (tag) => lines.filter((l) => l.line.includes(tag)).map((l) => { const line = l.line.replace(/\x1b\[[0-9;]*m/gu, "").trim(); try { return { at: l.at, ...JSON.parse(line.slice(line.indexOf("{"))) }; } catch { return null; } }).filter(Boolean);
async function send(pick, kind) {
  const runId = randomUUID();
  const r = { kind, runId, sentAt: Date.now() }; runs.set(runId, r);
  try { await client.request("chat.send", { agentId: "makaron", sessionKey: pick.sessionKey, message: `（自动化测试 ${kind}）请只回一个字`, deliver: false, timeoutMs: 240000, idempotencyKey: runId }); }
  catch (e) { r.error = redact(e?.message ?? e).slice(0, 200); }
  return r;
}
async function settle(r, ms = 240_000) { const until = Date.now() + ms; while (Date.now() < until && !r.error && r.endAt === undefined) await sleep(200); }
const view = (r, t0) => ({ kind: r.kind, deltas: r.deltas ?? 0, firstTextMs: r.firstDeltaAt ? r.firstDeltaAt - r.sentAt : null, endMs: r.endAt ? r.endAt - r.sentAt : null, endState: r.endState ?? null, error: r.error ?? null, sentAtRelMs: r.sentAt - t0 });



const profDir = path.join(stateDir, "wprof");
fs.rmSync(profDir, { recursive: true, force: true }); fs.mkdirSync(profDir, { recursive: true });
const preload = path.resolve("lab/candidate/worker-cpu-prof-preload.mjs");
const NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --import=file://${preload}`.trim();
const allRuns = [];
const marks = () => {
  const out = new Map();
  for (const l of lines) {
    const m = l.line.match(/\[(firsttext-worker-phases|firsttext-metrics|firsttext-gap\.1)\] (\{.*\})/u); if (!m) continue;
    let d; try { d = JSON.parse(m[2]); } catch { continue; }
    if (!d.runId) continue;
    const r = out.get(d.runId) ?? { stages: {}, gaps: [] }; out.set(d.runId, r);
    const at = d.atMs ?? d.at;
    if (m[1] === "firsttext-gap.1") r.gaps.push({ stage: d.stage, at, sincePrevMs: d.sincePrevMs, pid: d.pid });
    else if (d.stage && at && !(d.stage in r.stages)) r.stages[d.stage] = at;
    if (d.stage === "pool-ipc-send" && d.workerPid) r.workerPid = d.workerPid;
  }
  return out;
};
async function batch(label, conc, n) {
  const sessions = Array.from({ length: conc }, (_, i) => ({ sessionKey: `agent:makaron:explicit:wprof-${label}-${Date.now()}-${i}` }));
  let next = 0; const done = [];
  await Promise.all(sessions.map(async (pick) => { while (next < n) { next += 1; const r = await send(pick, `${label}`); r.label = label; await settle(r); done.push(r); await sleep(1000); } }));
  return done;
}
let gwPid; const externalWrites = []; let toolCheck = null;
const videoRuns = [];
const mp4 = path.join(fakeDir, "test.mp4");
await new Promise((resolve, reject) => { const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=12:size=640x360:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-c:v", "libx264", "-c:a", "aac", "-shortest", "-y", mp4]); p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))); });
const b64 = fs.readFileSync(mp4).toString("base64");
async function sendVideo(sessionKey, label) {
  const runId = randomUUID();
  const r = { kind: label, runId, sentAt: Date.now(), sessionKey }; runs.set(runId, r); videoRuns.push(r);
  try { await client.request("chat.send", { agentId: "makaron", sessionKey, message: "（自动化测试 video）这个视频里是什么？一句话回答", attachments: [{ type: "file", mimeType: "video/mp4", fileName: `${label}.mp4`, content: b64 }], deliver: false, timeoutMs: 240000, idempotencyKey: runId }); }
  catch (e) { r.error = redact(e?.message ?? e).slice(0, 200); }
  return r;
}
let caseStarts = {};
try {
  buildPrivateDatabase({ sessionId: "none", sessionKey: "none" });
  lines.length = 0;
  startGateway({}); gwPid = gateway.pid;
  await connectGateway();
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline && probes("[worker-runtime-prewarm.3]").length < WORKERS) await sleep(500);
  await sleep(15_000);
  // case 1: one video in a fresh session
  caseStarts.one = Date.now();
  const one = await sendVideo(`agent:makaron:explicit:video-one-${Date.now()}`, "one");
  await settle(one, 240_000);
  await sleep(5_000);
  // case 3: three videos back to back in one fresh session
  caseStarts.three = Date.now();
  const sk3 = `agent:makaron:explicit:video-three-${Date.now()}`;
  const three = [];
  for (let i = 0; i < 3; i += 1) { three.push(sendVideo(sk3, `three-${i + 1}`)); await sleep(300); }
  const sent3 = await Promise.all(three);
  for (const r of sent3) await settle(r, 300_000);
  for (const r of videoRuns) {
    try {
      const h = await client.request("chat.history", { sessionKey: r.sessionKey, limit: 40 });
      const texts = (role) => (h?.messages ?? []).filter((m) => m.role === role).map((m) => (Array.isArray(m.content) ? m.content.filter((c) => c.type === "text").map((c) => c.text).join("") : String(m.content ?? "")));
      r.histAssistant = texts("assistant");
      // the model's input for this message: same analysis text either way; file names and ids differ per run
      const users = texts("user");
      const mine = users.find((t) => t.includes(`${r.kind}.mp4`) || t.includes(`${r.kind}---`)) ?? users.at(-1) ?? "";
      const normalized = mine.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu, "<id>").replace(/(one|three-\d)(---|\.mp4)/gu, "<msg>$2").replace(/\/[^\s"')\]]+/gu, "<path>");
      r.userInputSha = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
      r.userInputHasAnalysis = mine.includes("（测试视频分析）");
    } catch {}
  }
} finally {
  await stopGateway();
  await sleep(3_000);
}
// ---- report: no message text, timings only ----
const M = marks();
const calls = fs.readFileSync(fakeLog, "utf8").trim().split("\n").filter(Boolean).map((l) => { const [ms, what, name, ...rest] = l.split(" "); return { at: Number(ms), what, name, media: path.basename(rest.join(" ") || "") }; });
const rel = (t, base) => (t ? Math.round(t - base) : null);
const out = {};
for (const [c, base] of Object.entries(caseStarts)) {
  out[c] = {
    messages: videoRuns.filter((r) => (c === "one" ? r.kind === "one" : r.kind.startsWith("three"))).map((r) => { const st = M.get(r.runId)?.stages ?? {}; return { label: r.kind, sentMs: rel(r.sentAt, base), workerCommandEnterMs: rel(st["worker-command-enter"], base), modelCallEnterMs: rel(st["model-call-enter"], base), firstTextMs: rel(r.firstDeltaAt, base), endMs: rel(r.endAt, base), endState: r.endState ?? null, error: r.error ?? null, analysisReachedReply: (r.histAssistant ?? []).some((t) => t.includes("彩条")), userInputHasAnalysis: r.userInputHasAnalysis ?? null, userInputSha: r.userInputSha ?? null }; }),
    cliCalls: calls.filter((x) => x.at >= base && (c === "three" || x.at < (caseStarts.three ?? Infinity))).map((x) => ({ name: x.name, what: x.what, atMs: x.at - base, media: x.media.slice(0, 40) })),
  };
}
const prefetchLog = probes("[media-prefetch.1]").map(({ at, ...p }) => p);
// which analysis markers reached each session's transcript (booleans only)
const markersInTranscript = {};
try {
  const db = new DatabaseSync(dstPath, { readOnly: true });
  for (const r of videoRuns) {
    const node = db.prepare("SELECT current_session_id FROM session_nodes WHERE session_key = ?").get(r.sessionKey);
    if (!node) continue;
    const hit = db.prepare("SELECT count(*) n FROM transcript_events WHERE session_id = ? AND event_json LIKE ?").get(node.current_session_id, `%MK-${r.kind}%`).n;
    markersInTranscript[r.kind] = hit > 0;
  }
  db.close();
} catch (e) { markersInTranscript.error = String(e?.message ?? e).slice(0, 120); }
// diagnostic error lines during the three-video case (no message text in these)
const errorLines = lines.filter((l) => l.at >= (caseStarts.three ?? 0) && /lane task error|failed before reply|Worker Agent request failed|worker request|native attempt|steer|aborted|AbortError|run error|embedded run failed/iu.test(l.line)).slice(0, 25).map((l) => ({ relMs: l.at - (caseStarts.three ?? 0), line: redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).replace(/(oc_|ou_)[A-Za-z0-9]+/gu, "$1…").slice(0, 220) }));
console.log(JSON.stringify({ asrS: ASR_S, videoS: VIDEO_S, workers: WORKERS, prefetch: process.env.OPENCLAW_MEDIA_PREFETCH ?? "default", prefetchLog, errorLines, markersInTranscript, cases: out }, null, 1));
