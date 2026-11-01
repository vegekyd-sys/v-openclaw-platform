// subagent-control-scoped-read: does the scoped read give the same answers as the whole registry?
// See lab/subagent-control-scoped-read.md.
//
// Data: V's registries with free text removed (FIXTURE on the VLab host, outside the repository), padded to
// V's payload sizes, in this run's private state database. The real chunks are called with each switch off
// and on; off is V's behaviour. Both shapes of a process are tried: a Gateway, which holds every run in
// memory, and a Worker or other reader, which holds none.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE = process.env.FIXTURE ?? "/var/tmp/csr-20261101/topo.json.gz";
const CHILD_SAMPLE = Number(process.env.CHILD_SAMPLE ?? 400);
const imp = (name) => import(path.join(DIST, name));
const { r: buildContext } = await imp("subagent-control-scope-DA4oSvgr.js");
const store = await imp("subagent-registry.store.sqlite-hzGu4QSk.js");
const { i: openState } = await imp("openclaw-state-db-Bh3Bq87y.js");
const { createAgentHarnessTaskRuntime } = await imp("plugin-sdk/agent-harness-task-runtime.js");
const { n: createScope } = await imp("agent-harness-task-runtime-scope-BNJRhh_H.js");
const registry = await imp("task-registry-B4-CJZk7.js");
const memory = store.w;
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const { db } = openState();

const { subagent, tasks } = JSON.parse(zlib.gunzipSync(fs.readFileSync(FIXTURE)));
const columns = ["run_id", "child_session_key", "controller_session_key", "requester_session_key", "created_at", "payload_json"];
const insert = db.prepare(`INSERT OR REPLACE INTO subagent_runs (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
const put = (row) => insert.run(...columns.map((c) => row[c]));
db.exec("BEGIN");
for (const r of subagent) put({ ...r, payload_json: JSON.stringify({ ...JSON.parse(r.payload_json), task: "x".repeat(r.pad) }) });
db.exec("COMMIT");
const taskColumns = Object.keys(tasks[0]).filter((c) => c !== "pad");
const insertTask = db.prepare(`INSERT OR REPLACE INTO task_runs (${taskColumns.join(",")},task) VALUES (${taskColumns.map(() => "?").join(",")},?)`);
db.exec("BEGIN");
for (const t of tasks) insertTask.run(...taskColumns.map((c) => t[c]), "y".repeat(t.pad));
db.exec("COMMIT");

const SWITCH = "OPENCLAW_V_SCOPED_CONTROL_SUBAGENT_RUNS";
const answers = (key, agentId, on) => {
  process.env[SWITCH] = on ? "1" : "0";
  const started = performance.now();
  const context = buildContext(key, agentId, cfg);
  const ms = performance.now() - started;
  const pending = Object.fromEntries([key, ...context.runs.map((run) => run.childSessionKey)].map((k) => [k, context.countPendingDescendantRuns(k)]));
  return { json: JSON.stringify({ runs: context.runs, pending }), n: context.runs.length, ms };
};
const compare = (key, agentId = key.split(":")[1] ?? "makaron") => {
  const off = answers(key, agentId, false);
  const on = answers(key, agentId, true);
  return { key, same: off.json === on.json, n: off.n, offMs: off.ms, onMs: on.ms };
};
const p = (list, q) => [...list].sort((x, y) => x - y)[Math.floor((list.length - 1) * q)];
const summary = (list) => ({ n: list.length, mismatches: list.filter((x) => !x.same).length, withRuns: list.filter((x) => x.n > 0).length, offP50Ms: Math.round(p(list.map((x) => x.offMs), 0.5)), onP50Ms: +p(list.map((x) => x.onMs), 0.5).toFixed(2), onMaxMs: +Math.max(...list.map((x) => x.onMs)).toFixed(1), fallbackKeys: list.filter((x) => x.onMs > 200).length });

const keys = [...new Set(subagent.flatMap((r) => [r.controller_session_key, r.requester_session_key]).filter(Boolean))];
const children = [...new Set(subagent.map((r) => r.child_session_key))];
const step = Math.max(1, Math.floor(children.length / CHILD_SAMPLE));
const sampled = [...keys, ...children.filter((_, i) => i % step === 0)];
const out = { rows: subagent.length, tasks: tasks.length, distinctKeys: keys.length, keysTried: sampled.length, shapes: {} };

const SETTLE = 600; // past the whole-registry snapshot's 500 ms cache
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- injected trees, one thing different at a time ----
const template = JSON.parse(subagent.find((r) => JSON.parse(r.payload_json).execution?.status === "terminal").payload_json);
const at = Date.now();
const fresh = { createdAt: at, sessionStartedAt: at };
const unended = { ...template.execution, status: "running", startedAt: at };
delete unended.endedAt;
const payload = (id, controller, requester, child, change = {}) => {
  const value = structuredClone(template);
  Object.assign(value, { runId: id, controllerSessionKey: controller, requesterSessionKey: requester, childSessionKey: child, ...fresh }, change);
  if (controller === null) delete value.controllerSessionKey;
  return value;
};
const row = (id, controller, requester, child, change = {}) => {
  const value = payload(id, controller, requester, child, change);
  return { run_id: id, child_session_key: child, controller_session_key: controller, requester_session_key: requester, created_at: value.createdAt, payload_json: JSON.stringify(value) };
};
const CASES = {
  settledTree: (k) => [row(`${k}-1`, k, k, `${k}:c`), row(`${k}-2`, `${k}:c`, `${k}:c`, `${k}:g`)],
  runningChild: (k) => [row(`${k}-1`, k, k, `${k}:c`, { execution: unended })],
  runningGrandchild: (k) => [row(`${k}-1`, k, k, `${k}:c`), row(`${k}-2`, `${k}:c`, `${k}:c`, `${k}:g`, { execution: unended })],
  endedNoCleanup: (k) => [row(`${k}-1`, k, k, `${k}:c`), row(`${k}-2`, `${k}:c`, `${k}:c`, `${k}:g`, { cleanupCompletedAt: undefined })],
  requesterOnly: (k) => [row(`${k}-1`, "agent:makaron:other", k, `${k}:c`, { execution: unended })],
  controllerOnly: (k) => [row(`${k}-1`, k, "agent:makaron:other", `${k}:c`, { execution: unended })],
  noControllerColumn: (k) => [row(`${k}-1`, null, k, `${k}:c`)],
  // the latest generation moved to another requester: the walk must not descend through the old one
  laterGenerationElsewhere: (k) => [row(`${k}-1`, k, k, `${k}:c`, { generation: 1 }), row(`${k}-2`, "agent:makaron:other", "agent:makaron:other", `${k}:c`, { generation: 2, createdAt: at + 5 }), row(`${k}-3`, `${k}:c`, `${k}:c`, `${k}:g`, { execution: unended })],
  sameStartTime: (k) => [row(`${k}-b`, k, k, `${k}:c2`), row(`${k}-a`, k, k, `${k}:c1`)],
  cycle: (k) => [row(`${k}-1`, k, k, `${k}:c`), row(`${k}-2`, `${k}:c`, `${k}:c`, k)],
  notCanonical: (k) => [row(`${k}-1`, k, k, `${k}:c`), { run_id: `${k}-2`, child_session_key: `${k}:bad`, controller_session_key: k, requester_session_key: k, created_at: at, payload_json: "{}" }],
  aboveBudget: (k) => Array.from({ length: 260 }, (_, i) => row(`${k}-${i}`, k, k, `${k}:c${i}`)),
  closureAboveBudget: (k) => [row(`${k}-root`, k, k, `${k}:c`), ...Array.from({ length: 1030 }, (_, i) => row(`${k}-${i}`, `${k}:c`, `${k}:c`, `${k}:g${i}`))],
};
async function injected(shape) {
  const results = {};
  for (const [name, make] of Object.entries(CASES)) {
    const key = `agent:makaron:ab-${shape}-${name}`;
    db.exec("BEGIN");
    for (const r of make(key)) put(r);
    db.exec("COMMIT");
    await sleep(SETTLE);
    if (shape === "gateway") { const fresher = store.n(); for (const [id, entry] of fresher) if (id.startsWith(key)) memory.set(id, entry); }
    results[name] = compare(key);
    // with the whole-registry cache cold, how long the scoped call takes on its own
    await sleep(SETTLE);
    results[name].coldOnMs = answers(key, key.split(":")[1], true).ms;
  }
  // in memory only, or in memory ahead of its row
  const memKey = `agent:makaron:ab-${shape}-memory`;
  const inMem = (id, change = {}, requester = memKey, child = `${memKey}:c`) => memory.set(id, payload(id, memKey, requester, child, change));
  inMem(`${memKey}-1`, { execution: unended });
  inMem(`${memKey}-2`, {}, `${memKey}:c`, `${memKey}:g`);
  await sleep(SETTLE);
  results.inMemoryOnly = compare(memKey);
  const aheadKey = `agent:makaron:ab-${shape}-ahead`;
  db.exec("BEGIN");
  put(row(`${aheadKey}-1`, aheadKey, aheadKey, `${aheadKey}:c`));
  db.exec("COMMIT");
  memory.set(`${aheadKey}-1`, payload(`${aheadKey}-1`, aheadKey, aheadKey, `${aheadKey}:c`, { execution: unended }));
  await sleep(SETTLE);
  results.memoryAheadOfRow = compare(aheadKey);
  // a run that is the key's only in memory: the row still says another requester
  const movedKey = `agent:makaron:ab-${shape}-moved`;
  db.exec("BEGIN");
  put(row(`${movedKey}-1`, "agent:makaron:other", "agent:makaron:other", `${movedKey}:c`));
  db.exec("COMMIT");
  memory.set(`${movedKey}-1`, payload(`${movedKey}-1`, movedKey, movedKey, `${movedKey}:c`));
  await sleep(SETTLE);
  results.memoryMovedToKey = compare(movedKey);
  for (const id of [...memory.keys()]) if (id.includes(`ab-${shape}-`)) memory.delete(id);
  return results;
}

// ---- shapes ----
for (const shape of ["reader", "gateway"]) {
  if (shape === "gateway") for (const [id, entry] of store.n()) memory.set(id, entry);
  const real = sampled.map((key) => compare(key));
  await sleep(SETTLE);
  const wrongAgent = keys.slice(0, 40).map((key) => compare(key, "some-other-agent"));
  const inj = await injected(shape);
  out.shapes[shape] = { memory: memory.size, real: summary(real), wrongAgent: summary(wrongAgent), injected: Object.fromEntries(Object.entries(inj).map(([k, r]) => [k, { same: r.same, n: r.n, coldOnMs: r.coldOnMs === undefined ? undefined : +r.coldOnMs.toFixed(1) }])) };
  console.log(JSON.stringify({ shape, ...out.shapes[shape] }));
  assert.equal(out.shapes[shape].real.mismatches, 0, `${shape}: ${real.find((x) => !x.same)?.key}`);
  assert.equal(out.shapes[shape].wrongAgent.mismatches, 0);
  for (const [name, r] of Object.entries(inj)) assert(r.same, `${shape} ${name}`);
  // these must really have been read: a comparison of two empty answers proves nothing
  for (const name of ["settledTree", "runningChild", "requesterOnly", "controllerOnly", "noControllerColumn", "inMemoryOnly", "memoryAheadOfRow", "memoryMovedToKey"]) assert(inj[name].n > 0, `${shape} ${name} found no run`);
}
// the budget cases must really decline and read the whole registry; the small tree must not
assert(out.shapes.reader.injected.aboveBudget.coldOnMs > 200, "above budget took the whole registry");
assert(out.shapes.reader.injected.closureAboveBudget.coldOnMs > 200, "a closure above budget took the whole registry");
assert(out.shapes.reader.injected.settledTree.coldOnMs < 100, "a small tree read the whole registry");
memory.clear();

// ---- tasks ----
const TASK_SWITCH = "OPENCLAW_V_HARNESS_TASKS_BY_OWNER";
const taskRuntime = (key, runtimeId = "subagent", taskKind = "codex-native", runIdPrefix = "codex-thread:") => createAgentHarnessTaskRuntime({ runtime: runtimeId, ...(taskKind ? { taskKind } : {}), ...(runIdPrefix ? { runIdPrefix } : {}), scope: createScope({ requesterSessionKey: key }) });
const listBoth = (rt) => {
  process.env[TASK_SWITCH] = "0";
  const started = performance.now();
  const off = rt.listTaskRecords();
  const offMs = performance.now() - started;
  process.env[TASK_SWITCH] = "1";
  const startedOn = performance.now();
  const on = rt.listTaskRecords();
  const onMs = performance.now() - startedOn;
  return { same: JSON.stringify(off) === JSON.stringify(on), n: off.length, offMs, onMs };
};
const allOwners = [...new Set(tasks.map((t) => t.owner_key).filter(Boolean))];
// Every owner against one whole list: the index and a filter must hold the same tasks in the same order.
const whole = registry.E();
const byOwner = new Map();
for (const task of whole) { let list = byOwner.get(task.ownerKey); if (!list) byOwner.set(task.ownerKey, list = []); list.push(task); }
const indexMismatch = allOwners.filter((key) => JSON.stringify(byOwner.get(key) ?? []) !== JSON.stringify(registry.A(key)));
out.tasksEveryOwner = { owners: allOwners.length, tasks: whole.length, mismatches: indexMismatch.length };
assert.equal(indexMismatch.length, 0, `owner index: ${indexMismatch[0]}`);
// The real wrapper with each switch: the list-everything side is 22,000 clones, so a sample of owners.
const ownersByCount = [...byOwner.entries()].sort((a, b) => b[1].length - a[1].length).map(([key]) => key).filter(Boolean);
const OWNER_SAMPLE = Number(process.env.OWNER_SAMPLE ?? 200);
const ownerStep = Math.max(1, Math.floor(ownersByCount.length / OWNER_SAMPLE));
const owners = [...new Set([...ownersByCount.slice(0, 30), ...ownersByCount.filter((_, i) => i % ownerStep === 0)])];
const shapes =[["subagent", "codex-native", "codex-thread:"], ["subagent", null, null], ["cli", "exec", null], ["cli", null, null], ["cron", null, null]];
const taskRows = owners.flatMap((key) => shapes.map((s) => ({ key, ...listBoth(taskRuntime(key, ...s)) })));
out.tasks = { owners: owners.length, comparisons: taskRows.length, mismatches: taskRows.filter((x) => !x.same).length, withTasks: taskRows.filter((x) => x.n > 0).length, offP50Ms: +p(taskRows.map((x) => x.offMs), 0.5).toFixed(1), onP50Ms: +p(taskRows.map((x) => x.onMs), 0.5).toFixed(3), onMaxMs: +Math.max(...taskRows.map((x) => x.onMs)).toFixed(2) };
assert.equal(out.tasks.mismatches, 0, `tasks: ${taskRows.find((x) => !x.same)?.key}`);

// created, updated and finished through the runtime, as the monitor does; order across a same-millisecond tie is recorded
const mutateKey = "agent:makaron:ab-task-mutation";
const rt = taskRuntime(mutateKey);
const made = [];
for (let i = 0; i < 6; i += 1) made.push(rt.createRunningTaskRun({ runId: `codex-thread:${mutateKey}-${i}`, childSessionKey: `${mutateKey}:c${i}`, task: `task ${i}`, label: `label ${i}`, sourceId: `${mutateKey}-${i}`, startedAt: at, deliveryStatus: "pending", notifyPolicy: "silent" }));
const afterCreate = listBoth(rt);
rt.recordTaskRunProgressByRunId({ runId: `codex-thread:${mutateKey}-2`, lastEventAt: Date.now(), progressSummary: "progress" });
const afterProgress = listBoth(rt);
rt.finalizeTaskRunByRunId({ runId: `codex-thread:${mutateKey}-3`, status: "succeeded", endedAt: Date.now(), lastEventAt: Date.now(), terminalSummary: "done" });
const afterFinal = listBoth(rt);
out.taskMutation = { created: made.length, n: afterFinal.n, afterCreate: afterCreate.same, afterProgress: afterProgress.same, afterFinal: afterFinal.same };
assert.equal(afterFinal.n, 6);
assert(afterCreate.same && afterProgress.same && afterFinal.same, "task mutation order");

console.log(JSON.stringify(out, null, 1));
if (process.env.RESULT_FILE) fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify(out, null, 1));
process.exit(0);
