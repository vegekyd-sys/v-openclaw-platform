// Does subagent-tree-read-v1 answer exactly what V's bytes answer, without reading whole tables?
//
// V 2026-11-24 01:12:26.0-01:12:59.7 CST: /vcc in group 十二家 called the subagents tool
// {action: "list", recentMinutes: 180}; the Gateway's main thread stopped for 33.7 s and RSS rose 5.2 -> 10.3 GB.
//
// Data (outside the repository, FIXTURE on the VLab host): V's subagent_runs table, read-only `.dump` streamed
// from V on 2026-11-24 02:52 CST (27,776 runs). It replaces the private state database's subagent_runs rows.
// The makaron session store is the V-scale fixture (v-scale-session-fixture.mjs), so the token-usage lookups
// of the list read a V-sized session table in arm A.
//
// Arms: A = V's dist bytes, B = lab/release-files/subagent-tree-read. Each measurement is a fresh process.
//   timing:  the tool's list path for the 十二家 session (resolveSubagentController -> listControlledSubagentRuns
//            -> buildSubagentList), cold then warm, with the in-memory registry empty and restored (a Gateway
//            restores every persisted run at startup). Wall time, heap and peak RSS growth per call.
//   answers: for every requester / controller key and ~400 child keys, the list, the status read context and
//            the four descendant readers, with Date.now frozen at the incident. Arms must produce identical JSON.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import readline from "node:readline";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const STATE_DB = path.join(stateDir, "state", "openclaw.sqlite");
const MAKARON_DB = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const FIXTURE = process.env.FIXTURE ?? "/var/tmp/subscope/subagent_runs.sql.zst";
const INCIDENT_MS = Date.parse("2026-11-24T01:12:26.000+08:00");
const role = process.argv[2] ?? "parent";
const log = (key, value) => console.log(`[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`);
const sha = (b) => createHash("sha256").update(b).digest("hex");
for (const [name, dir] of [["TMPDIR", "str-tmp"], ["XDG_CACHE_HOME", "str-cache"]]) {
  const target = path.join(path.dirname(stateDir), dir);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  process.env[name] = target;
}

if (role === "parent") await parent();
else await child(JSON.parse(process.argv[3]));

async function parent() {
  const plan = JSON.parse(fs.readFileSync("lab/subagent-tree-read.plan.json", "utf8"));
  const names = plan.files.map((f) => path.basename(f.target));
  const vBytes = Object.fromEntries(plan.files.map((f) => {
    const bytes = fs.readFileSync(path.join(DIST, path.basename(f.target)));
    assert.equal(sha(bytes), f.before, `candidate runtime is not V's bytes: ${f.target}`);
    return [path.basename(f.target), bytes];
  }));
  const relBytes = Object.fromEntries(plan.files.map((f) => [path.basename(f.target), fs.readFileSync(f.source)]));
  const setDist = (bytes) => { for (const name of names) fs.writeFileSync(path.join(DIST, name), bytes[name]); };
  process.on("exit", () => setDist(vBytes));

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  log("fixture.runs", await importRuns());
  const t0 = performance.now();
  const { buildVScaleSessionDatabase } = await import("./v-scale-session-fixture.mjs");
  const dst = path.join(stateDir, MAKARON_DB);
  fs.rmSync(dst, { force: true });
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${dst}${suffix}`, { force: true });
  const built = buildVScaleSessionDatabase({ runtime, srcPath: path.join(sharedState, MAKARON_DB), dstPath: dst, targetRows: Number(process.env.TARGET_ROWS ?? 20900), orphanWindows: 0 });
  log("fixture.sessions", { ...built, ms: Math.round(performance.now() - t0) });

  const keys = pickKeys();
  log("keys", { incident: keys.incident, requesters: keys.requesters.length, controllers: keys.controllers.length, children: keys.children.length });
  {
    const db = new DatabaseSync(STATE_DB, { readOnly: true });
    const qp = (q) => db.prepare(`EXPLAIN QUERY PLAN ${q}`).all().map((r) => r.detail).join(" | ");
    log("query-plans", {
      treeEdge: qp(`select * from "subagent_runs" where ("requester_session_key" = 'k' or "controller_session_key" = 'k') order by "created_at" asc, "run_id" asc`),
      child: qp(`select * from "subagent_runs" where "child_session_key" = 'k' order by "created_at" asc, "run_id" asc`),
    });
    db.close();
  }

  const timing = [];
  for (const restore of [false, true]) {
    for (const arm of (process.env.ARMS ?? "A,B,A,B").split(",")) {
      setDist(arm === "A" ? vBytes : relBytes);
      timing.push(run({ mode: "timing", arm, restore, key: keys.incident }));
    }
  }
  log("timing", timing.map((r) => ({ arm: r.arm, restore: r.restore, cold: r.calls[0], warm: r.calls[1], runs: r.runs, listed: r.listed })));

  const answers = {};
  for (const restore of [false, true]) {
    for (const arm of ["A", "B"]) {
      setDist(arm === "A" ? vBytes : relBytes);
      const r = run({ mode: "answers", arm, restore, keys });
      answers[`${arm}${restore ? "+mem" : ""}`] = r;
    }
  }
  setDist(vBytes);
  for (const variant of ["", "+mem"]) {
    const a = JSON.parse(fs.readFileSync(answers[`A${variant}`].file, "utf8"));
    const b = JSON.parse(fs.readFileSync(answers[`B${variant}`].file, "utf8"));
    const differing = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    const nonEmpty = Object.values(a).filter((v) => v.runs.length > 0 || v.descendants.length > 0).length;
    log(`equivalence${variant}`, {
      keys: Object.keys(a).length,
      keysWithRuns: nonEmpty,
      listedRuns: Object.values(a).reduce((n, v) => n + v.list.active.length + v.list.recent.length, 0),
      hashA: sha(JSON.stringify(a)).slice(0, 16),
      hashB: sha(JSON.stringify(b)).slice(0, 16),
      differing: differing.length,
      firstDifferences: differing.slice(0, 3).map((k) => ({ key: k, a: a[k], b: b[k] })),
      wallMsA: answers[`A${variant}`].wallMs,
      wallMsB: answers[`B${variant}`].wallMs,
    });
    assert.equal(differing.length, 0, `arms differ (${variant || "empty memory"})`);
  }
}

// V's subagent_runs replaces the private snapshot's rows; the schema must be the same table.
async function importRuns() {
  const db = new DatabaseSync(STATE_DB);
  const columns = db.prepare("PRAGMA table_info(subagent_runs)").all().map((c) => c.name).join(",");
  assert.equal(columns, "run_id,child_session_key,controller_session_key,requester_session_key,created_at,payload_json");
  const before = db.prepare("SELECT count(*) n FROM subagent_runs").get().n;
  db.exec("BEGIN IMMEDIATE");
  db.exec("DELETE FROM subagent_runs");
  const zstd = spawn("zstd", ["-dc", FIXTURE], { stdio: ["ignore", "pipe", "inherit"] });
  let inserted = 0;
  for await (const line of readline.createInterface({ input: zstd.stdout, crlfDelay: Infinity })) {
    if (!line.startsWith("INSERT INTO ")) continue;
    db.exec(line.replace(/^INSERT INTO "?subagent_runs"? VALUES/u, "INSERT INTO subagent_runs VALUES"));
    inserted += 1;
  }
  db.exec("COMMIT");
  const stats = db.prepare("SELECT count(*) n, count(distinct requester_session_key) r, count(distinct child_session_key) c, sum(length(payload_json)) b FROM subagent_runs").get();
  db.close();
  assert.equal(stats.n, inserted);
  return { replaced: before, inserted, requesters: stats.r, children: stats.c, payloadMb: Math.round(stats.b / 1048576) };
}

function pickKeys() {
  const db = new DatabaseSync(STATE_DB, { readOnly: true });
  const col = (q) => db.prepare(q).all().map((r) => r.k);
  const requesters = col("SELECT DISTINCT requester_session_key k FROM subagent_runs ORDER BY k");
  const controllers = col("SELECT DISTINCT controller_session_key k FROM subagent_runs WHERE controller_session_key IS NOT NULL AND controller_session_key <> '' ORDER BY k");
  // children: every one that requested something, plus an even sample of the rest
  const allChildren = col("SELECT DISTINCT child_session_key k FROM subagent_runs ORDER BY k");
  const parents = new Set(requesters);
  const step = Math.max(1, Math.floor(allChildren.length / 400));
  const children = allChildren.filter((k, i) => parents.has(k) || i % step === 0);
  const incident = col("SELECT requester_session_key k, count(*) n FROM subagent_runs WHERE requester_session_key LIKE '%oc_fab91%' GROUP BY k ORDER BY n DESC LIMIT 1")[0];
  db.close();
  assert(incident, "no run of the 十二家 group in the fixture");
  return { incident, requesters, controllers, children };
}

function run(args) {
  const r = spawnSync(process.execPath, ["--expose-gc", `--max-old-space-size=${process.env.HEAP_MB ?? 12288}`, process.argv[1], "child", JSON.stringify(args)], { encoding: "utf8", env: process.env, maxBuffer: 256 * 1024 * 1024 });
  process.stdout.write(r.stdout.split("\n").filter((l) => !l.startsWith("RESULT ")).join("\n"));
  const result = `${r.stdout}`.split("\n").filter((l) => l.startsWith("RESULT ")).map((l) => JSON.parse(l.slice(7))).at(-1);
  if (r.status !== 0 || !result) {
    console.log(r.stderr.slice(-12000));
    throw new Error(`child ${JSON.stringify({ ...args, keys: undefined })} exited ${r.status}`);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------
function readKb(field) {
  const match = fs.readFileSync("/proc/self/status", "utf8").match(new RegExp(`^${field}:\\s+(\\d+) kB`, "mu"));
  return match ? Number(match[1]) : 0;
}

async function child(args) {
  process.env.OPENCLAW_STATE_DIR = stateDir;
  const t0 = performance.now();
  // answers: frozen at the incident; timing: the incident plus elapsed time, so the 500 ms cache ages as on V
  const realNow = Date.now;
  Date.now = args.mode === "answers" ? () => INCIDENT_MS : () => INCIDENT_MS + Math.floor(performance.now() - t0);
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const control = await import(path.join(DIST, "subagent-control-scope-DA4oSvgr.js"));
  const { t: buildSubagentList } = await import(path.join(DIST, "subagent-list-BS8F5xN_.js"));
  const read = await import(path.join(DIST, "subagent-registry-read-UaDFTyfW.js"));
  const { w: subagentRuns } = await import(path.join(DIST, "subagent-registry.store.sqlite-hzGu4QSk.js"));
  const { l: resolveSubagentController, c: listControlledSubagentRuns, r: buildControlledSubagentRunsReadContext } = control;
  const { i: countActiveDescendantRuns, a: countPendingDescendantRuns, m: listDescendantRunsForRequester, u: hasDescendantRunAwaitingSettle, w: restoreSubagentRunsFromDisk } = read;
  if (args.restore) {
    const r0 = performance.now();
    const restored = restoreSubagentRunsFromDisk({ runs: subagentRuns, mergeOnly: true });
    log(`${args.arm}.restore`, { restored, ms: Math.round(performance.now() - r0) });
  }
  const agentOf = (key) => key.split(":")[1];
  const toolList = (key, recentMinutes) => {
    const controller = resolveSubagentController({ cfg, agentSessionKey: key, agentId: agentOf(key) });
    const runs = listControlledSubagentRuns(controller.controllerSessionKey, controller.controllerAgentId, cfg);
    return { controller, runs, list: buildSubagentList({ cfg, runs, recentMinutes }) };
  };

  if (args.mode === "timing") {
    const calls = [];
    let last;
    for (let i = 0; i < 2; i += 1) {
      global.gc();
      try { fs.writeFileSync("/proc/self/clear_refs", "5"); } catch {}
      const heap0 = process.memoryUsage().heapUsed;
      const rss0 = readKb("VmRSS");
      const c0 = performance.now();
      last = toolList(args.key, 180);
      const ms = performance.now() - c0;
      calls.push({ ms: Math.round(ms), heapGrowthMb: Math.round((process.memoryUsage().heapUsed - heap0) / 1048576), peakRssGrowthMb: Math.round((readKb("VmHWM") - rss0) / 1024) });
      // the next call in V comes seconds later: let the 500 ms cache age past its TTL
      const wait = performance.now() + 600;
      while (performance.now() < wait) await new Promise((r) => setTimeout(r, 50));
    }
    Date.now = realNow;
    console.log(`RESULT ${JSON.stringify({ arm: args.arm, restore: args.restore, calls, runs: last.runs.length, listed: last.list.active.length + last.list.recent.length })}`);
    return;
  }

  const keys = [...new Set([args.keys.incident, ...args.keys.requesters, ...args.keys.controllers, ...args.keys.children])];
  const out = {};
  const w0 = performance.now();
  // Date.now is frozen, so arm A loads the full snapshot once and answers every key from it (the full-snapshot
  // semantics); arm B never populates that cache, so every read below takes the session-tree path.
  for (const key of keys) {
    const { runs, list } = toolList(key, 180);
    const context = buildControlledSubagentRunsReadContext(key, agentOf(key), cfg);
    const pending = context.runs.map((entry) => context.countPendingDescendantRuns(entry.childSessionKey));
    const active = countActiveDescendantRuns(key);
    const pendingRoot = countPendingDescendantRuns(key);
    const descendants = listDescendantRunsForRequester(key).map((e) => e.runId);
    const awaiting = [hasDescendantRunAwaitingSettle(key), hasDescendantRunAwaitingSettle(key, runs[0]?.runId), hasDescendantRunAwaitingSettle(key, undefined, "makaron")];
    out[key] = { runs: runs.map((e) => e.runId), statusRuns: context.runs.map((e) => e.runId), pending, list, active, pendingRoot, descendants, awaiting };
  }
  const file = path.join(path.dirname(stateDir), `str-answers-${args.arm}${args.restore ? "-mem" : ""}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`RESULT ${JSON.stringify({ arm: args.arm, restore: args.restore, file, keys: keys.length, wallMs: Math.round(performance.now() - w0) })}`);
}
