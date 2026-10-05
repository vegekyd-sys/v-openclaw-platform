// Candidate test for lab/release-files/placement-evidence-absence: the 60 s worker placement
// sweep must not decode every session entry on the Gateway main thread, and must retire
// exactly the placements it retired before.
//
// Production V 2026-10-05 (first-token-regression-20261005): the sweep reads identity
// evidence for every worker_session_placements row and decodes each session's entry_json.
// V has 2394 placements (one per session that ever ran a local turn), the shared VLab mirror
// 3170 for makaron; a shared VLab profile showed a 3.16 s main-thread stretch inside
// createWorkerPlacementSessionEvidenceResolver, once a minute.
//
// Setup: the shared VLab config with turns on vlab-worker, channels and cron off, the codex
// plugin off, DeepSeek pointed at a closed local port (no turns are sent). makaron's session
// metadata is copied from the mirror and so are its 3170 placement rows. Three placements
// are planted:
//   ghost    a session key and id that do not exist                  -> must be retired
//   reset    an existing key with an old session id (the key moved on) -> must be retired
//   live     an existing key with its current session id              -> must stay
// Probes in this run's private runtime copy:
//   [pe-sweep] each evidence resolution: wall ms, placements, absent count; while EQUIV
//              sweeps remain (PATCH=on), the full decode is also run on the same placements
//              and every placement's absent/present answer is compared.
//   [pe-lag]   the Gateway's own event-loop lag: max per 10 s window (50 ms timer drift).
//   [pe-list]  every full placement list: query and mapping time, and the caller.
// PATCH=off  the unpatched runtime: the sweep cost as a baseline
// PATCH=on   the patched runtime: the same absent set as the full decode on every checked
//            placement, ghost and reset retired, live kept, and a periodic sweep under 20% of
//            the full decode it replaces.

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
assert(["on", "off"].includes(PATCH), `bad PATCH ${PATCH}`);
const SWEEPS = Number(process.env.SWEEPS ?? 6);
const EQUIV_SWEEPS = PATCH === "on" ? Number(process.env.EQUIV_SWEEPS ?? 2) : 0;
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const placementFile = path.join(dist, "server-worker-placement-startup-BvPREvpr.js");
const accessorFile = path.join(dist, "session-accessor-K0XuW6ln.js");
const patched = fs.readFileSync(accessorFile, "utf8").includes("function readSessionIdentityAbsenceRows(");
assert.equal(patched, PATCH === "on", `runtime patch marker ${patched} does not match PATCH=${PATCH}`);

// ---- probes in this run's private runtime copy ----
{
  let src = fs.readFileSync(placementFile, "utf8");
  const head = "async function createWorkerPlacementSessionEvidenceResolver(placements) {";
  assert.equal(src.split(head).length - 1, 1, "resolver anchor not found exactly once");
  const call = PATCH === "on" ? "})), { absenceOnly: true }) : [];" : "}))) : [];";
  assert.equal(src.split(call).length - 1, 1, "evidence call anchor not found exactly once");
  src = src.replace(call, "})), __peAbsenceOnly ? { absenceOnly: true } : void 0) : [];");
  src = src.replace(head, `let __peSweeps = 0, __peLagStarted = false;
function __peStartLag() {
	if (__peLagStarted) return;
	__peLagStarted = true;
	let last = performance.now(), max = 0, windowStart = Date.now();
	setInterval(() => {
		const now = performance.now();
		max = Math.max(max, now - last - 50);
		last = now;
		if (Date.now() - windowStart >= 10000) {
			console.error("[pe-lag] " + JSON.stringify({ at: Date.now(), maxMs: Math.round(max) }));
			max = 0;
			windowStart = Date.now();
		}
	}, 50).unref?.();
}
async function createWorkerPlacementSessionEvidenceResolver(placements) {
	__peStartLag();
	__peSweeps += 1;
	const absenceOnly = ${PATCH === "on" ? "true" : "false"};
	const startedAt = Date.now(), t0 = performance.now();
	const resolve = await __peResolveEvidence(placements, absenceOnly);
	const ms = performance.now() - t0;
	const answers = [];
	for (const placement of placements) answers.push(await resolve(placement) === "absent");
	const record = { sweep: __peSweeps, at: startedAt, ms: Math.round(ms), placements: placements.length, absent: answers.filter(Boolean).length };
	if (__peSweeps <= ${EQUIV_SWEEPS}) {
		const t1 = performance.now();
		const full = await __peResolveEvidence(placements, false);
		record.fullMs = Math.round(performance.now() - t1);
		let same = 0;
		const differ = [];
		for (const [index, placement] of placements.entries()) {
			if ((await full(placement) === "absent") === answers[index]) same += 1;
			else if (differ.length < 5) differ.push({ sessionId: placement.sessionId, sessionKey: placement.sessionKey, absenceOnly: answers[index] });
		}
		record.same = same;
		record.differ = differ;
	}
	console.error("[pe-sweep] " + JSON.stringify(record));
	return resolve;
}
async function __peResolveEvidence(placements, __peAbsenceOnly) {`);
  fs.writeFileSync(placementFile, src);
}

{
  // every full placement list: how long it takes and who asked (both modes)
  const file = path.join(dist, "placement-store-CkyLHi6x.js");
  let src = fs.readFileSync(file, "utf8");
  const anchor = "\t\tlist() {\n\t\t\tconst db = read();\n\t\t\treturn executeSqliteQuerySync(db, query(db).selectFrom(\"worker_session_placements\").selectAll().orderBy(\"session_id\")).rows.map((row) => withWorkspaceResultConflict(fromRow$1(row)));\n\t\t}";
  assert.equal(src.split(anchor).length - 1, 1, "placement list anchor not found exactly once");
  src = src.replace(anchor, "\t\tlist() {\n\t\t\tconst __t0 = performance.now();\n\t\t\tconst db = read();\n\t\t\tconst __rows = executeSqliteQuerySync(db, query(db).selectFrom(\"worker_session_placements\").selectAll().orderBy(\"session_id\")).rows;\n\t\t\tconst __t1 = performance.now();\n\t\t\tconst __out = __rows.map((row) => withWorkspaceResultConflict(fromRow$1(row)));\n\t\t\tconsole.error(\"[pe-list] \" + JSON.stringify({ at: Date.now(), queryMs: Math.round(__t1 - __t0), mapMs: Math.round(performance.now() - __t1), rows: __rows.length, caller: String(new Error().stack).split(\"\\n\").slice(2, 5).map((x) => x.trim().replace(/^at /u, \"\").replace(/\\(file:[^)]*\\/dist\\//u, \"(\")).join(\" < \") }));\n\t\t\treturn __out;\n\t\t}");
  fs.writeFileSync(file, src);
}

// ---- configuration: V's routing, no model, no channels ----
const dead = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
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
  return config;
}
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
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
    // session metadata in full; transcripts are not needed; everything else (database
    // identity, ownership, schema bookkeeping) is copied whole, as the DB91 gate requires
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
  const size = dst.prepare("SELECT count(*) n, sum(length(entry_json)) b FROM session_nodes").get();
  const live = dst.prepare("SELECT session_key, current_session_id FROM session_nodes WHERE entry_valid = 1 AND session_key LIKE 'agent:makaron:%' ORDER BY updated_at DESC LIMIT 2").all();
  src.close(); dst.close();
  return { sessions: size.n, entryMb: Math.round(size.b / 1048576), live };
}

// ---- placements: the mirror's makaron rows plus the planted three ----
const sharedStateDb = path.join(sharedState, "state", "openclaw.sqlite");
const privateStateDb = path.join(stateDir, "state", "openclaw.sqlite");
function copyPlacements(live) {
  const src = new DatabaseSync(sharedStateDb, { readOnly: true });
  const dst = new DatabaseSync(privateStateDb);
  const cols = dst.prepare("PRAGMA table_info(worker_session_placements)").all().map((c) => c.name);
  assert(cols.length > 0, "the candidate Gateway did not create worker_session_placements");
  const list = cols.map((c) => `"${c}"`).join(",");
  const ins = dst.prepare(`INSERT OR IGNORE INTO worker_session_placements (${list}) VALUES (${cols.map(() => "?").join(",")})`);
  dst.exec("BEGIN");
  let copied = 0;
  for (const r of src.prepare(`SELECT ${list} FROM worker_session_placements WHERE agent_id = 'makaron' AND state = 'local' AND turn_claim_owner IS NULL`).iterate()) { ins.run(...cols.map((c) => r[c])); copied += 1; }
  const now = Date.now();
  const plant = (sessionId, sessionKey) => {
    dst.prepare("DELETE FROM worker_session_placements WHERE session_id = ?").run(sessionId);
    dst.prepare("INSERT INTO worker_session_placements (session_id, agent_id, session_key, state, transition_generation, created_at_ms, updated_at_ms, state_changed_at_ms) VALUES (?, 'makaron', ?, 'local', 0, ?, ?, ?)").run(sessionId, sessionKey, now, now, now);
    return { sessionId, sessionKey };
  };
  const planted = {
    ghost: plant(randomUUID(), `agent:makaron:pe-ghost-${now}`),
    reset: plant(randomUUID(), live[0].session_key),
    live: plant(live[1].current_session_id, live[1].session_key),
  };
  dst.exec("COMMIT");
  const total = dst.prepare("SELECT count(*) n FROM worker_session_placements").get().n;
  src.close(); dst.close();
  return { copied, total, planted };
}
function placementState(sessionId) {
  const db = new DatabaseSync(privateStateDb, { readOnly: true });
  try { return db.prepare("SELECT state, terminal_reason FROM worker_session_placements WHERE session_id = ?").get(sessionId) ?? null; } finally { db.close(); }
}

// ---- private Gateway ----
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) };
const lines = [];
let gateway, client;
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
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
const probes = (tag) => lines.filter((l) => l.line.includes(tag)).map((l) => { try { return JSON.parse(l.line.slice(l.line.indexOf("{"))); } catch { return null; } }).filter(Boolean);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };

const built = buildPrivateDatabase();
assert(built.live.length === 2, "the mirror has fewer than two live makaron sessions");
try {
  // first start creates the state schema; placements are written while the Gateway is down
  startGateway();
  await connectGateway();
  await stopGateway();
  const seeded = copyPlacements(built.live);
  assert(seeded.copied >= 1000, `only ${seeded.copied} placements copied from the mirror; not V-sized`);
  lines.length = 0;
  startGateway();
  await connectGateway();
  const deadline = Date.now() + (SWEEPS + 3) * 60_000;
  while (Date.now() < deadline && probes("[pe-sweep]").length < SWEEPS) await sleep(2_000);
  await sleep(12_000); // one more lag window after the last sweep
  const sweeps = probes("[pe-sweep]");
  const lag = probes("[pe-lag]");
  // lag windows that contain a periodic sweep (not the startup one) vs the rest
  const periodic = sweeps.filter((s) => s.sweep > Math.max(1, EQUIV_SWEEPS));
  const inSweep = (w) => periodic.some((s) => s.at <= w.at && s.at > w.at - 10_000);
  const lagIn = lag.filter(inSweep).map((w) => w.maxMs);
  const lagOut = lag.filter((w) => !inSweep(w) && w.at > (periodic[0]?.at ?? Infinity) - 10_000).map((w) => w.maxMs);
  const outcome = Object.fromEntries(Object.entries(seeded.planted).map(([k, p]) => [k, placementState(p.sessionId)]));
  const checked = sweeps.filter((s) => s.same !== undefined);
  const summary = {
    patch: PATCH, sessions: built.sessions, entryMb: built.entryMb, placements: seeded.total,
    sweeps: sweeps.map((s) => ({ sweep: s.sweep, ms: s.ms, fullMs: s.fullMs, placements: s.placements, absent: s.absent, same: s.same, differ: s.differ?.length ? s.differ : undefined })),
    periodicSweepMs: { p50: pct(periodic.map((s) => s.ms), 0.5), max: periodic.length ? Math.max(...periodic.map((s) => s.ms)) : null },
    eventLoopLagMs: { sweepWindows: { n: lagIn.length, max: lagIn.length ? Math.max(...lagIn) : null, each: lagIn }, otherWindows: { n: lagOut.length, p50: pct(lagOut, 0.5), max: lagOut.length ? Math.max(...lagOut) : null } },
    planted: outcome,
    lists: (() => { const l = probes("[pe-list]"); const by = {}; for (const x of l) { const k = x.caller.split(" < ")[0]; (by[k] ??= { n: 0, queryMs: 0, mapMs: 0 }); by[k].n += 1; by[k].queryMs += x.queryMs; by[k].mapMs += x.mapMs; } return { n: l.length, maxMs: l.length ? Math.max(...l.map((x) => x.queryMs + x.mapMs)) : 0, byCaller: by }; })(),
  };
  console.log(JSON.stringify(summary, null, 1));

  assert(sweeps.length >= SWEEPS, `only ${sweeps.length} placement sweeps observed`);
  assert(sweeps.every((s) => s.placements >= seeded.copied), "a sweep saw fewer placements than were seeded");
  assert.equal(outcome.ghost, null, "the ghost placement (no such session) was not retired");
  assert.equal(outcome.reset, null, "the reset placement (key moved to another session) was not retired");
  assert.equal(outcome.live?.state, "local", "the live placement was retired");
  if (PATCH === "on") {
    assert(checked.length >= 1, "no sweep was compared with the full decode");
    for (const s of checked) assert.equal(s.same, s.placements, `sweep ${s.sweep}: ${s.placements - s.same} placements answered differently from the full decode: ${JSON.stringify(s.differ)}`);
    // the startup sweep also loads the evidence modules; compare a periodic one
    const steady = checked.at(-1);
    assert(steady.sweep > 1, "only the startup sweep was compared with the full decode");
    assert(steady.ms * 5 < steady.fullMs, `absence-only sweep ${steady.ms} ms is not under 20% of the full decode ${steady.fullMs} ms`);
  }
  console.log(`PASS patch=${PATCH} placements=${seeded.total} sweep p50=${summary.periodicSweepMs.p50}ms max=${summary.periodicSweepMs.max}ms lag-in-sweep max=${summary.eventLoopLagMs.sweepWindows.max}ms${PATCH === "on" ? ` equiv=${checked.map((s) => `${s.same}/${s.placements}`).join(",")} full=${checked.map((s) => s.fullMs).join("/")}ms` : ""}`);
} finally {
  await stopGateway();
}
