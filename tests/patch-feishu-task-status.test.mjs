import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import {
  feishuBackgroundTasks,
  feishuTaskStatusElement,
  feishuTaskStatusKind,
  renderFeishuTaskStatusLine,
} from "../lab/release-files/feishu-task-status/feishu-task-status-render.mjs";
import {
  BRIDGE_SYMBOL,
  CORE_MARKER,
  CORE_PRELUDE,
  FEISHU_GLUE,
  FEISHU_MARKER,
  inlineRenderModule,
  PERSISTED_STALE_MS,
  STORE_MARKER,
  patchFeishuTaskStatus,
  patchTaskRegistryCore,
  patchTaskRegistryStore,
} from "../lab/release-files/feishu-task-status/patch-feishu-task-status.mjs";

// Byte-identical to production V on 2026-10-02 (sha256 4d3ea59b… / 65d88753…).
const LIVE_MONITOR = new URL(
  "../release/captured/v2026.9.1-db91.6-vcodex-sol61-20260930.feishu/dist/dist/monitor.account-WFdlCDhR.js",
  import.meta.url,
);
const LIVE_STORE = new URL(
  "../lab/release-files/feishu-task-status/base/task-registry.store.sqlite-paxOzi9K.js",
  import.meta.url,
);
const LIVE_CORE = new URL(
  "../lab/release-files/feishu-task-status/base/task-registry-activity-DSlVVJwD.js",
  import.meta.url,
);

test("names each kind of background work", () => {
  assert.equal(feishuTaskStatusKind({ runtime: "subagent", taskKind: "codex-native" }), "子 agent");
  assert.equal(feishuTaskStatusKind({ runtime: "subagent" }), "子 agent");
  assert.equal(feishuTaskStatusKind({ runtime: "acp" }), "子 agent");
  assert.equal(feishuTaskStatusKind({ runtime: "cli", taskKind: "exec" }), "后台命令");
  assert.equal(feishuTaskStatusKind({ runtime: "cli", taskKind: "image_generation" }), "生图");
  assert.equal(feishuTaskStatusKind({ runtime: "cron", taskKind: "automation_run" }), "自动化");
  assert.equal(feishuTaskStatusKind({ runtime: "cli" }), "后台任务");
});

test("the session's own run is not background work", () => {
  const key = "agent:makaron:feishu:group:oc_x";
  const tasks = [
    { taskId: "turn", runtime: "cli", childSessionKey: key },
    { taskId: "image", runtime: "cli", taskKind: "image_generation", childSessionKey: key },
    { taskId: "child", runtime: "subagent", childSessionKey: "agent:makaron:subagent:1" },
    { taskId: "cmd", runtime: "cli", taskKind: "exec" },
  ];
  assert.deepEqual(feishuBackgroundTasks(tasks, key).map((t) => t.taskId), ["image", "child", "cmd"]);
});

test("renders a count, the kinds, and a closing line", () => {
  assert.equal(renderFeishuTaskStatusLine([]), "");
  assert.equal(renderFeishuTaskStatusLine([], { shownActive: true }), "☑️ 后台任务已结束");
  assert.equal(renderFeishuTaskStatusLine([{ runtime: "subagent" }]), "⏳ 后台 1 项进行中 · 子 agent");
  assert.equal(
    renderFeishuTaskStatusLine([
      { runtime: "cli", taskKind: "exec" },
      { runtime: "subagent" },
      { runtime: "subagent", taskKind: "codex-native" },
    ]),
    "⏳ 后台 3 项进行中 · 子 agent 2 · 后台命令 1",
  );
  assert.deepEqual(feishuTaskStatusElement("⏳ x"), {
    tag: "markdown", element_id: "v_bg_tasks", text_size: "notation", content: "<font color='grey'>⏳ x</font>",
  });
});

test("patches the live V core and monitor exactly once", () => {
  const core = readFileSync(LIVE_CORE, "utf8");
  const patchedCore = patchTaskRegistryCore(core);
  assert.equal(patchedCore.changed, true);
  assert.ok(patchedCore.source.includes(CORE_MARKER));
  assert.equal(patchTaskRegistryCore(patchedCore.source).changed, false);

  const monitor = readFileSync(LIVE_MONITOR, "utf8");
  const patched = patchFeishuTaskStatus(monitor);
  assert.equal(patched.changed, true);
  assert.ok(patched.source.includes(FEISHU_MARKER));
  assert.ok(patched.source.includes("vTaskStatusAttach(params.sessionKey, session, (message)"));
  assert.ok(patched.source.includes("vTaskStatusClosing(streamingToClose);\n\t\t\t\t\t\tclosed = await streamingToClose.closeWithResult(text, { note: finalNote });"));
  assert.equal(patchFeishuTaskStatus(patched.source).changed, false);
  // Must coexist with the patches already on V.
  assert.ok(patched.source.includes("v-feishu-progress-stream-v2"));
  assert.ok(patched.source.includes("installFeishuAskStream(FeishuStreamingSession"));
});

test("patches the live V task store once and answers by the owner_key index", () => {
  const store = readFileSync(LIVE_STORE, "utf8");
  const patched = patchTaskRegistryStore(store);
  assert.equal(patched.changed, true);
  assert.ok(patched.source.includes(STORE_MARKER));
  assert.equal(patchTaskRegistryStore(patched.source).changed, false);
  assert.match(patched.source, /FROM task_runs\s+WHERE owner_key = \?/u);
  assert.doesNotMatch(patched.source.slice(patched.source.indexOf(STORE_MARKER)), /NOT INDEXED/u);
  assert.match(patched.source, /FROM subagent_runs\s+WHERE requester_session_key = \? AND created_at >= \?/u);
});

test("refuses a bundle whose anchors moved", () => {
  assert.throws(() => patchFeishuTaskStatus("const x = 1;"), /expected 1 match, found 0/);
  assert.throws(() => patchTaskRegistryCore("const x = 1;"), /expected 1 match, found 0/);
  assert.throws(() => patchTaskRegistryStore("const x = 1;"), /missing/);
});

// ---- core bridge, evaluated against a registry-shaped fixture ----
function loadCore() {
  const patched = patchTaskRegistryCore(readFileSync(LIVE_CORE, "utf8")).source;
  const start = patched.indexOf(`// ${CORE_MARKER}`);
  const emitStart = patched.indexOf("function emitTaskRegistryObserverEvent(createEvent) {");
  const emitEnd = patched.indexOf("\n}\n", emitStart) + 3;
  assert.ok(start > 0 && emitStart > 0);
  const context = vm.createContext({ queueMicrotask, Symbol, Set, Map });
  vm.runInContext(`
    const tasks = new Map();
    const taskIdsByRelatedSessionKey = new Map();
    const isTerminalTaskStatus = (s) => ["succeeded", "failed", "timed_out", "cancelled", "lost"].includes(s);
    let observer = null;
    const getTaskRegistryObservers = () => observer;
    const taskRegistryLog = { warn() {} };
    ${CORE_PRELUDE}
    ${patched.slice(emitStart, emitEnd)}
    globalThis.fixture = {
      put(task) {
        tasks.set(task.taskId, task);
        for (const k of [task.ownerKey, task.childSessionKey].filter(Boolean)) {
          if (!taskIdsByRelatedSessionKey.has(k)) taskIdsByRelatedSessionKey.set(k, new Set());
          taskIdsByRelatedSessionKey.get(k).add(task.taskId);
        }
        emitTaskRegistryObserverEvent(() => ({ kind: "upserted", task }));
      },
      setObserver(o) { observer = o; },
      setPersisted(rows) { globalThis[Symbol.for("${BRIDGE_SYMBOL}")].listActivePersisted = () => rows; },
      setPersistedSubagents(rows) { globalThis[Symbol.for("${BRIDGE_SYMBOL}")].listActiveSubagentsPersisted = () => rows; },
      bridge: globalThis[Symbol.for("${BRIDGE_SYMBOL}")],
    };
  `, context);
  return context.fixture;
}

test("core bridge lists only a session's own active tasks and keeps the Gateway observer", async () => {
  const core = loadCore();
  const seen = [];
  const observed = [];
  core.setObserver({ onEvent: (event) => observed.push(event.kind) });
  core.bridge.listeners.add((notice) => seen.push(notice));
  const parent = "agent:makaron:feishu:group:oc_x";
  core.put({ taskId: "a", runtime: "subagent", taskKind: "codex-native", status: "running", ownerKey: parent, requesterSessionKey: parent, childSessionKey: "agent:makaron:subagent:1" });
  core.put({ taskId: "b", runtime: "cli", taskKind: "exec", status: "succeeded", ownerKey: parent, requesterSessionKey: parent });
  core.put({ taskId: "c", runtime: "cli", taskKind: "exec", status: "running", ownerKey: "agent:makaron:subagent:1", requesterSessionKey: "agent:makaron:subagent:1" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(Array.from(core.bridge.listActive(parent), (task) => task.taskId), ["a"]);
  // The child's own work belongs to the child, not to the parent conversation.
  assert.deepEqual(Array.from(core.bridge.listActive("agent:makaron:subagent:1"), (task) => task.taskId), ["c"]);
  assert.deepEqual(observed, ["upserted", "upserted", "upserted"]);
  assert.deepEqual(JSON.parse(JSON.stringify(seen[0])), { kind: "upserted", sessionKeys: [parent] });
});

test("core bridge adds work only other processes registered, and skips abandoned rows", () => {
  const core = loadCore();
  const key = "agent:makaron:feishu:group:oc_w";
  core.put({ taskId: "mem", runtime: "subagent", status: "running", ownerKey: key, requesterSessionKey: key });
  const now = Date.now();
  core.setPersisted([
    { taskId: "mem", runtime: "subagent", status: "running", createdAt: now },
    { taskId: "worker-exec", runtime: "cli", taskKind: "exec", status: "running", createdAt: now - 60_000, lastEventAt: now - 1_000 },
    { taskId: "abandoned", runtime: "subagent", status: "running", createdAt: now - PERSISTED_STALE_MS - 60_000 },
  ]);
  assert.deepEqual(Array.from(core.bridge.listActive(key), (t) => t.taskId), ["mem", "worker-exec"]);
  // A task this process knows as finished is not revived by a lagging row.
  core.put({ taskId: "mem", runtime: "subagent", status: "succeeded", ownerKey: key, requesterSessionKey: key });
  assert.deepEqual(Array.from(core.bridge.listActive(key), (t) => t.taskId), ["worker-exec"]);
});

test("core bridge counts a worker-spawned subagent once, from subagent_runs", () => {
  const core = loadCore();
  const key = "agent:makaron:feishu:group:oc_s";
  // claude-cli style: the subagent is also a task in this registry.
  core.put({ taskId: "t1", runId: "r1", runtime: "subagent", status: "running", ownerKey: key, requesterSessionKey: key, childSessionKey: "agent:makaron:subagent:a" });
  core.setPersisted([]);
  core.setPersistedSubagents([
    { taskId: "subagent-run:r1", runId: "r1", runtime: "subagent", childSessionKey: "agent:makaron:subagent:a", status: "running" },
    { taskId: "subagent-run:r2", runId: "r2", runtime: "subagent", childSessionKey: "agent:makaron:subagent:b", status: "running" },
  ]);
  assert.deepEqual(Array.from(core.bridge.listActive(key), (t) => t.taskId), ["t1", "subagent-run:r2"]);
  // Once this registry has finished the claude-cli subagent, its lagging run row does not revive it.
  core.put({ taskId: "t1", runId: "r1", runtime: "subagent", status: "succeeded", ownerKey: key, requesterSessionKey: key, childSessionKey: "agent:makaron:subagent:a" });
  assert.deepEqual(Array.from(core.bridge.listActive(key), (t) => t.taskId), ["subagent-run:r2"]);
});

test("core bridge notifies listeners even when the Gateway has no observer", async () => {
  const core = loadCore();
  const seen = [];
  core.bridge.listeners.add((notice) => seen.push(notice.kind));
  core.put({ taskId: "a", runtime: "subagent", status: "running", ownerKey: "s", requesterSessionKey: "s" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ["upserted"]);
});

// ---- Feishu glue, evaluated against a streaming-session double ----
function loadFeishu({ withBridge = true } = {}) {
  const writes = [];
  const fail = { next: 0 };
  const bridge = { listeners: new Set(), active: new Map() };
  bridge.listActive = (key) => bridge.active.get(key) ?? [];
  const context = vm.createContext({
    setTimeout, clearTimeout, Promise, JSON, Date, Map, Set, Symbol, String,
    writes,
    resolveApiBase: () => "https://open.feishu.cn/open-apis",
    getToken: async () => "t",
    getFeishuUserAgent: () => "ua",
    resolveAllowedHostnames: () => ["open.feishu.cn"],
    fetchWithSsrFGuard: async ({ url, init }) => {
      writes.push({ url, method: init.method, body: JSON.parse(init.body) });
      return { response: { ok: !(fail.next > 0 && fail.next--) }, release: async () => {} };
    },
    assertSuccessfulCardKitResponse: async (response) => { if (!response.ok) throw new Error("CardKit 500"); },
  });
  if (withBridge) vm.runInContext(`globalThis[Symbol.for("${BRIDGE_SYMBOL}")] = bridge`, Object.assign(context, { bridge }));
  vm.runInContext(`
    class FeishuStreamingSession {
      constructor(cardId) { this.queue = Promise.resolve(); this.closed = false; this.creds = {}; this.cardId = cardId; }
      async start() { this.state = { cardId: this.cardId, sequence: 1, hasNote: true }; }
      async closeWithResult(text, options) {
        this.closed = true;
        await this.queue;
        this.state.sequence += 1;
        writes.push({ url: "close:" + this.state.cardId, body: { note: options.note, sequence: this.state.sequence } });
        this.state = null;
        return { visibleReplySent: true };
      }
      async discard() { this.closed = true; this.state = null; return { visibleReplySent: false }; }
    }
    ${inlineRenderModule()}
    ${FEISHU_GLUE}
    globalThis.api = { FeishuStreamingSession, vTaskStatusAttach, vTaskStatusClosing, entries: vTaskStatusEntries };
  `, context);
  const notify = (sessionKey) => { for (const listener of bridge.listeners) listener({ kind: "upserted", sessionKeys: [sessionKey] }); };
  return { api: context.api, bridge, writes, notify, fail };
}

const settle = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms));
// The line's history on one card: what the reader saw, in order ("" = removed).
const lineWrites = (writes, cardId) => writes.filter((w) => w.url.includes(`/cards/${cardId}/elements`) && !w.url.endsWith("/content/content") && !w.url.endsWith("/elements/content")).map((w) => {
  if (w.method === "DELETE") return "";
  const element = w.method === "POST" ? JSON.parse(w.body.elements)[0] : JSON.parse(w.body.element);
  assert.equal(element.element_id, "v_bg_tasks");
  if (w.method === "POST") assert.equal(w.body.target_element_id, "content");
  return `${w.method} ${element.content.replace(/<\/?font[^>]*>/gu, "")}`;
});
const closeCard = (api, card, text) => { api.vTaskStatusClosing(card); return card.closeWithResult(text, { note: "Agent: V" }); };

test("a card shows its session's running work and keeps updating after it closes", async () => {
  const { api, bridge, writes, notify } = loadFeishu();
  const key = "agent:makaron:feishu:group:oc_x";
  const card = new api.FeishuStreamingSession("c1");
  await card.start();
  api.vTaskStatusAttach(key, card, () => {});
  await settle(50);
  assert.equal(lineWrites(writes, "c1").length, 0, "no work, no element");

  bridge.active.set(key, [{ runtime: "subagent", taskKind: "codex-native" }]);
  notify(key);
  await settle();
  assert.deepEqual(lineWrites(writes, "c1"), ["POST ⏳ 后台 1 项进行中 · 子 agent"]);

  // The turn ends while the subagent is still running; the line stays.
  await closeCard(api, card, "实验已启动");
  bridge.active.set(key, [{ runtime: "subagent" }, { runtime: "cli", taskKind: "exec" }]);
  notify(key);
  await settle();
  bridge.active.set(key, []);
  notify(key);
  await settle();
  assert.deepEqual(lineWrites(writes, "c1"), [
    "POST ⏳ 后台 1 项进行中 · 子 agent",
    "PUT ⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1",
    "PUT ☑️ 后台任务已结束",
  ]);
  assert.equal(api.entries.size, 0, "closed card with nothing running is released");

  const sequences = writes.map((w) => w.body.sequence);
  assert.deepEqual(sequences, [...sequences].sort((a, b) => a - b), "sequence never goes backwards");
  assert.equal(new Set(sequences).size, sequences.length);
});

test("a new reply takes the live line over from the previous card", async () => {
  const { api, bridge, writes, notify } = loadFeishu();
  const key = "agent:makaron:feishu:group:oc_y";
  bridge.active.set(key, [{ runtime: "cli", taskKind: "exec" }, { runtime: "subagent" }]);
  const first = new api.FeishuStreamingSession("c1");
  await first.start();
  api.vTaskStatusAttach(key, first, () => {});
  await settle(50);
  await closeCard(api, first, "ok");
  await settle(50);

  const second = new api.FeishuStreamingSession("c2");
  await second.start();
  api.vTaskStatusAttach(key, second, () => {});
  await settle(50);
  assert.deepEqual(lineWrites(writes, "c1"), ["POST ⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1", ""], "old card loses its line");
  assert.deepEqual(lineWrites(writes, "c2"), ["POST ⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1"]);

  bridge.active.set(key, []);
  notify(key);
  await settle();
  assert.equal(lineWrites(writes, "c2").at(-1), "PUT ☑️ 后台任务已结束");
  assert.equal(lineWrites(writes, "c1").length, 2, "old card is no longer touched");
});

test("work that raises no event here (V worker) still shows up by polling", async () => {
  const { api, bridge, writes } = loadFeishu();
  const key = "agent:makaron:feishu:group:oc_poll";
  const card = new api.FeishuStreamingSession("c1");
  await card.start();
  api.vTaskStatusAttach(key, card, () => {});
  await settle(50);
  bridge.active.set(key, [{ runtime: "cli", taskKind: "exec" }]);
  await settle(5_300);
  assert.deepEqual(lineWrites(writes, "c1"), ["POST ⏳ 后台 1 项进行中 · 后台命令"]);
  bridge.active.set(key, []);
  await closeCard(api, card, "ok");
  await settle(200);
  assert.equal(lineWrites(writes, "c1").at(-1), "PUT ☑️ 后台任务已结束");
  assert.equal(api.entries.size, 0);
});

test("a failed write is retried on the next refresh", async () => {
  const { api, bridge, writes, fail } = loadFeishu();
  const key = "agent:makaron:feishu:group:oc_retry";
  const card = new api.FeishuStreamingSession("c1");
  await card.start();
  fail.next = 1;
  bridge.active.set(key, [{ runtime: "subagent" }]);
  api.vTaskStatusAttach(key, card, () => {});
  await settle(5_300);
  assert.deepEqual(lineWrites(writes, "c1"), ["POST ⏳ 后台 1 项进行中 · 子 agent", "POST ⏳ 后台 1 项进行中 · 子 agent"]);
});

test("ordinary replies cost no extra writes and are released at close", async () => {
  const { api, writes } = loadFeishu();
  const card = new api.FeishuStreamingSession("c1");
  await card.start();
  api.vTaskStatusAttach("agent:makaron:feishu:direct:ou_1", card, () => {});
  await closeCard(api, card, "hi");
  await settle(50);
  assert.equal(lineWrites(writes, "c1").length, 0);
  assert.equal(api.entries.size, 0);
});

test("does nothing when the core bridge is absent", async () => {
  const { api, writes } = loadFeishu({ withBridge: false });
  const card = new api.FeishuStreamingSession("c1");
  await card.start();
  api.vTaskStatusAttach("agent:makaron:feishu:group:oc_z", card, () => {});
  await closeCard(api, card, "hi");
  await settle(50);
  assert.equal(lineWrites(writes, "c1").length, 0);
  assert.equal(api.entries.size, 0);
});
