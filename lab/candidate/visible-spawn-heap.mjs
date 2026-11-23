// Who allocates ~4.6 GiB and stops V's Gateway for 50-60 s when an agent calls sessions_spawn(visible=true)?
//
// V 2026-11-23 14:51:25-14:52:15 and 15:07:27-15:08:27 CST: a /vds group turn called sessions_spawn with
// visible=true (the tool goes through the in-process `sessions.create` handler). Both times the Gateway's main
// thread stopped for 50-60 s, heapUsed went from <6 GiB to 7.5 GiB, and the only log lines from inside the stop were
// two slow agent.write holds at its end (appendTranscriptEvent ~6-7.6 s, runSqliteSessionDeletionTransaction ~6.1 s).
//
// This harness builds a V-scale makaron session store (v-scale-session-fixture.mjs), then calls the real
// `sessions.create` handler of the candidate runtime with the parameters sessions_spawn(visible) sends, under the
// CPU profiler and the sampling heap profiler (objects later freed by GC included), and prints:
//   - wall time, longest main-thread block, GC pauses by kind, heapUsed before/after, peak heapUsed
//   - the allocation sites (sampled bytes by function, bottom-up) and the stacks of the heaviest ones
//   - CPU self time by function
//   - sqlite statements whose text touches session_nodes, with row counts and bytes returned
// One `sessions.create` without a task warms the process (module state, canonical key proof), as a long-running
// Gateway already is; the second one is measured. MODES=create,create+task chooses whether the measured call
// carries a task (chat.send of the first turn).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import inspector from "node:inspector/promises";
import path from "node:path";
import { PerformanceObserver, performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import v8 from "node:v8";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const DB_REL = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const dbPath = path.join(stateDir, DB_REL);
const OUT = path.join(path.dirname(stateDir), "visible-spawn-heap-out");
const role = process.argv[2] ?? "parent";
for (const [name, dir] of [["TMPDIR", "vsh-tmp"], ["XDG_CACHE_HOME", "vsh-cache"]]) {
  const target = path.join(path.dirname(stateDir), dir);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  process.env[name] = target;
}
const log = (key, value) => console.log(`[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`);
const sha = (b) => createHash("sha256").update(b).digest("hex");

// V's bytes (/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist, 2026-11-23), sha256 prefixes
const V_BYTES = {
  "sessions-create-DsVre8e5.js": "e713338d4f633e93",
  "session-create-service--hv2vsLh.js": "83b8f923a0b8d7c7",
  "session-accessor-K0XuW6ln.js": "13af5e83e8dd4140",
  "session-accessor.sqlite-entry-store-VfW3gyuj.js": "6aa9f48818633ba0",
  "session-accessor.sqlite-entry-BlklNPKQ.js": "7cba57ac7e6c80bf",
  "session-accessor.sqlite-scope-BwPKGcgm.js": "caffb3629c5cbfb1",
  "sessions-spawn-tool-1FQMTkIo.js": "ba127bab652e9f44",
  "subagent-capabilities-CPAHEjL-.js": "4ee0a32ecb6d7761",
};

if (role === "parent") await parent();
else await child(JSON.parse(process.argv[3]));

async function parent() {
  const hashes = Object.fromEntries(Object.keys(V_BYTES).map((n) => [n, sha(fs.readFileSync(path.join(DIST, n))).slice(0, 16)]));
  const mismatch = Object.entries(hashes).filter(([n, h]) => h !== V_BYTES[n]);
  log("runtime.vs-V", { equal: mismatch.length === 0, mismatch });

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  config.session = { ...(config.session ?? {}), maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  const t0 = performance.now();
  const { buildVScaleSessionDatabase } = await import("./v-scale-session-fixture.mjs");
  const built = buildVScaleSessionDatabase({ runtime, srcPath: path.join(sharedState, DB_REL), dstPath: dbPath, targetRows: Number(process.env.TARGET_ROWS ?? 21800), orphanWindows: Number(process.env.ORPHAN_WINDOWS ?? 0) });
  log("fixture", { ...built, ms: Math.round(performance.now() - t0) });
  const parentInfo = pickParentGroupSession();
  log("fixture.parent", parentInfo);

  const existingLabel = pickExistingLabel();
  log("fixture.label", { existingLabel });

  // A = V's bytes, B = session-create-narrow release files; each run is a fresh process (warm-up + measured call)
  const plan = JSON.parse(fs.readFileSync("lab/session-create-narrow.plan.json", "utf8"));
  const names = plan.files.map((f) => path.basename(f.target));
  const vBytes = Object.fromEntries(plan.files.map((f) => {
    const bytes = fs.readFileSync(path.join(DIST, path.basename(f.target)));
    assert.equal(sha(bytes), f.before, `candidate runtime is not V's bytes: ${f.target}`);
    return [path.basename(f.target), bytes];
  }));
  const relBytes = Object.fromEntries(plan.files.map((f) => [path.basename(f.target), fs.readFileSync(f.source)]));
  const setDist = (bytes) => { for (const name of names) fs.writeFileSync(path.join(DIST, name), bytes[name]); };
  process.on("exit", () => setDist(vBytes));
  const results = [];
  for (const arm of (process.env.ARMS ?? "A,B,A,B").split(",")) {
    setDist(arm === "A" ? vBytes : relBytes);
    results.push(run({ mode: "create", arm, parentKey: parentInfo.parentKey, existingLabel }));
  }
  setDist(vBytes);
  const pick = (r) => ({ arm: r.arm, wallMs: r.measured.wallMs, maxBlockMs: r.measured.maxBlockMs, peakHeapUsedMb: r.measured.peakHeapUsedMb, sampledMb: r.sampledMb, gcMs: r.gcMs, dupLabel: r.dupLabel, freshEntry: r.entryShape });
  log("summary", results.map(pick));
  const shapes = new Set(results.map((r) => r.entryShape));
  const dup = new Set(results.map((r) => JSON.stringify(r.dupLabel)));
  log("equivalence", { createdEntryShapes: shapes.size, duplicateLabelOutcomes: [...dup] });
  assert.equal(shapes.size, 1, "created entries differ between arms");
  assert.equal(dup.size, 1, "duplicate-label outcome differs between arms");
}

// a label another session already carries (sessions.create must refuse it in both arms)
function pickExistingLabel() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT label FROM session_nodes WHERE label IS NOT NULL AND entry_valid = 1 ORDER BY session_key LIMIT 1").get();
  db.close();
  return row?.label;
}

// the parent: the largest real feishu group session the shared store has (V's /vds groups are such rows)
function pickParentGroupSession() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT session_key, length(entry_json) AS bytes FROM session_nodes WHERE session_key LIKE 'agent:makaron:feishu:group:%' AND entry_valid = 1 ORDER BY length(entry_json) DESC LIMIT 1").get();
  const stats = db.prepare("SELECT count(*) n, sum(length(entry_json)) b FROM session_nodes").get();
  db.close();
  assert(row, "no feishu group session in the fixture");
  return { parentKey: row.session_key, entryBytes: row.bytes, nodes: stats.n, entryMb: Math.round(stats.b / 1048576) };
}

function run(args) {
  const r = spawnSync(process.execPath, ["--experimental-async-context-frame", `--max-old-space-size=${process.env.HEAP_MB ?? 12288}`, process.argv[1], "child", JSON.stringify(args)], { encoding: "utf8", env: process.env, maxBuffer: 256 * 1024 * 1024 });
  process.stdout.write(r.stdout);
  const result = `${r.stdout}`.split("\n").filter((l) => l.startsWith("RESULT ")).map((l) => JSON.parse(l.slice(7))).at(-1);
  if (r.status !== 0 || !result) {
    console.log(r.stderr.slice(-12000));
    throw new Error(`child ${JSON.stringify(args)} exited ${r.status}`);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------
async function child(args) {
  process.env.OPENCLAW_STATE_DIR = stateDir;
  fs.mkdirSync(OUT, { recursive: true });
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const { t: sessionCreateHandlers } = await import(path.join(DIST, "sessions-create-DsVre8e5.js"));
  const handler = sessionCreateHandlers["sessions.create"];
  assert.equal(typeof handler, "function");

  const contextAccess = new Map();
  const base = {
    getRuntimeConfig: () => config,
    loadGatewayModelCatalog: async () => [],
    broadcast: () => {},
    broadcastToConnIds: () => {},
    nodeSendToSession: () => {},
  };
  const context = new Proxy(base, {
    get(target, prop) {
      if (typeof prop === "string") contextAccess.set(prop, (contextAccess.get(prop) ?? 0) + 1);
      if (prop in target) return target[prop];
      if (prop === "then") return undefined;
      return () => undefined;
    },
  });
  const call = (params) => new Promise((resolve) => {
    let settled = false;
    Promise.resolve(handler({
      req: { type: "req", id: randomUUID(), method: "sessions.create", params },
      params,
      client: null,
      isWebchatConnect: () => false,
      context,
      respond: (ok, payload, error) => { if (!settled) { settled = true; resolve({ ok, payload, error }); } },
    })).catch((error) => { if (!settled) { settled = true; resolve({ ok: false, thrown: String(error?.stack ?? error) }); } });
  });
  const spawnParams = (withTask) => ({
    agentId: "makaron",
    label: `Skill gate ${randomUUID().slice(0, 8)}`,
    parentSessionKey: args.parentKey,
    spawnDepth: 1,
    ...(withTask ? { task: "只读验收：列出 workspace 根目录文件名，不要修改任何东西。" } : {}),
  });

  {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const qp = (q) => db.prepare(`EXPLAIN QUERY PLAN ${q}`).all().map((r) => r.detail).join(" | ");
    log("query-plans", {
      keys: qp('select "session_key" from "session_nodes"'),
      label: qp('select "session_key" from "session_nodes" where ("label" = \'x\' or "entry_valid" != 1)'),
    });
    db.close();
  }
  // warm-up: what a long-running Gateway has already paid
  const w0 = performance.now();
  const warm = await call(spawnParams(false));
  log("warmup", { ms: Math.round(performance.now() - w0), ok: warm.ok, key: warm.payload?.key, error: warm.error ?? warm.thrown });

  // SQL observation: statements touching session_nodes (text, rows, bytes) via node:sqlite's StatementSync
  const sql = new Map();
  const proto = (await import("node:sqlite")).StatementSync.prototype;
  const wrap = (name) => {
    const orig = proto[name];
    proto[name] = function (...a) {
      const t = performance.now();
      const out = orig.apply(this, a);
      const text = String(this.sourceSQL ?? "");
      if (/session_nodes/u.test(text)) {
        const key = `${name}: ${text.replace(/\s+/gu, " ").slice(0, 220)}`;
        const s = sql.get(key) ?? { calls: 0, ms: 0, rows: 0, chars: 0 };
        s.calls += 1; s.ms += performance.now() - t;
        const rows = Array.isArray(out) ? out : out && typeof out === "object" && name === "get" ? [out] : [];
        s.rows += rows.length;
        for (const r of rows) for (const v of Object.values(r ?? {})) if (typeof v === "string") s.chars += v.length;
        sql.set(key, s);
      }
      return out;
    };
  };
  for (const n of ["all", "get"]) wrap(n);
  const iterOrig = proto.iterate;
  proto.iterate = function (...a) {
    const text = String(this.sourceSQL ?? "");
    const it = iterOrig.apply(this, a);
    if (!/session_nodes/u.test(text)) return it;
    const key = `iterate: ${text.replace(/\s+/gu, " ").slice(0, 220)}`;
    const s = sql.get(key) ?? { calls: 0, ms: 0, rows: 0, chars: 0 };
    s.calls += 1; sql.set(key, s);
    const t = performance.now();
    return (function* () { for (const r of it) { s.rows += 1; for (const v of Object.values(r ?? {})) if (typeof v === "string") s.chars += v.length; yield r; } s.ms += performance.now() - t; })();
  };

  const gcs = [];
  const obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) gcs.push({ kind: e.detail?.kind ?? e.kind, ms: e.duration }); });
  obs.observe({ entryTypes: ["gc"] });
  let peak = process.memoryUsage().heapUsed;
  const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().heapUsed); }, 50);
  let last = performance.now(); let maxBlock = 0; const blocks = [];
  const loop = setInterval(() => { const now = performance.now(); const g = now - last; last = now; if (g > maxBlock) maxBlock = g; if (g > 500) blocks.push(Math.round(g)); }, 5);

  const session = new inspector.Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 1000 });
  await session.post("HeapProfiler.enable");
  await session.post("HeapProfiler.startSampling", { samplingInterval: 256 * 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await session.post("Profiler.start");

  const heap0 = process.memoryUsage().heapUsed;
  const t = performance.now();
  const res = await call(spawnParams(args.mode === "create+task"));
  const wallMs = performance.now() - t;
  { const g = performance.now() - last; if (g > maxBlock) maxBlock = g; if (g > 500) blocks.push(Math.round(g)); }
  const heap1 = process.memoryUsage().heapUsed;
  for (const e of obs.takeRecords()) gcs.push({ kind: e.detail?.kind ?? e.kind, ms: e.duration });

  const { profile: cpu } = await session.post("Profiler.stop");
  const { profile: heap } = await session.post("HeapProfiler.stopSampling");
  clearInterval(loop); clearInterval(sampler); obs.disconnect();
  fs.writeFileSync(path.join(OUT, `${args.mode}.cpuprofile`), JSON.stringify(cpu));
  fs.writeFileSync(path.join(OUT, `${args.mode}.heapprofile`), JSON.stringify(heap));

  const gcByKind = {};
  for (const g of gcs) { const k = String(g.kind); const s = (gcByKind[k] ??= { n: 0, ms: 0, max: 0 }); s.n += 1; s.ms = Math.round(s.ms + g.ms); s.max = Math.max(s.max, Math.round(g.ms)); }
  const measured = {
    ok: res.ok, key: res.payload?.key, runStarted: res.payload?.runStarted, error: res.error ?? res.thrown,
    wallMs: Math.round(wallMs), maxBlockMs: Math.round(maxBlock), blocksOver500: blocks,
    heapUsedBeforeMb: Math.round(heap0 / 2 ** 20), heapUsedAfterMb: Math.round(heap1 / 2 ** 20), peakHeapUsedMb: Math.round(peak / 2 ** 20),
    gcByKind, heapStats: v8.getHeapStatistics().total_heap_size >> 20,
  };
  log(`measured.${args.arm}.${args.mode}`, measured);
  log(`context.${args.mode}`, Object.fromEntries(contextAccess));
  log(`sql.${args.mode}`, [...sql].sort((a, b) => b[1].chars - a[1].chars).slice(0, 15).map(([k, s]) => ({ stmt: k, calls: s.calls, ms: Math.round(s.ms), rows: s.rows, charsMb: Math.round(s.chars / 2 ** 20) })));

  // heap: bytes by function (self) and the heaviest bottom-up stacks
  const self = new Map(); const leaves = [];
  const walk = (node, stack) => {
    const f = node.callFrame;
    const name = `${f.functionName || "(anon)"} ${path.basename(f.url || "")}:${f.lineNumber + 1}`;
    const bytes = (node.selfSize ?? 0);
    const next = [...stack, name];
    if (bytes) { self.set(name, (self.get(name) ?? 0) + bytes); leaves.push({ bytes, stack: next }); }
    for (const c of node.children ?? []) walk(c, next);
  };
  walk(heap.head, []);
  const totalHeapMb = [...self.values()].reduce((a, b) => a + b, 0) / 2 ** 20;
  log(`heap.self.${args.mode}`, { totalSampledMb: Math.round(totalHeapMb), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, b]) => [k, Math.round(b / 2 ** 20)]) });
  leaves.sort((a, b) => b.bytes - a.bytes);
  // group heavy leaves by the first frame above them that is in an openclaw dist file (the allocating caller)
  const byCaller = new Map();
  for (const l of leaves) {
    const callerIdx = [...l.stack].reverse().findIndex((n) => /-[A-Za-z0-9_-]{8}\.js:|\.js:/u.test(n) && !/node:|^\(anon\) :/u.test(n));
    const stackKey = l.stack.slice(-14).join(" < ");
    const s = byCaller.get(stackKey) ?? 0; byCaller.set(stackKey, s + l.bytes);
    void callerIdx;
  }
  log(`heap.stacks.${args.mode}`, [...byCaller].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, b]) => ({ mb: Math.round(b / 2 ** 20), stack: k.split(" < ").reverse() })));

  // cpu: self time by function
  const cpuSelf = new Map();
  const dt = new Map();
  for (let i = 0; i < cpu.samples.length; i += 1) dt.set(cpu.samples[i], (dt.get(cpu.samples[i]) ?? 0) + (cpu.timeDeltas[i] ?? 0));
  for (const n of cpu.nodes) {
    const f = n.callFrame;
    const name = `${f.functionName || "(anon)"} ${path.basename(f.url || "")}:${f.lineNumber + 1}`;
    cpuSelf.set(name, (cpuSelf.get(name) ?? 0) + (dt.get(n.id) ?? 0) / 1000);
  }
  log(`cpu.self.${args.mode}`, [...cpuSelf].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, ms]) => [k, Math.round(ms)]));
  // cpu: inclusive time of dist functions (to see which caller spends it)
  const byId = new Map(cpu.nodes.map((n) => [n.id, n]));
  const parentOf = new Map();
  for (const n of cpu.nodes) for (const c of n.children ?? []) parentOf.set(c, n.id);
  const incl = new Map();
  for (const [id, us] of dt) {
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parentOf.get(cur)) {
      const f = byId.get(cur).callFrame;
      if (!/dist\//u.test(f.url)) continue;
      const name = `${f.functionName || "(anon)"} ${path.basename(f.url)}:${f.lineNumber + 1}`;
      if (seen.has(name)) continue; seen.add(name);
      incl.set(name, (incl.get(name) ?? 0) + us / 1000);
    }
  }
  log(`cpu.inclusive.${args.mode}`, [...incl].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, ms]) => [k, Math.round(ms)]));
  session.disconnect();

  // the created entry without per-call values, to compare arms
  const volatile = new Set(["sessionId", "updatedAt", "createdAt", "label", "lastInteractionAt", "lastActivityAt", "sessionStartedAt", "lifecycleRevision", "creationStamp", "spawnedAt"]);
  const strip = (value) => Array.isArray(value) ? value.map(strip) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().filter((k) => !volatile.has(k)).map((k) => [k, strip(value[k])])) : typeof value === "string" && /^[0-9a-f-]{36}$/u.test(value) ? "<uuid>" : value;
  const entryShape = JSON.stringify(strip(res.payload?.entry ?? null));
  // a label another session carries: both arms must refuse it the same way; a fresh one must pass
  const dupStart = performance.now();
  const dupRes = await call({ ...spawnParams(false), label: args.existingLabel });
  const dupMs = Math.round(performance.now() - dupStart);
  const dupLabel = { ok: dupRes.ok, code: dupRes.error?.code, message: dupRes.error?.message?.replace(args.existingLabel ?? "", "<label>"), thrown: dupRes.thrown ? String(dupRes.thrown).split("\n")[0] : undefined };
  log(`dup-label.${args.arm}`, { ...dupLabel, ms: dupMs });
  console.log(`RESULT ${JSON.stringify({ arm: args.arm, measured, sampledMb: Math.round(totalHeapMb), gcMs: Object.values(gcByKind).reduce((a, g) => a + g.ms, 0), dupLabel, entryShape })}`);
  process.exit(0);
}
