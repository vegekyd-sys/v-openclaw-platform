// A/B for session-info-subagent-index inside real private Gateways (2026-10-19 02:20 V stall).
//
// On V, chat.history for agent:makaron:main held the Gateway main thread 10-95 s (7 opens from the
// iOS app, 2026-10-14..19). V's subagent registry has 4,569 runs and 4,345 of them were requested by
// agent:makaron:main (Night Shift workboard subagents); VLab has 108. A single session row built
// without a prepared read index looked up every child run through the global registry functions,
// each of which re-read the whole snapshot (reloaded once 500 ms old) and rebuilt the index.
//
// This starts the candidate runtime's Gateway twice on the same private data: the shared VLab
// configuration (channels and cron off), an online backup of the whole shared makaron database with
// V's agent:makaron:main session spliced in (MAIN_FIXTURE), and a backup of the shared state
// database whose subagent_runs table is replaced by V's rows (SUBAGENT_FIXTURE). Both fixtures are
// gzipped JSON support inputs from outside the repository (real content), found by basename.
// Arm "base" runs V's chunk, arm "patched" the release file. For each arm: the Control UI's open of
// agent:makaron:main (all requests at once) OPENS times under an inspector CPU profile, then
// sessions.describe for COMPARE_KEYS sessions; rows and the chat.history sessionInfo are compared
// field by field across arms.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import zlib from "node:zlib";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = fs.realpathSync(process.env.OPENCLAW_STATE_DIR);
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA;
assert(runtime && configPath && stateDir && sharedState && data, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const CHUNK = "session-utils-list-BUP03AzS.js";
const V_CHUNK_SHA = "353e0f211194c77e233f071c4080e107bda00b5f14fbb991c1ff102834628e79";
const RELEASE_FILE = path.resolve("lab/release-files/session-info-subagent-index", CHUNK);
const ARMS = (process.env.ARMS ?? "base,patched").split(",");
const OPENS = Number(process.env.OPENS ?? 2);
const COMPARE_KEYS = Number(process.env.COMPARE_KEYS ?? 40);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 30_000);
const MAIN = "agent:makaron:main";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const findInput = (name) => {
  for (const stack = ["."]; stack.length; ) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) return p;
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) stack.push(p);
    }
  }
};
const readFixture = (name) => {
  const file = findInput(name);
  assert(file, `${name} support input is missing`);
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
};
const value = (v) => (v && typeof v === "object" && "$b64" in v ? Buffer.from(v.$b64, "base64") : v);

// ---- configuration: shared VLab, without inbound channels, cron, or extra workers ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins?.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(sharedState, rel), "utf8").replaceAll(sharedState, stateDir).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {};
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, JSON.stringify(workerConfig, null, 2), { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && token, "candidate Gateway port/token missing");

// ---- private databases: whole makaron database + state database, both from online backups ----
const makaronRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const makaronDb = path.join(stateDir, makaronRel);
const stateDb = path.join(stateDir, "state", "openclaw.sqlite");
const chunkPath = path.join(DIST, CHUNK);
const originalChunk = fs.readFileSync(chunkPath);
assert.equal(sha(originalChunk), V_CHUNK_SHA, "candidate runtime chunk is not V's bytes");
let gateway;
const cleanup = () => {
  try { gateway?.kill("SIGKILL"); } catch {}
  fs.writeFileSync(chunkPath, originalChunk);
  for (const file of [makaronDb, stateDb]) for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
};
process.on("exit", cleanup);
for (const [rel, file] of [[makaronRel, makaronDb], [path.join("state", "openclaw.sqlite"), stateDb]]) {
  if (fs.existsSync(file)) for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  const t0 = Date.now();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execFileSync("sqlite3", [path.join(sharedState, rel), `.backup '${file}'`], { stdio: "inherit" });
  console.log(JSON.stringify({ backup: rel, ms: Date.now() - t0, bytes: fs.statSync(file).size }));
}
{
  const fixture = readFixture(process.env.MAIN_FIXTURE ?? "v-main.json.gz");
  const db = new DatabaseSync(makaronDb);
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
  const names = Object.keys(fixture.tables);
  for (const name of [...names].reverse()) {
    const { key } = fixture.tables[name];
    db.prepare(`DELETE FROM "${name}" WHERE ${key} = ?`).run(key === "session_key" ? fixture.sessionKey : fixture.sessionId);
  }
  for (const name of names) {
    const { columns, rows } = fixture.tables[name];
    const insert = db.prepare(`INSERT INTO "${name}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
    for (const row of rows) insert.run(...row.map(value));
  }
  // The insert trigger resets session_nodes.entry_valid to 0 (pending); keep V's validated state, or
  // the canonical-key scan rejects the store and every read rescans it.
  const markMainValid = db.prepare("UPDATE session_nodes SET entry_valid = ? WHERE session_key = ?");
  for (const row of fixture.tables.session_nodes?.rows ?? []) {
    const { columns } = fixture.tables.session_nodes;
    markMainValid.run(row[columns.indexOf("entry_valid")], row[columns.indexOf("session_key")]);
  }
  // The runs' child sessions (CHILD_FIXTURE: V's session_nodes rows for them, without the skills
  // snapshot and prompt report). Without them every restored run is an orphan: the Gateway start
  // would scan the whole store once per run and then prune the runs.
  const children = readFixture(process.env.CHILD_FIXTURE ?? "v-subagent-children.json.gz");
  const insertChild = db.prepare(`INSERT OR REPLACE INTO session_nodes (${children.columns.map((c) => `"${c}"`).join(",")}) VALUES (${children.columns.map(() => "?").join(",")})`);
  const markValid = db.prepare("UPDATE session_nodes SET entry_valid = ? WHERE session_key = ?");
  const keyAt = children.columns.indexOf("session_key"), validAt = children.columns.indexOf("entry_valid");
  for (const row of children.rows) {
    insertChild.run(...row.map(value));
    markValid.run(row[validAt], row[keyAt]);
  }
  db.exec("COMMIT");
  const pendingRows = db.prepare("SELECT count(*) AS n FROM session_nodes WHERE entry_valid <> 1 AND NOT (entry_json = '{}' AND entry_valid = -1)").get().n;
  db.close();
  console.log(JSON.stringify({ childSessions: children.rows.length, pendingRows }));
}
{
  const fixture = readFixture(process.env.SUBAGENT_FIXTURE ?? "v-subagent-runs.json.gz");
  const db = new DatabaseSync(stateDb);
  db.exec("BEGIN IMMEDIATE");
  const removed = Number(db.prepare("DELETE FROM subagent_runs").run().changes);
  const insert = db.prepare(`INSERT INTO subagent_runs (${fixture.columns.map((c) => `"${c}"`).join(",")}) VALUES (${fixture.columns.map(() => "?").join(",")})`);
  for (const row of fixture.rows) insert.run(...row.map(value));
  db.exec("COMMIT");
  const counts = db.prepare("SELECT count(*) AS runs, sum(requester_session_key = ? OR controller_session_key = ?) AS main, sum(length(payload_json)) AS bytes FROM subagent_runs").get(MAIN, MAIN);
  db.close();
  console.log(JSON.stringify({ subagentRuns: { removed, ...counts } }));
}

// ---- one Gateway per arm ----
function summarize(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const label = (node) => `${node.callFrame.functionName || "(anon)"} ${path.basename(node.callFrame.url || "")}:${node.callFrame.lineNumber + 1}`;
  const self = new Map(), total = new Map();
  let busy = 0, longest = 0, registryLoadUs = 0, registryLoads = 0, inLoad = false;
  profile.samples.forEach((id, i) => {
    const us = profile.timeDeltas[i] ?? 0;
    const node = byId.get(id);
    const idle = node.callFrame.functionName === "(idle)";
    busy = idle ? 0 : busy + us;
    longest = Math.max(longest, busy);
    let loading = false;
    if (!idle) {
      self.set(label(node), (self.get(label(node)) ?? 0) + us);
      const seen = new Set();
      for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
        const n = byId.get(cur);
        if (n.callFrame.functionName === "loadSubagentRegistryFromSqlite") loading = true;
        const l = label(n);
        if (!seen.has(l)) { seen.add(l); total.set(l, (total.get(l) ?? 0) + us); }
      }
    }
    if (loading) registryLoadUs += us;
    if (loading && !inLoad) registryLoads += 1;
    inLoad = loading;
  });
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, us]) => `${Math.round(us / 1000)}ms ${name}`);
  return { longestBusyMs: Math.round(longest / 1000), registryLoadMs: Math.round(registryLoadUs / 1000), registryLoadStretches: registryLoads, self: top(self, 12), total: top(total, 30).filter((l) => !/\(root\)|\(program\)|processTicksAndRejections|runMicrotasks/u.test(l)) };
}

async function runArm(arm, inspectPort) {
  fs.writeFileSync(chunkPath, arm === "patched" ? fs.readFileSync(RELEASE_FILE) : originalChunk);
  const chunkSha = sha(fs.readFileSync(chunkPath));
  const lines = [];
  const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: fs.mkdtempSync("/tmp/.sia-"), XDG_CACHE_HOME: path.join(data, "cache"), npm_config_cache: path.join(data, "cache", "npm"),
    ...(process.env.INTEGRITY === "1" ? { OPENCLAW_DB91_INTEGRITY_ENABLE: "1", OPENCLAW_DB91_INTEGRITY_STATE_ROOT: stateDir } : {}) };
  gateway = spawn(process.execPath, ["--experimental-async-context-frame", `--inspect=127.0.0.1:${inspectPort}`, "--max-old-space-size=12288", `${DIST}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [gateway.stdout, gateway.stderr]) {
    stream.setEncoding("utf8");
    let rest = "";
    stream.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u);
      rest = parts.pop();
      for (const line of parts.filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 100_000) lines.splice(0, lines.length - 100_000);
    });
  }
  const { GatewayClient } = await import(`${DIST}/plugin-sdk/gateway-runtime.js?arm=${arm}`);
  let client;
  const t0 = Date.now();
  for (let deadline = Date.now() + 1_800_000; ; ) {
    assert(gateway.exitCode === null, `Gateway exited ${gateway.exitCode}\n${lines.slice(-40).map((l) => l.line).join("\n")}`);
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); }, onConnectError: (error) => { clearTimeout(timeout); reject(error); } });
        client.start();
      });
      break;
    } catch (error) { client?.stop(); assert(Date.now() < deadline, `Gateway not ready: ${error?.message}`); await sleep(1_000); }
  }
  const readyMs = Date.now() - t0;
  await sleep(SETTLE_MS);
  const registry = (() => {
    const db = new DatabaseSync(stateDb, { readOnly: true });
    try { return db.prepare("SELECT count(*) AS runs, sum(requester_session_key = ? OR controller_session_key = ?) AS main FROM subagent_runs").get(MAIN, MAIN); } finally { db.close(); }
  })();
  const pruned = lines.filter((l) => /Subagent orphan run pruned/u.test(l.line)).length;

  const target = (await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json())[0];
  const inspector = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { inspector.onopen = resolve; inspector.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  inspector.onmessage = (event) => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); inspector.send(JSON.stringify({ id, method, params })); });
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 1000 });
  const timed = async (method, params) => {
    const started = Date.now();
    try {
      const result = await client.request(method, params, { timeoutMs: 600_000 });
      return { method, ms: Date.now() - started, ok: true, result };
    } catch (error) {
      return { method, ms: Date.now() - started, ok: false, error: String(error?.message ?? error).slice(0, 200) };
    }
  };
  const opens = [];
  let sessionInfo;
  for (let i = 0; i < OPENS; i++) {
    const at = Date.now();
    await send("Profiler.start");
    const all = await Promise.all([
      timed("chat.history", { sessionKey: MAIN, limit: 1000 }), timed("sessions.branches.list", { sessionKey: MAIN }),
      timed("skills.status", {}), timed("sessions.list", { agentId: "makaron", limit: 100, includeLastMessage: true }), timed("question.list", {}),
      timed("chat.metadata", { sessionKey: MAIN }), timed("config.get", {}), timed("sessions.messages.subscribe", { key: MAIN }),
      timed("tools.effective", { sessionKey: MAIN }), timed("config.get", {}), timed("users.prefs.get", {}),
    ]);
    const { profile } = (await send("Profiler.stop")).result;
    if (all[0].ok) sessionInfo ??= all[0].result.sessionInfo;
    const warnings = lines.filter((l) => l.at >= at && /liveness heartbeat delayed|memory pressure|slow SQLite/u.test(l.line)).map((l) => l.line.slice(-180));
    opens.push({ history: { ms: all[0].ms, ok: all[0].ok, error: all[0].error }, others: all.slice(1).map((r) => `${r.method} ${r.ms}${r.ok ? "" : " FAIL"}`), warnings, profile: summarize(profile) });
    await sleep(2_000);
  }
  // Rows for many sessions: main, the sessions the subagent runs point at, and the newest sessions.
  const list = await timed("sessions.list", { agentId: "makaron", limit: COMPARE_KEYS, includeLastMessage: false });
  const keys = [...new Set([MAIN, ...(JSON.parse(process.env.EXTRA_KEYS ?? "[]")), ...((list.result?.sessions ?? []).map((s) => s.key))])];
  const rows = {};
  let describeMs = 0;
  for (const key of keys) {
    const r = await timed("sessions.describe", { key });
    describeMs += r.ms;
    rows[key] = r.ok ? r.result.session : { error: r.error };
  }
  inspector.close();
  client.stop();
  gateway.kill("SIGTERM");
  await new Promise((resolve) => { if (gateway.exitCode !== null) resolve(); else gateway.once("exit", resolve); setTimeout(resolve, 30_000); });
  gateway = undefined;
  return { arm, chunkSha, readyMs, registry, pruned, opens, sessionInfo, rows, describe: { keys: keys.length, totalMs: describeMs } };
}

const results = [];
for (const [index, arm] of ARMS.entries()) results.push(await runArm(arm, 9300 + ((process.pid + index) % 500)));
for (const r of results) console.log(JSON.stringify({ arm: r.arm, chunkSha: r.chunkSha, readyMs: r.readyMs, registry: r.registry, pruned: r.pruned, opens: r.opens, describe: r.describe }, null, 1));

// ---- equivalence: every row and the chat.history sessionInfo, field by field ----
if (results.length === 2) {
  const [a, b] = results;
  const diffs = (x, y, prefix) => {
    const out = [];
    for (const k of new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])) if (JSON.stringify(x?.[k]) !== JSON.stringify(y?.[k])) out.push(`${prefix}.${k}`);
    return out;
  };
  const rowDiffs = Object.keys(a.rows).flatMap((key) => diffs(a.rows[key], b.rows[key], key));
  const infoDiffs = diffs(a.sessionInfo, b.sessionInfo, "sessionInfo");
  const mainRow = a.rows[MAIN];
  console.log(JSON.stringify({ equivalence: { rows: Object.keys(a.rows).length, rowDiffs, infoDiffs, mainChildSessions: mainRow?.childSessions?.length ?? 0, mainHasActiveSubagentRun: mainRow?.hasActiveSubagentRun } }, null, 1));
}
