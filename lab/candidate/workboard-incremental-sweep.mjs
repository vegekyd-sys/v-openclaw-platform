// Candidate test for lab/release-files/workboard-incremental-sweep: the Workboard lifecycle
// sweep must stop holding the Gateway main thread for seconds every minute, and must still
// sync a card whose session changed.
//
// Production V 2026-10-05 21:50-22:10 (Gateway CPU profile): every 64 s the sweep listed every
// session through sessions.list and held the main thread 2.0-2.4 s over ~3 s, plus ~0.9 s of
// card-list reads; inbound messages arriving inside it waited.
//
// Setup: the shared VLab config with no channels and a closed model port (a run fails at its
// first model call), the mirror's makaron session metadata (3,758 sessions; V has 2,562 across
// agents) and the mirror's Workboard database (602 unarchived cards, 296 linked; V has 3,577 /
// 2,833), one Worker. The Gateway main thread is profiled through the inspector for the whole
// observation; each sweep is the burst of samples under the Workboard reconcile or
// sessions.list, and is measured by its CPU and its longest uninterrupted stretch.
// Function check, after the first sweep: run one turn on a group session (it fails at the
// model), create a running card linked to that session, then edit the session's label so it
// changes after the card exists (the store ignores older session updates). No run, so no
// agent-end event: only a sweep that lists the session can move the card off running.
// PATCH=off  every sweep lists every session
// PATCH=on   only the first sweep and the one 10 minutes later list every session; steady
//            partial sweeps take under half the full sweep's CPU and resolve no sharing for the
//            whole store; the late card leaves running within 75 s of creation

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const PATCH = process.env.PATCH ?? "on";
const OBSERVE_MS = Number(process.env.OBSERVE_MS ?? (PATCH === "on" ? 690_000 : 330_000));
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const patched = fs.readFileSync(path.join(dist, "extensions", "workboard", "index.js"), "utf8").includes("WORKBOARD_LIFECYCLE_FULL_SWEEP_MS");
assert.equal(patched, PATCH === "on", `runtime patch marker ${patched} does not match PATCH=${PATCH}`);
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });

// ---- configuration: V's routing, no model, no channels, one Worker ----
const dead = await freePort();
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  deepseek.baseUrl = `http://127.0.0.1:${dead}/v1`;
  const model = { primary: MODEL, fallbacks: [] };
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent; }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  config.session = { ...(config.session ?? {}), maintenance: { mode: runtimeId === "openclaw" ? "warn" : "enforce", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "32gb" } };
  return config;
}
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.cron = { ...(config.cron ?? {}), enabled: false };
assert.notEqual(config.plugins?.entries?.workboard?.enabled, false, "Workboard is disabled in the shared config");
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured; production runs turns in Workers");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 1, warmSpareWorkers: 0 });
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

// ---- private makaron database: every session's metadata, no transcripts ----
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
  const sessions = dst.prepare("SELECT count(*) n FROM session_nodes").get().n;
  const group = dst.prepare(`SELECT session_key FROM session_nodes WHERE entry_valid = 1 AND session_key LIKE 'agent:makaron:feishu:group:%' ORDER BY updated_at DESC LIMIT 1`).get()?.session_key;
  src.close(); dst.close();
  return { sessions, group };
}

// ---- private Workboard database: a consistent copy of the mirror's ----
const workboardRel = path.join("plugins", "workboard", "workboard.sqlite");
function copyWorkboard() {
  const dst = path.join(stateDir, workboardRel);
  assert(!fs.existsSync(dst), `private Workboard database already exists at ${dst}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const src = new DatabaseSync(path.join(sharedState, workboardRel), { readOnly: true });
  src.exec(`VACUUM INTO '${dst.replaceAll("'", "''")}'`);
  src.close();
  return cardCounts();
}
function workboardDb() { return new DatabaseSync(path.join(stateDir, workboardRel), { readOnly: true }); }
function cardCounts() {
  const db = workboardDb();
  try { return db.prepare("SELECT count(*) cards, sum(archived_at IS NULL) unarchived, sum(archived_at IS NULL AND (session_key IS NOT NULL OR run_id IS NOT NULL OR execution_id IS NOT NULL OR status = 'running')) linked FROM workboard_cards").get(); } finally { db.close(); }
}
function cardStatus(id) {
  const db = workboardDb();
  try { return db.prepare("SELECT status FROM workboard_cards WHERE id = ?").get(id)?.status ?? null; } finally { db.close(); }
}
function sessionNode(key) {
  const db = new DatabaseSync(dstPath, { readOnly: true });
  try { return db.prepare("SELECT status, updated_at FROM session_nodes WHERE session_key = ?").get(key) ?? null; } finally { db.close(); }
}

// ---- private Gateway, its main thread profiled through the inspector ----
const inspectPort = await freePort();
// The inspector is opened at launch, as the shared VLab and V run their Gateway; SIGUSR1 is
// the Gateway's in-process restart signal, not a way to open it. No respawn, so the profiled
// process is the one serving the port (checked below).
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_NO_RESPAWN: "1" };
const lines = [];
let gateway, client;
function startGateway() {
  gateway = spawn(process.execPath, [`--inspect=127.0.0.1:${inspectPort}`, "--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
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
  client?.stop();
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 60 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await sleep(1_000);
}
// the launcher may re-exec the Gateway: profile the process that holds the listening socket
function listenerPid(rootPid) {
  const inodes = new Set();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    for (const row of fs.readFileSync(file, "utf8").trim().split("\n").slice(1)) {
      const f = row.trim().split(/\s+/u);
      if (f[3] === "0A" && parseInt(f[1].split(":").pop(), 16) === port) inodes.add(f[9]);
    }
  }
  const descendants = (pid) => {
    const kids = fs.readdirSync(`/proc/${pid}/task`).flatMap((t) => { try { return fs.readFileSync(`/proc/${pid}/task/${t}/children`, "utf8").trim().split(/\s+/u).filter(Boolean).map(Number); } catch { return []; } });
    return [pid, ...kids.flatMap(descendants)];
  };
  for (const pid of descendants(rootPid)) {
    let fds = []; try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { continue; }
    if (fds.some((fd) => { try { return inodes.has(/^socket:\[(\d+)\]$/u.exec(fs.readlinkSync(`/proc/${pid}/fd/${fd}`))?.[1]); } catch { return false; } })) return pid;
  }
  throw new Error(`no process under ${rootPid} listens on ${port}`);
}
async function startProfiler(rootPid) {
  const pid = listenerPid(rootPid);
  assert.equal(pid, rootPid, "the Gateway serving the port is not the launched process");
  const list = await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
  await new Promise((r) => (ws.onopen = r));
  await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 1000 });
  const startedWall = Date.now(); await send("Profiler.start");
  return { pid, startedWall, stop: async () => { const { profile } = await send("Profiler.stop"); ws.close(); return profile; } };
}

// Sweeps in the profile: bursts of samples under the Workboard reconcile or sessions.list
// (nothing else lists sessions here: no channels, no Control UI). Per sweep: CPU, and the
// longest stretch with no idle sample (what an inbound message would wait behind).
const SWEEP = /^(reconcile|listVisibleSessions|syncWorkboardLifecycleSessions|readWorkboardLifecycleSessions)$/u;
function sweepsFromProfile(profile, startedWall) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n])); const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const memo = new Map();
  const inSweep = (id) => { if (memo.has(id)) return memo.get(id); const v = SWEEP.test(byId.get(id).callFrame.functionName) || (parent.has(id) && inSweep(parent.get(id))); memo.set(id, v); return v; };
  // where a sweep's CPU goes, by the innermost recognised frame
  const PARTS = [["sharing", /^resolveSessionSharingTarget$/u], ["sessionRows", /^(listSessionsFromStoreAsync|buildGatewaySessionRow|prepareSessionList)$/u], ["sessionStoreLoad", /^loadCombinedSessionStoreForGatewayCore$/u], ["sessionsList", /^listVisibleSessions$/u], ["sync", /^(syncWorkboardLifecycleSessions|syncLifecycle|failPreparedLaunch)$/u], ["cardList", /^(loadCardChildRows|readCard|readMetadata|entries|list)$/u, /(sqlite-store|runtime-api)-[A-Za-z0-9_-]+\.js$/u], ["gc", /^\(garbage collector\)$/u]];
  const partMemo = new Map();
  const partOf = (id) => {
    if (partMemo.has(id)) return partMemo.get(id);
    let v = "other";
    for (let c = id; c !== undefined; c = parent.get(c)) { const frame = byId.get(c).callFrame; const hit = PARTS.find(([, rx, url]) => rx.test(frame.functionName) && (!url || url.test(frame.url))); if (hit) { v = hit[0]; break; } }
    partMemo.set(id, v); return v;
  };
  const sweeps = []; let cur = null, stretch = 0;
  let t = profile.startTime;
  profile.samples.forEach((sid, i) => {
    t += profile.timeDeltas[i];
    const wall = startedWall + (t - profile.startTime) / 1000; const dt = (profile.timeDeltas[i + 1] ?? 1000) / 1000;
    const idle = byId.get(sid).callFrame.functionName === "(idle)";
    stretch = idle ? 0 : stretch + dt;
    if (cur && wall - cur.end < 5_000) cur.longestBusyMs = Math.max(cur.longestBusyMs, stretch);
    if (!inSweep(sid)) return;
    if (!cur || wall - cur.end >= 5_000) { cur = { at: wall, end: wall, cpuMs: 0, longestBusyMs: stretch, parts: {} }; sweeps.push(cur); }
    cur.end = wall; cur.cpuMs += dt;
    const part = partOf(sid);
    cur.parts[part] = (cur.parts[part] ?? 0) + dt;
  });
  return sweeps.filter((s) => s.cpuMs >= 5).map((s) => ({ at: new Date(s.at).toISOString(), offsetS: Math.round((s.at - startedWall) / 1000), cpuMs: Math.round(s.cpuMs), spanMs: Math.round(s.end - s.at), longestBusyMs: Math.round(s.longestBusyMs), parts: Object.fromEntries(Object.entries(s.parts).map(([k, v]) => [k, Math.round(v)]).sort((x, y) => y[1] - x[1])) }));
}

const built = buildPrivateDatabase();
assert(built.group, "mirror has no makaron group session");
const cards = copyWorkboard();
assert(cards.linked > 0, "mirror Workboard has no linked cards; the sweep would never list sessions");
let summary;
try {
  startGateway();
  await connectGateway();
  const prof = await startProfiler(gateway.pid);
  const t0 = Date.now();
  await sleep(25_000); // the first (full) sweep runs at Gateway start
  // function check: a run that ends before its card exists can only be synced by a sweep
  const sessionKey = built.group;
  const before = sessionNode(sessionKey);
  const runId = randomUUID();
  let sendError;
  try { await client.request("chat.send", { agentId: "makaron", sessionKey, message: "（自动化测试 workboard-incremental-sweep）请只回一个字", deliver: false, thinking: "low", timeoutMs: 120000, idempotencyKey: runId }); } catch (error) { sendError = redact(error?.message ?? error).slice(0, 200); }
  let after = sessionNode(sessionKey);
  for (let i = 0; i < 240 && !(after && after.updated_at > (before?.updated_at ?? 0) && after.status && after.status !== "running"); i += 1) { await sleep(500); after = sessionNode(sessionKey); }
  const runEndedAt = Date.now();
  const touchedSinceStart = (() => { const db = new DatabaseSync(dstPath, { readOnly: true }); try { return db.prepare("SELECT count(*) n FROM session_nodes WHERE updated_at >= ?").get(t0 - 120_000).n; } finally { db.close(); } })();
  await sleep(2_000);
  const created = await client.request("workboard.cards.create", { title: "workboard-incremental-sweep candidate", status: "running", agentId: "makaron", sessionKey });
  const cardId = created?.card?.id;
  const cardCreatedAt = Date.now();
  // The store ignores session updates older than the card's own status change, so the session
  // must change after the card exists. A label edit does that without a run, so no agent-end
  // event can sync the card: only a sweep that lists the session can.
  await sleep(1_000);
  await client.request("sessions.patch", { key: sessionKey, label: `wis-${cardCreatedAt}` });
  const touched = sessionNode(sessionKey);
  let cardSyncedAt = null, finalStatus = cardStatus(cardId);
  for (let i = 0; i < 180 && finalStatus === "running"; i += 1) { await sleep(500); finalStatus = cardStatus(cardId); }
  if (finalStatus !== "running") cardSyncedAt = Date.now();
  // observe the remaining sweeps
  const rest = OBSERVE_MS - (Date.now() - t0);
  if (rest > 0) await sleep(rest);
  const profile = await prof.stop();
  const sweeps = sweepsFromProfile(profile, prof.startedWall);
  summary = {
    patch: PATCH, gatewayPid: prof.pid, launcherPid: gateway.pid, sessions: built.sessions, cards, observeS: Math.round(OBSERVE_MS / 1000),
    touchedSinceStart,
    check: { sendError, sessionBefore: before, sessionAfter: after, sessionTouched: touched, runToCardMs: cardCreatedAt - runEndedAt, cardId, finalStatus, cardSyncAfterCreateMs: cardSyncedAt ? cardSyncedAt - cardCreatedAt : null },
    sweeps,
    warnings: lines.filter((l) => /workboard lifecycle (sync|recovery) failed/u.test(l.line)).map((l) => redact(l.line).slice(0, 300)),
  };
  console.log(JSON.stringify(summary, null, 1));
  assert(cardId, "the card was not created");
  assert(after?.status && after.status !== "running", `the run on the linked session did not end: ${JSON.stringify(after)}`);
  assert(touched?.updated_at >= cardCreatedAt, `the label edit did not update the session after the card was created: ${JSON.stringify(touched)}`);
  assert.notEqual(finalStatus, "running", "no sweep moved the late card off running");
  assert.deepEqual(summary.warnings, [], "the lifecycle sweep reported failures");
  // the profiler is attached before the first sweep (at Gateway start), so with the patch the
  // first observed sweep is full and the next full one is the first at least 10 minutes later
  const first = sweeps[0];
  const tenMinutesOn = sweeps.find((s) => s.offsetS - first.offsetS >= 600);
  const full = PATCH === "on" ? [first, tenMinutesOn].filter(Boolean) : sweeps;
  const partial = sweeps.filter((s) => !full.includes(s));
  const median = (v) => { const x = [...v].sort((a, b) => a - b); return x.length ? x[Math.floor((x.length - 1) / 2)] : null; };
  assert(sweeps.length >= Math.floor(OBSERVE_MS / 70_000), `only ${sweeps.length} sweeps seen in ${OBSERVE_MS / 1000} s`);
  if (PATCH === "on") {
    assert(partial.length >= 3, `expected partial sweeps: ${JSON.stringify(sweeps)}`);
    // the sweep right after start also sees the sessions the start itself touched
    const steady = partial.slice(1);
    assert(median(steady.map((s) => s.cpuMs)) < first.cpuMs / 2, `partial sweeps cost median ${median(steady.map((s) => s.cpuMs))} ms CPU against ${first.cpuMs} ms for the full one`);
    assert(steady.every((s) => !s.parts.sharing || s.parts.sharing < 100), `a partial sweep still resolved sharing for many sessions: ${JSON.stringify(steady)}`);
    assert(cardSyncedAt - cardCreatedAt < 75_000, `the late card took ${cardSyncedAt - cardCreatedAt} ms to sync`);
  }
  const cpu = (list) => list.map((s) => s.cpuMs).join("/");
  console.log(`PASS patch=${PATCH} sweeps=${sweeps.length} full cpu ${cpu(full)} ms, partial ${cpu(partial)} ms, longest busy full ${full.map((s) => s.longestBusyMs).join("/")} ms partial median ${median(partial.map((s) => s.longestBusyMs))} ms; late card ${finalStatus} after ${summary.check.cardSyncAfterCreateMs} ms`);
} finally {
  await stopGateway();
}
