import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { MARKERS, SYMBOL_KEYS, TASK_REGISTRY_BRIDGE } from "../apps/v-session-relay/plugin/core/contracts.js";
import {
  BRIDGE_ANCHOR,
  BRIDGE_INIT,
  BRIDGE_MARKER,
  BRIDGE_SYMBOL_KEY,
  EXTRA_ROWS,
  FILE,
  MARKER,
  RETURN_ANCHOR,
  patchTaskBridgeExtraSources,
} from "../lab/release-files/task-bridge-extra-sources/patch.mjs";

// The bytes V runs (captured 2026-10-20, verified unchanged on V the same day); the patch is
// generated from these, never from an upstream copy (release-artifact-rebase-trap).
const V_SOURCE = new URL(`../release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist/${FILE}`, import.meta.url);
const GENERATED = new URL(`../lab/release-files/task-bridge-extra-sources/generated/${FILE}`, import.meta.url);
const MANIFEST = new URL("../lab/release-files/task-bridge-extra-sources/manifest.json", import.meta.url);
const V_BYTES = new URL("./fixtures/inter-session-v-bytes.json", import.meta.url);

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const count = (haystack, needle) => haystack.split(needle).length - 1;
const vSource = () => fs.readFileSync(V_SOURCE, "utf8");
const generated = () => fs.readFileSync(GENERATED, "utf8");

test("the committed file is exactly the patch of the bytes V runs", () => {
  const entry = JSON.parse(fs.readFileSync(V_BYTES, "utf8")).files.find((f) => f.file === FILE);
  assert.equal(sha256(vSource()), entry.sha256, "the capture is the file V runs (inter-session-v-bytes.json)");
  assert.equal(patchTaskBridgeExtraSources(vSource()), generated());
  execFileSync(process.execPath, ["--check", GENERATED.pathname]);
});

test("manifest records V's bytes before and the generated file after", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  assert.deepEqual(manifest, [{
    component: "core",
    path: FILE,
    source: `lab/release-files/task-bridge-extra-sources/generated/${FILE}`,
    target: `openclaw/dist/${FILE}`,
    hostPath: `/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/${FILE}`,
    before: sha256(vSource()),
    after: sha256(generated()),
  }]);
});

test("names and literals agree with the frozen contracts", () => {
  assert.equal(MARKER, MARKERS.taskBridgeExtraSources);
  assert.equal(BRIDGE_SYMBOL_KEY, SYMBOL_KEYS.taskRegistryBridge);
  assert.equal(Symbol.for(BRIDGE_SYMBOL_KEY), TASK_REGISTRY_BRIDGE);
  const out = generated();
  assert.equal(count(out, `Symbol.for("${SYMBOL_KEYS.taskRegistryBridge}")`), 1, "the bridge is the contract's global");
  assert.match(out, /vTaskRegistryBridge\.extraSources \?\?= new Set\(\);/u, "extraSources is a Set, as contracts.js documents");
});

test("anchors are unique in V's bytes, the marker appears once, V's bridge marker stays", () => {
  const src = vSource();
  assert.equal(count(src, BRIDGE_ANCHOR), 1);
  assert.equal(count(src, RETURN_ANCHOR), 1);
  assert.equal(count(src, "return active;"), 1, "listActive has one return");
  assert.equal(count(src, MARKER), 0);
  const out = generated();
  assert.equal(count(out, MARKER), 1);
  assert.equal(count(out, `// ${BRIDGE_MARKER}`), 1, "the existing bridge patch is kept as V runs it");
});

test("the patch only adds the init line and the extra-rows block", () => {
  const out = generated();
  assert.equal(out.replace(BRIDGE_INIT, "").replace(EXTRA_ROWS, ""), vSource());
  // The init sits right after the bridge object; the rows come last, just before listActive returns.
  assert.ok(out.includes(`${BRIDGE_ANCHOR}${BRIDGE_INIT}`));
  const listActive = out.slice(out.indexOf("vTaskRegistryBridge.listActive = (sessionKey) => {"), out.indexOf("function vTaskRegistryBridgeNotify(event) {"));
  assert.ok(listActive.includes(`${EXTRA_ROWS}\treturn active;\n};\n`));
  assert.ok(listActive.indexOf(EXTRA_ROWS) > listActive.indexOf("listActiveSubagentsPersisted(key)"), "after the persisted subagent rows");
});

test("patching twice, or a file whose anchors moved, is refused", () => {
  assert.throws(() => patchTaskBridgeExtraSources(generated()), /already patched/u);
  assert.throws(() => patchTaskBridgeExtraSources("const x = 1;"), /v-task-registry-bridge-v1 must be present exactly once/u);
  assert.throws(() => patchTaskBridgeExtraSources(vSource().replace(RETURN_ANCHOR, "\treturn active ;\n};\n")), /listActive return: expected exactly one anchor, found 0/u);
  assert.throws(() => patchTaskBridgeExtraSources(vSource().replace(BRIDGE_ANCHOR, "")), /task registry bridge object: expected exactly one anchor, found 0/u);
});

// ---- the patched bridge, evaluated against a registry-shaped fixture ----

/** Evaluates the generated bridge region (object, listActive, notify) in a fresh context. */
function loadBridge({ preexisting } = {}) {
  const out = generated();
  const start = out.indexOf(`// ${BRIDGE_MARKER}`);
  const notify = out.indexOf("function vTaskRegistryBridgeNotify(event) {");
  const end = out.indexOf("\n}\n", notify) + 3;
  assert.ok(start > 0 && notify > start && end > notify);
  const context = vm.createContext({ queueMicrotask });
  if (preexisting) vm.runInContext(preexisting, context);
  vm.runInContext(`
    const tasks = new Map();
    const taskIdsByRelatedSessionKey = new Map();
    const isTerminalTaskStatus = (s) => ["succeeded", "failed", "timed_out", "cancelled", "lost"].includes(s);
    ${out.slice(start, end)}
    globalThis.fixture = {
      put(task) {
        tasks.set(task.taskId, task);
        for (const k of [task.ownerKey, task.requesterSessionKey, task.childSessionKey].filter(Boolean)) {
          if (!taskIdsByRelatedSessionKey.has(k)) taskIdsByRelatedSessionKey.set(k, new Set());
          taskIdsByRelatedSessionKey.get(k).add(task.taskId);
        }
      },
      bridge: globalThis[Symbol.for("${BRIDGE_SYMBOL_KEY}")],
    };
  `, context);
  return context.fixture;
}

const KEY = "agent:main:feishu:direct:ou_abc";
const ids = (rows) => Array.from(rows, (row) => row.taskId);
/** A row as the v-session-relay plugin provides it (design §3.5). */
const relayRow = (sendId, extra = {}) => ({
  taskId: `v-a2a:${sendId}`,
  runtime: "session",
  taskKind: "sessions_send",
  label: "「任务群 a」#7F3A",
  status: "running",
  runId: `v-a2a-req-${sendId}-0`,
  childSessionKey: "agent:main:feishu:group:oc_room",
  createdAt: 1,
  ...extra,
});

test("listActive returns the rows of an extra source after the registry's own tasks", () => {
  const core = loadBridge();
  assert.ok(core.bridge.extraSources instanceof core.bridge.listeners.constructor, "the chunk creates extraSources as a Set");
  core.put({ taskId: "exec-1", runtime: "cli", taskKind: "exec", status: "running", ownerKey: KEY, requesterSessionKey: KEY });
  const asked = [];
  core.bridge.extraSources.add((sessionKey) => {
    asked.push(sessionKey);
    return sessionKey === KEY ? [relayRow("s_mgk3x1a2f9c1d2e3f4a5"), relayRow("s_mgk3x1a2f9aabbccddee", { status: "queued" })] : [];
  });
  const rows = core.bridge.listActive(`  ${KEY} `);
  assert.deepEqual(ids(rows), ["exec-1", "v-a2a:s_mgk3x1a2f9c1d2e3f4a5", "v-a2a:s_mgk3x1a2f9aabbccddee"]);
  assert.deepEqual(asked, [KEY], "a source gets the trimmed session key");
  assert.equal(rows[1].taskKind, "sessions_send");
  assert.equal(rows[2].status, "queued");
  assert.deepEqual(ids(core.bridge.listActive("agent:main:feishu:group:oc_room")), [], "rows belong to the session the source names");
  assert.deepEqual(ids(core.bridge.listActive("  ")), [], "an empty key asks no source");
  assert.deepEqual(asked, [KEY, "agent:main:feishu:group:oc_room"]);
});

test("a throwing or malformed source does not break listActive or the other sources", () => {
  const core = loadBridge();
  core.put({ taskId: "sub-1", runtime: "subagent", status: "running", ownerKey: KEY, requesterSessionKey: KEY });
  core.bridge.extraSources.add(() => { throw new Error("ledger index not ready"); });
  core.bridge.extraSources.add(() => 42); // not iterable
  core.bridge.extraSources.add("not a function");
  core.bridge.extraSources.add(function* halfway() { // throws while being iterated: its rows are dropped
    yield relayRow("s_mgk3x1a2f9000000000a");
    throw new Error("boom");
  });
  core.bridge.extraSources.add(() => null);
  core.bridge.extraSources.add(() => [relayRow("s_mgk3x1a2f9111111111b")]);
  assert.deepEqual(ids(core.bridge.listActive(KEY)), ["sub-1", "v-a2a:s_mgk3x1a2f9111111111b"]);
});

test("rows without a taskId are skipped and a taskId is listed once", () => {
  const core = loadBridge();
  core.put({ taskId: "exec-1", runtime: "cli", taskKind: "exec", status: "running", ownerKey: KEY, requesterSessionKey: KEY });
  const row = relayRow("s_mgk3x1a2f9c1d2e3f4a5");
  // e.g. register() runs three times in one Gateway (probe F-b) and each run adds its own closure.
  core.bridge.extraSources.add(() => [row, null, {}, { taskId: "" }]);
  core.bridge.extraSources.add(() => [{ ...row }]);
  core.bridge.extraSources.add(() => [{ taskId: "exec-1", runtime: "session", taskKind: "sessions_send" }]);
  assert.deepEqual(ids(core.bridge.listActive(KEY)), ["exec-1", "v-a2a:s_mgk3x1a2f9c1d2e3f4a5"]);
  assert.equal(core.bridge.listActive(KEY)[0].runtime, "cli", "a registry task wins over a source row with its id");
});

test("a source removed from the set stops contributing", () => {
  const core = loadBridge();
  const source = () => [relayRow("s_mgk3x1a2f9c1d2e3f4a5")];
  core.bridge.extraSources.add(source);
  assert.equal(core.bridge.listActive(KEY).length, 1);
  core.bridge.extraSources.delete(source);
  assert.equal(core.bridge.listActive(KEY).length, 0);
});

test("a bridge the plugin created before the chunk loaded keeps its set and sources", () => {
  const core = loadBridge({
    preexisting: `
      const b = (globalThis[Symbol.for("${BRIDGE_SYMBOL_KEY}")] ??= { listeners: new Set() });
      (b.extraSources ??= new Set()).add(() => [{ taskId: "v-a2a:s_mgk3x1a2f9c1d2e3f4a5", runtime: "session", taskKind: "sessions_send", status: "running" }]);
      globalThis.pluginSet = b.extraSources;
    `,
  });
  assert.equal(core.bridge.extraSources.size, 1);
  assert.deepEqual(ids(core.bridge.listActive(KEY)), ["v-a2a:s_mgk3x1a2f9c1d2e3f4a5"]);
});

test("an array of sources works too, and a non-iterable extraSources only drops the extra rows", () => {
  const core = loadBridge();
  core.put({ taskId: "exec-1", runtime: "cli", taskKind: "exec", status: "running", ownerKey: KEY, requesterSessionKey: KEY });
  core.bridge.extraSources = [() => [relayRow("s_mgk3x1a2f9c1d2e3f4a5")]];
  assert.deepEqual(ids(core.bridge.listActive(KEY)), ["exec-1", "v-a2a:s_mgk3x1a2f9c1d2e3f4a5"]);
  core.bridge.extraSources = 7;
  assert.deepEqual(ids(core.bridge.listActive(KEY)), ["exec-1"]);
});

test("the persisted rows of V's bridge still work beside the extra sources", () => {
  const core = loadBridge();
  const now = Date.now();
  core.bridge.listActivePersisted = () => [{ taskId: "worker-exec", runtime: "cli", taskKind: "exec", status: "running", createdAt: now }];
  core.bridge.listActiveSubagentsPersisted = () => [{ taskId: "subagent-run:r2", runId: "r2", runtime: "subagent", childSessionKey: "agent:main:subagent:b", status: "running" }];
  core.bridge.extraSources.add(() => [relayRow("s_mgk3x1a2f9c1d2e3f4a5"), { taskId: "worker-exec", runtime: "session" }]);
  assert.deepEqual(ids(core.bridge.listActive(KEY)), ["worker-exec", "subagent-run:r2", "v-a2a:s_mgk3x1a2f9c1d2e3f4a5"]);
});
