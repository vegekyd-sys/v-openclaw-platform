// Does workboard-list-page-v1 return exactly what V's bytes return, without reading the whole board?
//
// V 2026-11-23 19:09 and 23:24 CST: Codex night-shift turns called workboard_list {boardId: "nightshift",
// limit: 200}; the calls took 30 s and 19 s and stopped the Gateway's main thread for 28 s and 19 s.
//
// Data (outside the repository, FIXTURE on the VLab host): V's workboard.sqlite, read-only `.dump` streamed
// from V on 2026-11-24 (29,105 cards, 440k events). It is restored once to a golden copy; every child process
// works on a fresh copy of it at the plugin's path under the private state directory.
//
// Arms: A = V's bytes (the plan's bases), B = lab/release-files/workboard-list-page. Each child is a fresh
// process that calls the real workboard_list tool (createWorkboardTools from the arm's extension bytes).
//   timing:  the incident calls ({boardId: "nightshift", limit: 200} and limit 20), first and repeated, with wall
//            time, heap growth and the longest event-loop delay during the call.
//   answers: arm B answers ~60 filter combinations twice in one process, with OPENCLAW_V_WORKBOARD_LIST_PAGE=0
//            (the full read, V's chain) and unset, on the same copy; the answers must be identical JSON. Arm A
//            answers a subset, which must hash the same as arm B's.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && stateDir, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE = process.env.FIXTURE ?? "/var/tmp/wblist/workboard.sql.zst";
const WORK = path.join(path.dirname(stateDir), "wbl-work");
const GOLDEN = path.join(WORK, "golden.sqlite");
const DB = path.join(stateDir, "plugins", "workboard", "workboard.sqlite");
const role = process.argv[2] ?? "parent";
const progressFile = path.join(path.dirname(stateDir), "wbl-progress.log");
const log = (key, value) => {
  const line = `[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`;
  console.log(line);
  try { fs.appendFileSync(progressFile, `${line}\n`); } catch {}
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
for (const [name, dir] of [["TMPDIR", "wbl-tmp"], ["XDG_CACHE_HOME", "wbl-cache"]]) {
  const target = path.join(path.dirname(stateDir), dir);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  process.env[name] = target;
}

const SUBSET = (combos) => combos.filter((_, i) => i % 6 === 0);

if (role === "parent") parent();
else await child(JSON.parse(process.argv[3]));

function parent() {
  const plan = JSON.parse(fs.readFileSync("lab/workboard-list-page.plan.json", "utf8"));
  const rel = (f) => f.target.replace(/^openclaw\/dist\//u, "");
  const runtimeBytes = Object.fromEntries(plan.files.map((f) => [rel(f), fs.readFileSync(path.join(DIST, rel(f)))]));
  log("runtime.isV", Object.fromEntries(plan.files.map((f) => [rel(f), sha(runtimeBytes[rel(f)]) === f.before])));
  const bases = { "sqlite-store-CH-caj1l.js": "lab/release-files/spawn-broker-workboard-index", "runtime-api-1CCazqtv.js": "lab/release-files/workboard-full-context", "extensions/workboard/index.js": "lab/release-files/workboard-sweep-complete" };
  const arms = {
    A: Object.fromEntries(plan.files.map((f) => {
      const bytes = fs.readFileSync(path.join(bases[rel(f)], rel(f)));
      assert.equal(sha(bytes), f.before, rel(f));
      return [rel(f), bytes];
    })),
    B: Object.fromEntries(plan.files.map((f) => [rel(f), fs.readFileSync(f.source)])),
  };
  const setDist = (bytes) => { for (const [name, b] of Object.entries(bytes)) fs.writeFileSync(path.join(DIST, name), b); };
  process.on("exit", () => setDist(runtimeBytes));

  fs.mkdirSync(WORK, { recursive: true });
  if (!fs.existsSync(GOLDEN)) {
    const t0 = performance.now();
    const r = spawnSync("sh", ["-c", `zstd -dc "${FIXTURE}" | sqlite3 "${GOLDEN}"`], { encoding: "utf8", maxBuffer: 1 << 26 });
    assert.equal(r.status, 0, r.stderr);
    log("golden.restoreMs", Math.round(performance.now() - t0));
  }
  const counts = spawnSync("sqlite3", [GOLDEN, "select count(*), sum(board_id='nightshift') from workboard_cards; select count(*) from workboard_card_events;"], { encoding: "utf8" }).stdout.trim();
  log("golden.counts", counts);

  const run = (arm, mode) => {
    setDist(arms[arm]);
    // the extension's tool factory is module-private: a sibling copy exports it, so relative imports resolve
    fs.writeFileSync(path.join(DIST, "extensions/workboard/__wbl-cand.js"), `${arms[arm]["extensions/workboard/index.js"]}\nexport { createWorkboardTools as __createWorkboardTools };\n`);
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${DB}${suffix}`, { force: true });
    fs.copyFileSync(GOLDEN, DB);
    log("child.start", { arm, mode });
    const r = spawnSync(process.execPath, [`--max-old-space-size=${process.env.HEAP_MB ?? 5632}`, process.argv[1], "child", JSON.stringify({ arm, mode })], {
      encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env },
      timeout: Number(process.env.CHILD_TIMEOUT_MS ?? 40 * 60 * 1000), killSignal: "SIGKILL",
    });
    fs.rmSync(path.join(DIST, "extensions/workboard/__wbl-cand.js"), { force: true });
    if (r.status !== 0) { log("child.fail", { arm, mode, status: r.status, signal: r.signal, stderr: r.stderr.slice(-4000) }); process.exit(1); }
    const result = JSON.parse(r.stdout.trim().split("\n").at(-1));
    log(`child.${arm}.${mode}`, mode === "answers" ? { combos: result.combos, hash: result.hash, mismatches: result.mismatches, msOld: result.msOld, msNew: result.msNew } : result);
    return result;
  };

  const timing = [];
  // CROSS_ONLY=1: only arm A's and arm B's answers to the subset (the timing and the full comparison ran already)
  if (process.env.CROSS_ONLY === "1") {
    const a = run("A", "answers-subset");
    const b = run("B", "answers-subset");
    log("summary", { subsetHashA: a.hash, subsetHashB: b.hash, armsAgree: a.hash === b.hash });
    fs.rmSync(path.dirname(DB), { recursive: true, force: true });
    assert.equal(a.hash, b.hash, "A and B answer differently");
    return;
  }
  for (const arm of (process.env.ARMS ?? "A,B,A,B").split(",")) timing.push({ arm, ...run(arm, "timing") });
  const answersB = run("B", "answers");
  const answersA = run("A", "answers-subset");
  const subsetB = createHash("sha256").update(JSON.stringify(answersB.subset)).digest("hex");
  log("summary", {
    timing,
    combos: answersB.combos,
    mismatchesWithinB: answersB.mismatches,
    subsetHashA: answersA.hash,
    subsetHashB: subsetB,
    armsAgree: answersA.hash === subsetB,
  });
  fs.rmSync(path.dirname(DB), { recursive: true, force: true });
  assert.equal(answersB.mismatches.length, 0, "B differs from the full read");
  assert.equal(answersA.hash, subsetB, "A and B answer differently");
}

async function child({ arm, mode }) {
  const mod = await import(pathToFileURL(path.join(DIST, "extensions/workboard/__wbl-cand.js")).href);
  const tools = mod.__createWorkboardTools({ context: { agentId: "makaron" } });
  const list = tools.find((t) => t.name === "workboard_list");
  const call = async (params) => JSON.parse((await list.execute("wbl", params)).content[0].text);
  const measure = async (params) => {
    const h = monitorEventLoopDelay({ resolution: 5 });
    h.enable();
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const result = await call(params);
    const ms = performance.now() - t0;
    h.disable();
    return { ms: Math.round(ms), heapMB: Math.round((process.memoryUsage().heapUsed - heap0) / 2 ** 20), loopMaxMs: Math.round(h.max / 1e6), cards: result.cards.length };
  };
  if (mode === "timing") {
    const out = {};
    for (const limit of [200, 20]) {
      const params = { boardId: "nightshift", limit };
      out[`limit${limit}`] = [await measure(params), await measure(params), await measure(params)];
    }
    console.log(JSON.stringify(out));
    return;
  }
  const combos = await buildCombos();
  if (mode === "answers-subset") {
    const answers = [];
    for (const params of SUBSET(combos)) answers.push(await call(params));
    console.log(JSON.stringify({ hash: createHash("sha256").update(JSON.stringify(answers)).digest("hex") }));
    return;
  }
  const mismatches = [];
  const subset = [];
  let msOld = 0;
  let msNew = 0;
  for (const [i, params] of combos.entries()) {
    process.env.OPENCLAW_V_WORKBOARD_LIST_PAGE = "0";
    let t0 = performance.now();
    const old = await call(params);
    msOld += performance.now() - t0;
    delete process.env.OPENCLAW_V_WORKBOARD_LIST_PAGE;
    t0 = performance.now();
    const now = await call(params);
    msNew += performance.now() - t0;
    if (JSON.stringify(old) !== JSON.stringify(now)) mismatches.push({ params, old: old.cards.map((c) => c.id).slice(0, 10), now: now.cards.map((c) => c.id).slice(0, 10) });
    if (i % 6 === 0) subset.push(now);
    if (i % 10 === 0) log("answers.progress", { i, of: combos.length, mismatches: mismatches.length });
  }
  console.log(JSON.stringify({ combos: combos.length, mismatches, subset, hash: createHash("sha256").update(JSON.stringify(subset)).digest("hex"), msOld: Math.round(msOld), msNew: Math.round(msNew) }));
}

// Filter combinations drawn from the board itself: its boards, statuses, agents and tenants, plus misses.
async function buildCombos() {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB, { readOnly: true });
  const top = (sql) => db.prepare(sql).all().map((r) => r.v);
  const boards = top("SELECT board_id AS v FROM workboard_cards GROUP BY 1 ORDER BY count(*) DESC");
  const statuses = top("SELECT status AS v FROM workboard_cards GROUP BY 1 ORDER BY count(*) DESC");
  const agents = top("SELECT agent_id AS v FROM workboard_cards WHERE agent_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 3");
  const tenants = top("SELECT json_extract(automation_json, '$.tenant') AS v FROM workboard_cards WHERE json_valid(automation_json) AND json_type(automation_json, '$.tenant') = 'text' GROUP BY 1 ORDER BY count(*) DESC LIMIT 4");
  db.close();
  const combos = [];
  for (const boardId of [undefined, "nightshift", boards.at(-1)]) {
    for (const limit of [20, 200]) combos.push({ boardId, limit }, { boardId, limit, includeArchived: true });
    for (const status of statuses) combos.push({ boardId, limit: 200, status }, { boardId, limit: 1, status, includeArchived: true });
    for (const agentId of [...agents, "nobody"]) combos.push({ boardId, agentId, limit: 50 });
    for (const tenant of [...tenants, "no-such-tenant"]) combos.push({ boardId, tenant, limit: 50 }, { boardId, tenant, status: statuses[0], limit: 200, includeArchived: true });
  }
  combos.push({}, { includeArchived: true, limit: 200 }, { boardId: "NightShift", limit: 5 });
  return combos.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)));
}
