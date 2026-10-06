// Candidate test for lab/release-files/placement-sweep-lists: the 60 s worker placement sweep
// must stop reading every worker_session_placements row on the Gateway main thread, must
// announce and retire the same placements, and must still retire local orphans on the
// 10-minute full pass.
//
// Shared VLab profile 2026-10-06 (release firsttext-r1-20261006, #193 already in): the minute
// sweep still blocked the main thread 410-730 ms, in placement-store list() (SELECT * and the
// row codec over ~3,900 rows), called once by session retirement, twice per change publication
// (reconcile and auto-suspend), once by the disk-space sweep, and per node by workspace retention.
//
// Setup as lab/candidate/placement-evidence-absence.mjs: the shared VLab config with turns on
// vlab-worker, channels and cron off, the codex plugin off, DeepSeek pointed at a closed local
// port (no turns are sent); makaron's session metadata and placement rows copied from the
// mirror; ghost / reset / live placements planted before start. One more local ghost ("late") is
// planted while the Gateway runs, after its startup pass.
// Probes in this run's private runtime copy:
//   [ps-read]    every placement read the sweep uses: method, rows, ms, caller. While EQUIV
//                reads remain (PATCH=on), each new read is compared with list() on the spot.
//   [ps-retire]  each session-retirement pass: placements checked, evidence ms.
//   [ps-tick]    each minute sweep start.
//   [ps-lag]     the Gateway's own event-loop lag: max per 10 s window (50 ms timer drift).
// PATCH=off  the unpatched runtime: baseline (SWEEPS minute sweeps)
// PATCH=on   the patched runtime: every compared read equal to list(); no list() between full
//            retirement passes; ghost and reset retired at startup, live kept, late retired by
//            the 10-minute full pass and not before; event-loop lag in sweep windows under half
//            of PATCH=off's (compare the two runs' summaries).

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
const SWEEPS = Number(process.env.SWEEPS ?? (PATCH === "on" ? 12 : 6));
const EQUIV = PATCH === "on" ? Number(process.env.EQUIV ?? 40) : 0;
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const placementFile = path.join(dist, "server-worker-placement-startup-BvPREvpr.js");
const storeFile = path.join(dist, "placement-store-CkyLHi6x.js");
const patched = fs.readFileSync(storeFile, "utf8").includes("\t\tlistChangeSnapshot() {\n");
assert.equal(patched, PATCH === "on", `runtime patch marker ${patched} does not match PATCH=${PATCH}`);
assert.equal(fs.readFileSync(placementFile, "utf8").includes("const WORKER_PLACEMENT_FULL_RETIREMENT_INTERVAL_MS = "), patched, "store and startup patch disagree");

// ---- probes in this run's private runtime copy ----
const once = (src, anchor, replacement, label) => {
  assert.equal(src.split(anchor).length - 1, 1, `${label} anchor not found exactly once`);
  return src.replace(anchor, replacement);
};
{
  let src = fs.readFileSync(placementFile, "utf8");
  src = once(src, "\t\tconst resolveSessionEvidence = await deps.createSessionEvidenceResolver(placements);\n",
    "\t\tconst __psT0 = performance.now();\n\t\tconst resolveSessionEvidence = await deps.createSessionEvidenceResolver(placements);\n\t\tconsole.error(\"[ps-retire] \" + JSON.stringify({ at: Date.now(), placements: placements.length, evidenceMs: Math.round(performance.now() - __psT0) }));\n",
    "retirement evidence");
  src = once(src, "\t\tconst sweepActivePlacements = () => {\n", "\t\tconst sweepActivePlacements = () => {\n\t\t\tconsole.error(\"[ps-tick] \" + JSON.stringify({ at: Date.now() }));\n", "minute sweep");
  fs.writeFileSync(placementFile, src);
}
{
  let src = fs.readFileSync(storeFile, "utf8");
  const head = "function createWorkerSessionPlacementStore(options = {}) {\n";
  src = once(src, head, `let __psEquiv = ${EQUIV}, __psLag = false;
function __psCaller() {
	return String(new Error().stack).split("\\n").slice(4, 7).map((x) => x.trim().replace(/^at /u, "").replace(/\\(file:[^)]*\\/dist\\//u, "(")).join(" < ");
}
function __psTimed(method, run, compare) {
	if (!__psLag) {
		__psLag = true;
		let last = performance.now(), max = 0, windowStart = Date.now();
		setInterval(() => {
			const now = performance.now();
			max = Math.max(max, now - last - 50);
			last = now;
			if (Date.now() - windowStart >= 10000) {
				console.error("[ps-lag] " + JSON.stringify({ at: Date.now(), maxMs: Math.round(max) }));
				max = 0;
				windowStart = Date.now();
			}
		}, 50).unref?.();
	}
	const t0 = performance.now();
	const out = run();
	const record = { at: Date.now(), method, rows: out instanceof Map ? out.size : out.length, ms: Math.round((performance.now() - t0) * 10) / 10, caller: __psCaller() };
	if (compare && __psEquiv > 0) {
		__psEquiv -= 1;
		const same = compare(out);
		record.same = same === true;
		if (same !== true) record.differ = same;
	}
	console.error("[ps-read] " + JSON.stringify(record));
	return out;
}
${head}`, "store factory");
  const tail = "\tattachWorkerTurnExecutionIdentityStore(store, path);\n\treturn store;\n";
  src = once(src, tail, `\t{
\t\tconst __json = (value) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? String(v) : v);
\t\tconst __first = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i += 1) if (__json(a[i]) !== __json(b[i])) return { index: i, got: a[i], want: b[i] }; return true; };
\t\tconst raw = { list: store.list, listForReconcile: store.listForReconcile, listChangeSnapshot: store.listChangeSnapshot, listByEnvironmentIds: store.listByEnvironmentIds, getMany: store.getMany };
\t\tstore.list = () => __psTimed("list", () => raw.list());
\t\tstore.listForReconcile = () => __psTimed("listForReconcile", () => raw.listForReconcile());
\t\tif (raw.listChangeSnapshot) store.listChangeSnapshot = () => __psTimed("listChangeSnapshot", () => raw.listChangeSnapshot(), (out) => __first(out, raw.list().map((p) => ({ sessionId: p.sessionId, agentId: p.agentId, sessionKey: p.sessionKey, state: p.state, generation: p.generation, updatedAtMs: p.updatedAtMs }))));
\t\tif (raw.listByEnvironmentIds) store.listByEnvironmentIds = (ids) => __psTimed("listByEnvironmentIds", () => raw.listByEnvironmentIds(ids), (out) => __first(out, raw.list().filter((p) => p.environmentId !== null && ids.includes(p.environmentId))));
\t\tstore.getMany = (ids) => __psTimed("getMany", () => raw.getMany(ids), (out) => { const all = new Map(raw.list().map((p) => [p.sessionId, p])); return __first([...ids].filter((id) => all.has(id.trim())).map((id) => out.get(id.trim())), [...ids].filter((id) => all.has(id.trim())).map((id) => all.get(id.trim()))); });
\t}
${tail}`, "store return");
  fs.writeFileSync(storeFile, src);
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
    ghost: plant(randomUUID(), `agent:makaron:ps-ghost-${now}`),
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

function plantLate() {
  const db = new DatabaseSync(privateStateDb);
  try {
    db.exec("PRAGMA busy_timeout = 10000");
    const now = Date.now();
    const sessionId = randomUUID();
    db.prepare("INSERT INTO worker_session_placements (session_id, agent_id, session_key, state, transition_generation, created_at_ms, updated_at_ms, state_changed_at_ms) VALUES (?, 'makaron', ?, 'local', 0, ?, ?, ?)").run(sessionId, `agent:makaron:ps-late-${now}`, now, now, now);
    return { sessionId, at: now };
  } finally { db.close(); }
}

const built = buildPrivateDatabase();
assert(built.live.length === 2, "the mirror has fewer than two live makaron sessions");
try {
  startGateway();
  await connectGateway();
  await stopGateway();
  const seeded = copyPlacements(built.live);
  assert(seeded.copied >= 1000, `only ${seeded.copied} placements copied from the mirror; not V-sized`);
  lines.length = 0;
  const startedAt = Date.now();
  startGateway();
  await connectGateway();
  while (Date.now() - startedAt < 600_000 && probes("[ps-retire]").length < 1) await sleep(1_000);
  const late = plantLate();
  let lateGoneAt = null;
  const deadline = Date.now() + (SWEEPS + 2) * 60_000;
  while (Date.now() < deadline && probes("[ps-tick]").length < SWEEPS) {
    await sleep(2_000);
    if (lateGoneAt === null && placementState(late.sessionId) === null) lateGoneAt = Date.now();
  }
  await sleep(15_000); // the last sweep finishes and one more lag window closes
  if (lateGoneAt === null && placementState(late.sessionId) === null) lateGoneAt = Date.now();

  const ticks = probes("[ps-tick]");
  const reads = probes("[ps-read]");
  const retires = probes("[ps-retire]");
  const lag = probes("[ps-lag]");
  const inSweep = (w) => ticks.some((t) => t.at <= w.at && t.at > w.at - 10_000);
  const lagIn = lag.filter(inSweep).map((w) => w.maxMs);
  const lagOut = lag.filter((w) => !inSweep(w) && w.at > (ticks[0]?.at ?? Infinity)).map((w) => w.maxMs);
  // reads made by the minute sweeps (from each tick until 20 s later), grouped per minute
  const perMinute = ticks.map((t) => {
    const r = reads.filter((x) => x.at >= t.at && x.at < t.at + 20_000);
    const by = {};
    for (const x of r) { (by[x.method] ??= { n: 0, rows: 0, ms: 0 }); by[x.method].n += 1; by[x.method].rows += x.rows; by[x.method].ms = Math.round((by[x.method].ms + x.ms) * 10) / 10; }
    const retire = retires.find((x) => x.at >= t.at && x.at < t.at + 20_000);
    return { at: t.at, readMs: Math.round(r.reduce((s, x) => s + x.ms, 0)), retirePlacements: retire?.placements, evidenceMs: retire?.evidenceMs, by };
  });
  const compared = reads.filter((x) => x.same !== undefined);
  const outcome = Object.fromEntries(Object.entries(seeded.planted).map(([k, p]) => [k, placementState(p.sessionId)]));
  const fullPasses = retires.filter((x) => x.placements >= seeded.copied);
  const summary = {
    patch: PATCH, sessions: built.sessions, placements: seeded.total,
    perMinute,
    minuteReadMs: { p50: pct(perMinute.map((m) => m.readMs), 0.5), max: perMinute.length ? Math.max(...perMinute.map((m) => m.readMs)) : null },
    eventLoopLagMs: { sweepWindows: { n: lagIn.length, p50: pct(lagIn, 0.5), max: lagIn.length ? Math.max(...lagIn) : null, each: lagIn }, otherWindows: { n: lagOut.length, p50: pct(lagOut, 0.5), max: lagOut.length ? Math.max(...lagOut) : null } },
    retirement: retires.map((x) => ({ minute: Math.round((x.at - startedAt) / 60_000), placements: x.placements, evidenceMs: x.evidenceMs })),
    compared: { n: compared.length, differ: compared.filter((x) => !x.same).slice(0, 3) },
    planted: outcome,
    late: { plantedMinute: Math.round((late.at - startedAt) / 60_000), retiredMinute: lateGoneAt === null ? null : Math.round((lateGoneAt - startedAt) / 60_000) },
  };
  console.log(JSON.stringify(summary, null, 1));

  assert(ticks.length >= SWEEPS, `only ${ticks.length} minute sweeps observed`);
  assert.equal(outcome.ghost, null, "the ghost placement (no such session) was not retired");
  assert.equal(outcome.reset, null, "the reset placement (key moved to another session) was not retired");
  assert.equal(outcome.live?.state, "local", "the live placement was retired");
  assert(lateGoneAt !== null, "the late local ghost was never retired");
  if (PATCH === "on") {
    assert(compared.length >= 3, "too few reads were compared with list()");
    assert.deepEqual(compared.filter((x) => !x.same), [], "a narrow read differed from list()");
    // between full retirement passes the minute sweep never lists every placement
    const partialMinutes = perMinute.filter((m) => m.retirePlacements !== undefined && m.retirePlacements < seeded.copied);
    assert(partialMinutes.length >= SWEEPS - 3, `only ${partialMinutes.length} partial minutes`);
    for (const m of partialMinutes) assert.equal(m.by.list, undefined, `a partial minute still listed every placement: ${JSON.stringify(m)}`);
    assert(fullPasses.length >= 2, "no 10-minute full retirement pass after startup");
    const tenMinutePass = fullPasses[1];
    assert(tenMinutePass.at - fullPasses[0].at >= 590_000, "the second full pass came early");
    assert(lateGoneAt >= tenMinutePass.at - 2_000, "the late ghost was retired before the 10-minute full pass (partial passes must not retire local rows)");
  }
  console.log(`PASS patch=${PATCH} placements=${seeded.total} minute reads p50=${summary.minuteReadMs.p50}ms max=${summary.minuteReadMs.max}ms lag-in-sweep p50=${summary.eventLoopLagMs.sweepWindows.p50}ms max=${summary.eventLoopLagMs.sweepWindows.max}ms late retired at minute ${summary.late.retiredMinute}`);
} finally {
  await stopGateway();
}
