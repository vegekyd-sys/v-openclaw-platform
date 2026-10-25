#!/usr/bin/env node
// sessions-search-candidate-rows A/B on a private Gateway with a copy of V's session tables
// (see lab/sessions-search-candidate-rows.md).
//
// Data (read-only export from V, kept outside the repository; FIXTURE_DIR on the VLab host):
//   <agent>.sqlite  session_nodes / session_windows / session_participants /
//                   session_transcript_index_state / session_progress_cards of every V agent
//   state.sqlite    subagent_runs (the registry that decides a row's spawnedBy)
// Agent databases and the state database are created by OpenClaw under WORK_DIR and filled from the
// export. No transcripts: sessions.search returns no hits, so the comparison is over what the tool
// sends to it (agent and session keys of every chunk, i.e. the visible candidate set) and the tool
// result.
//
// Phase A: Gateway with V's bytes. Phase B: Gateway with the release files. In each phase this
// process runs the sessions_search tool the way a worker does (callAgentToolGatewayRequest without an
// in-process Gateway: one callGateway, i.e. one new connection, per request): V's tool and the release
// tool, for requester sessions of every agent under V's visibility config and the other visibility
// modes. Phase A's release-tool runs exercise the fallback (the old Gateway rejects visibilityRowsOnly).
//
// The first case of each phase makes every call for real (the before/after numbers). After that,
// requests with identical parameters inside one phase and arm are answered from that arm's own earlier
// real responses (the store does not change: cron, channels and Workboard are off); counts of real
// and repeated calls are reported per case. Every request goes to the private Gateway (port from the
// config, checked by the store path it answers with); each request has a 120 s timeout in both arms.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime && process.env.OPENCLAW_CONFIG_PATH, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/ssf-20261025";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const AGENTS = ["dealclaw", "hy-codex", "main", "makaron", "openclaw", "short-v", "v-codex", "xiaoai"];
const REL = "lab/release-files/sessions-search-candidate-rows";
const VBYTES = "release/captured/feishu-conversations-20261024/dist";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: "]+)[^\s",]+/giu, "$1$2[redacted]");
const out = {};
const progressLog = path.join(FIXTURE_DIR, `${path.basename(WORK_DIR)}.progress.log`);
const log = (key, value) => {
  out[key] = value;
  const line = `[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`;
  console.error(line.slice(0, 4000));
  fs.appendFileSync(progressLog, `${line}\n`);
};

// ---- state directory and config ----
const stateDir = path.join(WORK_DIR, "state");
const agentDb = (agentId) => path.join(stateDir, "agents", agentId, "agent", "openclaw-agent.sqlite");
if (process.env.KEEP_WORK !== "1") process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));
for (const agentId of AGENTS) fs.mkdirSync(path.dirname(agentDb(agentId)), { recursive: true });
const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
// V's session settings that matter here: maintenance warn (nothing may prune the fixture), visibility.
config.session = { ...config.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
config.tools = { ...config.tools, sessions: { visibility: "all" }, agentToAgent: { enabled: true, allow: ["makaron", "v-codex", "short-v", "xiaoai"] } };
for (const id of ["workboard", "night-shift", "nightshift"]) if (config.plugins?.entries?.[id]) config.plugins.entries[id].enabled = false;
const workerPlugin = config.plugins?.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
const configPath = path.join(stateDir, "openclaw.json");
const writeConfig = () => fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
writeConfig();
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
process.env.OPENCLAW_STATE_DIR = stateDir;
process.env.OPENCLAW_CONFIG_PATH = configPath;
// callGateway takes the port from the environment before the config; the runner's environment can name
// another Gateway (the first run of this harness reached shared VLab's, read-only). Only the private one.
process.env.OPENCLAW_GATEWAY_PORT = String(port);
for (const name of ["OPENCLAW_GATEWAY_URL", "OPENCLAW_GATEWAY_REMOTE_URL"]) delete process.env[name];
// The runner's TMPDIR / XDG_CACHE_HOME are the shared instance's cache, whose openclaw-<uid> fallback the
// Gateway's read-only SQLite worker refuses; use private ones.
for (const [name, dir] of [["TMPDIR", "tmp"], ["XDG_CACHE_HOME", "cache"]]) {
  fs.mkdirSync(path.join(WORK_DIR, dir), { recursive: true, mode: 0o700 });
  process.env[name] = path.join(WORK_DIR, dir);
}
process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT = stateDir;
process.env.OPENCLAW_HOME = WORK_DIR;

// ---- dist files: V's bytes and the release files ----
const plan = JSON.parse(fs.readFileSync("lab/sessions-search-candidate-rows.plan.json", "utf8"));
const NAMES = plan.files.map((f) => path.basename(f.target));
const vBytes = Object.fromEntries(NAMES.map((name) => [name, fs.readFileSync(path.join(VBYTES, name), "utf8")]));
const relBytes = Object.fromEntries(NAMES.map((name) => [name, fs.readFileSync(path.join(REL, name), "utf8")]));
for (const f of plan.files) {
  const name = path.basename(f.target);
  assert.equal(sha(vBytes[name]), f.before, `V bytes: ${name}`);
  assert.equal(sha(relBytes[name]), f.after, `release bytes: ${name}`);
  assert.equal(sha(fs.readFileSync(path.join(DIST, name), "utf8")), f.before, `candidate runtime is not V's bytes: ${name}`);
}
const TOOLS = "openclaw-tools-BODVdJQD.js";
const copies = [];
const place = (name, source) => {
  const file = path.join(DIST, name);
  fs.writeFileSync(file, source);
  copies.push(file);
  return file;
};
const setDist = (bytes) => { for (const name of NAMES) fs.writeFileSync(path.join(DIST, name), bytes[name]); };
process.on("exit", () => { setDist(vBytes); for (const file of copies) fs.rmSync(file, { force: true }); });
// Tool chunks side by side, each exporting its sessions_search factory (the chunk exports only createOpenClawTools).
const exportFactory = (source) => `${source}\nexport { createSessionsSearchTool as __ssfCreateSessionsSearchTool };\n`;
const toolFactory = {
  v: (await import(place(TOOLS.replace(/\.js$/u, ".SSFV.js"), exportFactory(vBytes[TOOLS])))).__ssfCreateSessionsSearchTool,
  release: (await import(place(TOOLS.replace(/\.js$/u, ".SSFREL.js"), exportFactory(relBytes[TOOLS])))).__ssfCreateSessionsSearchTool,
};
const { y: callAgentToolGatewayRequest } = await import(path.join(DIST, "sessions-helpers-Bn_vDNby.js"));

// ---- fixture ----
{
  const t = performance.now();
  const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
  const { i: openOpenClawStateDatabase } = await import(path.join(DIST, "openclaw-state-db-Bh3Bq87y.js"));
  for (const agentId of AGENTS) openOpenClawAgentDatabase({ agentId });
  closeOpenClawAgentDatabases();
  openOpenClawStateDatabase();
  const copyTables = (file, source, tables) => {
    const db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000;");
    db.exec(`ATTACH '${source}' AS v`);
    const counts = {};
    db.exec("BEGIN");
    for (const table of tables) {
      const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
      const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
      const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
      db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
      counts[table] = db.prepare(`SELECT count(*) AS n FROM main.${table}`).get().n;
    }
    if (tables.includes("session_nodes")) {
      db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
      db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
    }
    db.exec("COMMIT");
    db.exec("DETACH v");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    return counts;
  };
  const counts = {};
  for (const agentId of AGENTS) counts[agentId] = copyTables(agentDb(agentId), path.join(FIXTURE_DIR, `${agentId}.sqlite`), ["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards"]);
  counts.state = copyTables(path.join(stateDir, "state", "openclaw.sqlite"), path.join(FIXTURE_DIR, "state.sqlite"), ["subagent_runs"]);
  log("fixture", { counts, ms: Math.round(performance.now() - t) });
}

// ---- requesters ----
const rows = (agentId) => new DatabaseSync(agentDb(agentId), { readOnly: true }).prepare("SELECT session_key, spawned_by, parent_session_key, archived_at FROM session_nodes WHERE entry_valid = 1 ORDER BY session_key").all();
const makaron = rows("makaron");
const pick = (list, test) => list.find(test)?.session_key;
const spawnCounts = [...Map.groupBy(makaron.filter((r) => r.spawned_by), (r) => r.spawned_by)].map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]);
const requesters = [
  ["makaron:main", "agent:makaron:main"],
  ["makaron:top-spawner", spawnCounts[0]?.[0]],
  ["makaron:group", pick(makaron, (r) => /:group:/u.test(r.session_key) && !r.archived_at)],
  ["makaron:direct", pick(makaron, (r) => /:direct:|:dm:/u.test(r.session_key) && !r.archived_at)],
  ["makaron:subagent", pick(makaron, (r) => r.spawned_by && /:subagent:/u.test(r.session_key) && !r.archived_at)],
  ["makaron:archived", pick(makaron, (r) => r.archived_at)],
  ["makaron:cron-run", "agent:makaron:cron:16fd590d-0000-4000-8000-000000000000:run:ssf-run"],
  ...["v-codex", "xiaoai", "short-v", "dealclaw"].map((agentId) => [`${agentId}:first`, rows(agentId)[0]?.session_key]),
].filter(([, key]) => typeof key === "string");
const withVisibility = (visibility) => ({ ...config, tools: { ...config.tools, sessions: { visibility } } });
const cases = [];
for (const [label, key] of requesters) {
  for (const visibility of ["all", "agent", "tree", "self"]) cases.push({ label: `${label}/${visibility}`, key, cfg: visibility === "all" ? config : withVisibility(visibility) });
}
for (const [label, key] of requesters.filter(([l]) => l === "makaron:main" || l === "makaron:group" || l === "v-codex:first")) cases.push({ label: `${label}/sandboxed`, key, cfg: config, sandboxed: true });
log("requesters", { requesters, spawners: spawnCounts.slice(0, 3), cases: cases.length });

// ---- Gateway ----
const lines = [];
let gateway;
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${DIST}/index.js`, "gateway", "--port", String(port)], {
    env: { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [gateway.stdout, gateway.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); });
  }
}
const disabledPlugins = [];
function disableMissingPlugins() {
  const missing = new Set();
  for (const { line } of lines) for (const m of line.matchAll(/missing configured plugin "([^"]+)"/gu)) missing.add(m[1]);
  const fresh = [...missing].filter((id) => !disabledPlugins.includes(id));
  if (fresh.length === 0) return false;
  for (const id of fresh) { (config.plugins.entries[id] ??= {}).enabled = false; disabledPlugins.push(id); }
  writeConfig();
  return true;
}
async function untilReady() {
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (disableMissingPlugins()) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      const r = await callAgentToolGatewayRequest({ method: "sessions.list", params: { limit: 1, agentId: "makaron" } });
      // the answering Gateway must be this one: its store is the fixture under WORK_DIR
      assert(typeof r?.path === "string" && r.path.startsWith(stateDir), `sessions.list answered from ${r?.path}, not ${stateDir}`);
      assert(r.totalCount > 9000, `makaron active sessions ${r.totalCount}`);
      return;
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      lastError = error;
    }
    await sleep(2_000);
  }
  throw lastError ?? new Error("Gateway did not become ready");
}
async function stopGateway() {
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 60 && gateway.exitCode === null; i++) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await sleep(1_000);
}
process.on("exit", () => { if (gateway?.exitCode === null) gateway.kill("SIGKILL"); });
const rssOf = (pid) => {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    return { rssMB: Math.round(Number(/VmRSS:\s+(\d+)/u.exec(status)[1]) / 1024), hwmMB: Math.round(Number(/VmHWM:\s+(\d+)/u.exec(status)[1]) / 1024) };
  } catch { return null; }
};

// ---- one search through the tool, worker-style ----
const QUERY = process.env.QUERY ?? "复盘";
async function runSearch({ arm, kase, memo, useMemo }) {
  const calls = [];
  const callGateway = async (request) => {
    const params = request.params ?? {};
    const memoKey = JSON.stringify([request.method, params]);
    const t = performance.now();
    let response;
    let repeated = false;
    let error;
    if (useMemo && memo.has(memoKey)) {
      ({ response, error } = memo.get(memoKey));
      repeated = true;
    } else {
      // callGateway's default 10 s timeout; V's pages take up to 11.5 s and VLab's 4 cores are slower.
      // Both arms get the same longer timeout so they complete and can be compared.
      try { response = await callAgentToolGatewayRequest({ ...request, timeoutMs: request.timeoutMs ?? 120_000 }); } catch (e) { error = e; }
      memo.set(memoKey, { response, error });
    }
    calls.push({
      method: request.method,
      params: request.method === "sessions.search" ? { agentId: params.agentId, keys: params.sessionKeys?.length } : params,
      keysHash: request.method === "sessions.search" ? sha(JSON.stringify([params.agentId, params.sessionKeys])) : undefined,
      ms: performance.now() - t,
      repeated,
      rows: Array.isArray(response?.sessions) ? response.sessions.length : undefined,
      bytes: response ? Buffer.byteLength(JSON.stringify(response)) : 0,
      error: error ? String(error?.message ?? error).slice(0, 300) : undefined,
    });
    if (error) throw error;
    return response;
  };
  const tool = toolFactory[arm]({
    agentSessionKey: kase.key,
    agentId: kase.key.split(":")[1],
    config: kase.cfg,
    sandboxed: kase.sandboxed === true,
    callGateway,
  });
  const t = performance.now();
  let result;
  try { result = await tool.execute(`ssf-${arm}`, { query: QUERY, limit: 25 }); } catch (e) { result = { threw: String(e?.message ?? e).slice(0, 500) }; }
  const ms = performance.now() - t;
  const searchSequence = calls.filter((c) => c.method === "sessions.search").map((c) => c.keysHash);
  const searchedKeys = calls.filter((c) => c.method === "sessions.search").reduce((n, c) => n + (c.params.keys ?? 0), 0);
  const list = calls.filter((c) => c.method === "sessions.list");
  return {
    resultHash: sha(JSON.stringify(result?.details ?? result?.content ?? result)),
    result: JSON.stringify(result?.details ?? result).slice(0, 300),
    searchSequenceHash: sha(JSON.stringify(searchSequence)),
    searchCalls: searchSequence.length,
    searchedKeys,
    listCalls: list.length,
    listReal: list.filter((c) => !c.repeated).length,
    listRealMs: Math.round(list.filter((c) => !c.repeated).reduce((s, c) => s + c.ms, 0)),
    listMaxMs: Math.round(Math.max(0, ...list.filter((c) => !c.repeated).map((c) => c.ms))),
    listBytes: list.reduce((s, c) => s + c.bytes, 0),
    listRejected: list.filter((c) => c.error).map((c) => c.error),
    lean: list.filter((c) => c.params.visibilityRowsOnly === true).length,
    ms: Math.round(ms),
    calls,
  };
}
const gatewayListLines = (from, to) => lines.filter((l) => l.at >= from && l.at <= to + 500).map((l) => /res ✓ sessions\.list (\d+)ms/u.exec(l.line)?.[1]).filter(Boolean).map(Number);

// ---- phases ----
const results = { A: {}, B: {} };
async function phase(name, bytes, arms) {
  setDist(bytes);
  lines.length = 0;
  const t0 = performance.now();
  startGateway();
  await untilReady();
  log(`phase ${name} ready`, { ms: Math.round(performance.now() - t0), disabledPlugins, rss: rssOf(gateway.pid) });
  {
    // warm the list projection once (the first read after start parses every row)
    // and wait out the post-start work (handshakes time out while the main thread is busy)
    const t = performance.now();
    let attempts = 0;
    for (let quiet = 0; quiet < 3;) {
      attempts += 1;
      const t1 = performance.now();
      try {
        await callAgentToolGatewayRequest({ method: "sessions.list", params: { limit: 1, archived: "all" }, timeoutMs: 300_000 });
        quiet = performance.now() - t1 < 3_000 ? quiet + 1 : 0;
      } catch (error) {
        quiet = 0;
        assert(performance.now() - t < 900_000, `Gateway not settled: ${error?.message}`);
      }
      await sleep(5_000);
    }
    log(`phase ${name} warm`, { ms: Math.round(performance.now() - t), attempts, rss: rssOf(gateway.pid) });
  }
  const memos = Object.fromEntries(arms.map((arm) => [arm, new Map()]));
  for (const [i, kase] of cases.entries()) {
    for (const arm of arms) {
      const from = Date.now();
      const r = await runSearch({ arm, kase, memo: memos[arm], useMemo: i > 0 });
      const gw = gatewayListLines(from, Date.now());
      const { calls, ...summary } = r;
      summary.gatewayListLines = gw.length;
      summary.gatewayListMs = gw.reduce((s, v) => s + v, 0);
      summary.gatewayListMaxMs = Math.max(0, ...gw);
      if (i === 0) summary.perCall = calls.filter((c) => c.method === "sessions.list").map((c) => ({ archived: c.params.archived, agentId: c.params.agentId ?? null, offset: c.params.offset, rows: c.rows, ms: Math.round(c.ms), bytes: c.bytes, error: c.error }));
      (results[name][kase.label] ??= {})[arm] = summary;
      log(`${name} ${kase.label} ${arm}`, { ...summary, perCall: undefined });
    }
  }
  log(`phase ${name} rss`, rssOf(gateway.pid));
  await stopGateway();
}
try {
  await phase("A", vBytes, ["v", "release"]);
  await phase("B", relBytes, ["v", "release"]);
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  log("error", String(error?.stack ?? error).slice(0, 3000));
  await stopGateway();
  process.exitCode = 1;
}

// ---- comparison ----
const diffs = [];
const fields = ["resultHash", "searchSequenceHash"];
for (const kase of cases) {
  const ref = results.A[kase.label]?.v;
  for (const [ph, arm] of [["A", "release"], ["B", "v"], ["B", "release"]]) {
    const got = results[ph][kase.label]?.[arm];
    if (!ref || !got) { diffs.push({ case: kase.label, ph, arm, missing: true }); continue; }
    for (const f of fields) if (ref[f] !== got[f]) diffs.push({ case: kase.label, ph, arm, field: f, ref: ref.result, got: got.result });
  }
}
const first = cases[0].label;
log("summary", {
  cases: cases.length,
  comparisons: cases.length * 3,
  differences: diffs.length,
  diffs: diffs.slice(0, 20),
  before: results.A[first]?.v && { ...results.A[first].v, perCall: undefined },
  afterOldGatewayFallback: results.A[first]?.release && { ...results.A[first].release, perCall: undefined },
  afterOnOldPathPatchedGateway: results.B[first]?.v && { ...results.B[first].v, perCall: undefined },
  after: results.B[first]?.release && { ...results.B[first].release, perCall: undefined },
  searchedKeysRange: [Math.min(...cases.map((c) => results.A[c.label]?.v?.searchedKeys ?? 0)), Math.max(...cases.map((c) => results.A[c.label]?.v?.searchedKeys ?? 0))],
  releaseListCallsPerSearchB: [...new Set(cases.map((c) => results.B[c.label]?.release?.listCalls))],
  releaseListMsB: cases.map((c) => results.B[c.label]?.release?.listRealMs),
});
fs.writeFileSync(path.join(FIXTURE_DIR, `${path.basename(WORK_DIR)}.results.json`), JSON.stringify({ out, results }, null, 2));
console.log(JSON.stringify({ ok: diffs.length === 0 && !process.exitCode, differences: diffs.length, summary: out.summary }, null, 2));
if (diffs.length) process.exitCode = 1;
