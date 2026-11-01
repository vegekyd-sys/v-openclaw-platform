// subagent-active-precheck A/B (see lab/subagent-active-precheck.md).
//
// Data: V's subagent_runs topology, read-only export kept outside the repository (FIXTURE on the VLab
// host, gzipped JSON of the table's rows with task, label and origin fields removed from the payload).
// It goes into this run's private state database. buildActiveSubagentSystemPromptAddition is exported
// from a copy of the release chunk and called with the precheck on and off, on real keys and on injected
// cases; the two results must be the same text. The switch only skips the original code, so "off" is
// V's behaviour.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE = process.env.FIXTURE ?? "/var/tmp/sap-20261101/topo.json.gz";
const SAMPLE = Number(process.env.SAMPLE ?? 300);
const NAME = "history-image-prune-Dg0CDQ4a.js";
const copy = path.join(DIST, "history-image-prune-ab.js");
fs.writeFileSync(copy, `${fs.readFileSync(path.join(DIST, NAME), "utf8")}\nexport { buildActiveSubagentSystemPromptAddition as __ab };\n`);
const { __ab: build } = await import(copy);
const stateDb = fs.readdirSync(DIST).find((f) => /^openclaw-state-db-Bh3Bq87y\.js$/u.test(f));
const { i: openState } = await import(path.join(DIST, stateDb));
const store = await import(path.join(DIST, "subagent-registry.store.sqlite-hzGu4QSk.js"));
const memory = store.w;
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const { db } = openState();

const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(FIXTURE)));
const columns = Object.keys(rows[0]);
const insert = db.prepare(`INSERT OR REPLACE INTO subagent_runs (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
const put = (row) => insert.run(...columns.map((c) => row[c]));
db.exec("BEGIN");
for (const r of rows) put(r);
db.exec("COMMIT");

const call = (key, on) => {
  process.env.OPENCLAW_V_SUBAGENT_ACTIVE_PRECHECK = on ? "1" : "0";
  const started = performance.now();
  const value = build({ cfg, controllerSessionKey: key, controllerAgentId: key.split(":")[1] ?? "makaron", hasSessionsYield: true });
  return { value, ms: performance.now() - started };
};
const compare = (key) => {
  const a = call(key, false);
  const b = call(key, true);
  return { key, same: a.value === b.value, active: a.value !== undefined, offMs: a.ms, onMs: b.ms };
};
const p = (list, q) => [...list].sort((x, y) => x - y)[Math.floor((list.length - 1) * q)];
const summary = (list) => ({ n: list.length, mismatches: list.filter((x) => !x.same).length, withAddition: list.filter((x) => x.active).length, offP50Ms: Math.round(p(list.map((x) => x.offMs), 0.5)), onP50Ms: +p(list.map((x) => x.onMs), 0.5).toFixed(2), onMaxMs: +Math.max(...list.map((x) => x.onMs)).toFixed(2) });

const keys = [...new Set(rows.flatMap((r) => [r.controller_session_key, r.requester_session_key]).filter(Boolean))];
const step = Math.max(1, Math.floor(keys.length / SAMPLE));
const real = keys.filter((_, i) => i % step === 0).map(compare);
const out = { rows: rows.length, distinctKeys: keys.length, real: summary(real) };

// injected: a two-level tree under a fresh root, then one thing unsettled at a time
const template = JSON.parse(rows.find((r) => JSON.parse(r.payload_json).execution?.status === "terminal").payload_json);
const row = (id, controller, requester, child, change = {}) => {
  const payload = structuredClone(template);
  Object.assign(payload, { runId: id, controllerSessionKey: controller, requesterSessionKey: requester, childSessionKey: child, task: `task ${id}`, ...fresh }, change);
  return { run_id: id, child_session_key: child, controller_session_key: controller, requester_session_key: requester, created_at: Date.now(), payload_json: JSON.stringify(payload) };
};
const fresh = { createdAt: Date.now(), sessionStartedAt: Date.now() };
const unended = { ...template.execution, status: "running", startedAt: Date.now() };
delete unended.endedAt;
const cases = {
  settledTree: (k) => [row(`${k}-1`, k, k, `${k}:c`), row(`${k}-2`, `${k}:c`, `${k}:c`, `${k}:g`)],
  runningChild: (k) => [row(`${k}-1`, k, k, `${k}:c`, { execution: unended })],
  runningGrandchild: (k) => [row(`${k}-1`, k, k, `${k}:c`), row(`${k}-2`, `${k}:c`, `${k}:c`, `${k}:g`, { execution: unended })],
  endedNoCleanup: (k) => [row(`${k}-1`, k, k, `${k}:c`), row(`${k}-2`, `${k}:c`, `${k}:c`, `${k}:g`, { cleanupCompletedAt: undefined })],
  requesterOnly: (k) => [row(`${k}-1`, "agent:makaron:other", k, `${k}:c`, { execution: unended })],
  controllerOnly: (k) => [row(`${k}-1`, k, "agent:makaron:other", `${k}:c`, { execution: unended })],
};
out.injected = {};
for (const [name, make] of Object.entries(cases)) {
  const key = `agent:makaron:ab-${name}`;
  db.exec("BEGIN");
  for (const r of make(key)) put(r);
  db.exec("COMMIT");
  await new Promise((resolve) => setTimeout(resolve, 600));
  const r = compare(key);
  out.injected[name] = { same: r.same, withAddition: r.active };
}
const memKey = "agent:makaron:ab-memory";
await new Promise((resolve) => setTimeout(resolve, 600));
memory.set(`${memKey}-1`, { ...structuredClone(template), runId: `${memKey}-1`, controllerSessionKey: memKey, requesterSessionKey: memKey, childSessionKey: `${memKey}:c`, task: "in memory", ...fresh, execution: unended });
const m = compare(memKey);
out.injected.inMemoryOnly = { same: m.same, withAddition: m.active };
memory.delete(`${memKey}-1`);

console.log(JSON.stringify(out, null, 1));
assert.equal(out.real.mismatches, 0);
for (const [name, result] of Object.entries(out.injected)) {
  assert(result.same, name);
  assert.equal(result.withAddition, name !== "settledTree", name);
}
