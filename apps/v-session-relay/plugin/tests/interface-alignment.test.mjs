// Interface facts the other packages' reviews reported (scratchpad build/review-*.md), one test
// group per item: (a) wait on a non-inline record, (b) idempotency + content, (c) vrelay.send
// never throws a fallback-looking error, (d) senderIsOwner null, (e) poll guard keys, (f) slow
// starts and posts, (g) clean async context for bridge calls, (h) background rows, (i) the W(S)
// background filter, (j) DingTalk channel / bridge key / owner ids / route label, (k) one
// RunOutcome rule for every transport.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";

import { RELAY_FALLBACK_RE, SESSIONS_SEND_ACCEPTED, TASK_REGISTRY_BRIDGE } from "../core/contracts.js";
import { createPollGuard } from "../core/guard.js";
import { Host } from "../core/host.js";
// Namespace imports: a helper this file checks that is missing fails its own test, not the file.
import * as labels from "../core/labels.js";
import * as requests from "../core/requests.js";
import { createRoutes, deriveRoute, senderFor } from "../core/routes.js";
import { createTaskSource } from "../core/tasks.js";
import { createAgentTransport } from "../core/transports/agent.js";
import { createBridgeTransport } from "../core/transports/bridge.js";
import { formatForChannel } from "../core/visible.js";
import { createFakeBridge } from "./fixtures/fake-bridge.mjs";
import { DM, OWNER, ROOM, X, createFakeAgent, createWorld, sendParams, sleep, tmpDir, waitFor } from "./fixtures/harness.mjs";
import fs from "node:fs";

const ok = (text, extra = {}) => ({ status: "ok", finals: text ? [{ text }] : [], visibleReplySent: Boolean(text), finalCount: text ? 1 : 0, ...extra });
const startOf = (w, kind, id) => w.starts(kind).find((c) => c.args.id === id);
const awaitStart = (w, kind, id, what) => waitFor(() => startOf(w, kind, id), { what: what ?? `${kind} start ${id}` });

const DT_CID = "cidAbC0123==";
const DT_KEY = `agent:makaron:dingtalk-connector:group:${DT_CID.toLowerCase()}`;
const DT_STAFF = "staff01";
const dtEntry = (extra = {}) => ({ delivery: { kind: "external", context: { channel: "dingtalk-connector", to: DT_CID, accountId: "__default__", ...extra } }, subject: "运营群" });

function fakeApi() {
  const api = {
    pluginConfig: {}, logger: { info() {}, warn() {}, error() {}, debug() {} }, runtime: {},
    hooks: [], methods: [], services: [],
    on(name, fn, opts) { api.hooks.push({ name, fn, opts }); },
    registerGatewayMethod(name, fn, opts) { api.methods.push({ name, fn, opts }); },
    registerService(svc) { api.services.push(svc); },
  };
  return api;
}
/** Like the 9.1 plugin adapter: a returned value is the answer, a throw becomes the RPC error. */
async function rpc(api, method, params) {
  const m = api.methods.find((x) => x.name === method);
  let responded;
  try {
    const result = await m.fn({ params, respond: (...args) => { responded = args; } });
    return responded ? { responded } : result;
  } catch (err) {
    return { thrown: String(err?.message ?? err) };
  }
}

// ---------------------------------------------------------------- (a)

test("align (a): vrelay.wait on a record that is not inline answers expired at once, never 'failed' and never a long poll", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const first = await w.send(DM, X, "同一件事", { runId: "rA" });
    // An inline call with the same content is deduped onto the async send in flight.
    const inline = await w.engine.send(sendParams(DM, X, "同一件事", { runId: "rA", mode: "inline", timeoutMs: 120_000 }));
    assert.deepEqual([inline.status, inline.sendId, inline.deduped], ["accepted", first.sendId, true]);
    const t0 = Date.now();
    const r = await w.engine.wait({ sendId: first.sendId, timeoutMs: 2_000 });
    assert(Date.now() - t0 < 1_000, "answered at once, not after the 2 s slice");
    assert.equal(r.status, "expired");
    assert.equal(r.code, first.code);
    assert.doesNotMatch(r.note, /已等/u, "not the inline-window text: this send was never inline");
    assert.match(r.note, new RegExp(`#${first.code}.*自动回来`, "u"));
    // A cancelled async send is handed back by its batch; wait must not report it a second time.
    assert.equal((await w.engine.cancel({ sendId: first.sendId, reason: "测试" })).ok, true);
    const again = await w.engine.wait({ sendId: first.sendId, timeoutMs: 2_000 });
    assert.equal(again.status, "expired", "never 'failed' for a send the batch hands back");
    // Same for an inline send that already turned async and was then cancelled.
    const late = await w.engine.send(sendParams(DM, ROOM(3), "限时问一句", { runId: "rA", mode: "inline", timeoutMs: 60_000 }));
    await w.engine._expireInline(late.sendId, "test");
    await w.engine.cancel({ sendId: late.sendId, reason: "测试" });
    assert.equal((await w.engine.wait({ sendId: late.sendId, timeoutMs: 2_000 })).status, "expired");
  } finally { await w.close(); }
});

// ---------------------------------------------------------------- (b)

test("align (b): one idempotencyKey, different messages → separate sends; each repeat finds its own record", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const p1 = sendParams(DM, X, "第一件事", { runId: "rA", toolCallId: "call_0" });
    const p2 = sendParams(DM, X, "第二件事", { runId: "rA", toolCallId: "call_0" });
    const p3 = sendParams(DM, ROOM(1), "第一件事", { runId: "rA", toolCallId: "call_0" });
    assert.equal(p1.idempotencyKey, p2.idempotencyKey, "a provider that reuses toolCallIds");
    assert.equal(p1.idempotencyKey, p3.idempotencyKey);
    const r1 = await w.engine.send(p1);
    const r2 = await w.engine.send(p2);
    const r3 = await w.engine.send(p3);
    for (const r of [r1, r2, r3]) assert.equal(r.status, "accepted");
    assert.equal(r2.deduped, undefined, "a different message is never swallowed");
    assert.equal(r3.deduped, undefined, "a different target is never swallowed");
    assert.equal(new Set([r1.sendId, r2.sendId, r3.sendId]).size, 3);
    const again1 = await w.engine.send(p1);
    const again2 = await w.engine.send(p2);
    assert.deepEqual([again1.sendId, again1.deduped], [r1.sendId, true]);
    assert.deepEqual([again2.sendId, again2.deduped], [r2.sendId, true]);
    assert.equal(w.ledger.sends.size, 3);
    await waitFor(() => w.posts().length === 3, { what: "three anchors" });
    assert(w.logs.some(([level, m]) => level === "warn" && /idempotencyKey .* reused for a different message/u.test(m)));
    // The index survives a restart.
    await w.restart({ runRecovery: false });
    assert.equal((await w.engine.send(p2)).sendId, r2.sendId);
    assert.equal((await w.engine.send(p1)).sendId, r1.sendId);
  } finally { await w.close(); }
});

// ---------------------------------------------------------------- (c)

test("align (c): vrelay.send never throws, so the core never mistakes a plugin error for 'plugin absent'", async (t) => {
  const keepAlive = setInterval(() => {}, 1_000);
  t.after(() => clearInterval(keepAlive));
  const host = new Host({ env: {}, recoverOnStart: false });
  const api = fakeApi();
  host.register(api);
  for (const message of ["missing scope: operator.admin", "unknown method: vrelay.send"]) {
    host.engine = { send: async () => { throw new Error(message); } };
    const res = await rpc(api, "vrelay.send", sendParams(DM, X, "x"));
    assert.equal(res.thrown, undefined, `${message}: thrown to the core`);
    assert.equal(res.status, "error");
    assert.equal(res.code, "INTERNAL");
    assert.doesNotMatch(res.error, RELAY_FALLBACK_RE);
    host.engine = { send: () => { throw new Error(message); } }; // synchronous throw
    const sync = await rpc(api, "vrelay.send", sendParams(DM, X, "x"));
    assert.equal(sync.status, "error");
    assert.doesNotMatch(sync.error, RELAY_FALLBACK_RE);
  }
  host.engine = null;

  const w = await createWorld();
  try {
    // A failure after the record is on disk: the send stands, so the answer is "accepted".
    w.engine._acceptedResult = () => { throw new Error("unknown method: vrelay.send"); };
    const r = await w.engine.send(sendParams(DM, X, "记下来之后出错", { runId: "rA" }));
    delete w.engine._acceptedResult;
    assert.equal(r.status, "accepted");
    assert(w.rec(r.sendId), "the answer names the recorded send");
    assert.equal(r.code, w.rec(r.sendId).code);
    // A failure before anything is recorded: an error whose text never matches the fallback regex.
    const resolve = w.routes.resolve;
    w.routes.resolve = async () => { throw new Error("missing scope: operator.admin"); };
    const e = await w.engine.send(sendParams(DM, ROOM(2), "还没记下就出错", { runId: "rA" }));
    w.routes.resolve = resolve;
    assert.equal(e.status, "error");
    assert.doesNotMatch(e.error, RELAY_FALLBACK_RE);
  } finally { await w.close(); }
});

// ---------------------------------------------------------------- (d)

test("align (d): senderIsOwner null is a non-owner — no owner identity, name or admin scope, even with the owner's id", async () => {
  const w = await createWorld();
  try {
    const r = await w.engine.send(sendParams(DM, X, "帮我看看", { runId: "rN", senderIsOwner: null, senderId: OWNER }));
    assert.equal(r.status, "accepted");
    const st = await awaitStart(w, "request", r.sendId);
    assert.equal(st.args.sender.isOwnerIdentity, false);
    assert.notEqual(st.args.sender.id, OWNER, "the owner's id is presented only when senderIsOwner === true");
    assert.match(st.args.sender.id, /^v-a2a:c_/u);
    const rec = w.rec(r.sendId);
    assert.deepEqual([rec.principal.isOwner, rec.principal.name], [false, ""]);
    assert.doesNotMatch(st.args.channelPromptContext, /代表 Tianyi/u);
  } finally { await w.close(); }
  const tg = "agent:makaron:telegram:group:-1001234";
  const w2 = await createWorld({ entries: { [tg]: { delivery: { kind: "external", context: { channel: "telegram", to: "-1001234", accountId: "default" } } } } });
  try {
    const r = await w2.engine.send(sendParams(DM, tg, "TG 上做", { runId: "rN", senderIsOwner: null }));
    await waitFor(() => w2.agent.calls.find((c) => c.method === "start"));
    assert.equal(w2.agent.calls.find((c) => c.method === "start").principal.isOwner, false, "agent transport: operator.write, never admin");
    assert.equal(w2.rec(r.sendId).principal.isOwner, false);
  } finally { await w2.close(); }
  // The rule itself: an owner id on a chain whose root is not known to be the owner is never used.
  const cfg = { commands: { ownerAllowFrom: [`feishu:${OWNER}`] } };
  const group = { channel: "feishu", accountId: "default", to: "chat:oc_1", chatId: "oc_1", chatType: "group", humans: "unknown" };
  const c = senderFor({ route: group, principal: { channel: "feishu", id: OWNER, name: "", isOwner: false }, chainId: "c_mvgabc0123456789", fromLabel: "x", cfg });
  assert.deepEqual([c.sender.id, c.sender.isOwnerIdentity], ["v-a2a:c_mvgabc0123456789", false]);
});

// ---------------------------------------------------------------- (e)

test("align (e): the poll guard matches history reads by resolvedKey or displayKey, ignoring case", () => {
  const cases = [
    // session.scope=global: the core resolves "main" to the alias "global" and shows "main".
    { resolvedKey: "global", displayKey: "main", asked: ["main", "MAIN"] },
    // DingTalk keys are lower-cased; the model may pass the cid as it saw it.
    { resolvedKey: DT_KEY, displayKey: DT_KEY, asked: [`agent:makaron:dingtalk-connector:group:${DT_CID}`] },
    { resolvedKey: "agent:makaron:feishu:group:oc_a", displayKey: "Feishu-Ops", asked: ["feishu-ops"] },
  ];
  let n = 0;
  for (const { resolvedKey, displayKey, asked } of cases) {
    for (const key of asked) {
      const target = { [SESSIONS_SEND_ACCEPTED]: new Map([["run-1", { at: Date.now(), targets: new Map([[resolvedKey, { code: "7F3A", label: "任务群 a", historyReads: 0, sendId: "s_x", displayKey }]]) }]]) };
      const guard = createPollGuard({ target });
      const ev = (tool) => [{ toolName: tool, params: { sessionKey: key }, runId: "run-1" }, { runId: "run-1", toolName: tool, toolCallId: `tc${(n += 1)}` }];
      assert.equal(guard(...ev("sessions_history")), undefined, `${key}: first read allowed`);
      assert.equal(guard(...ev("session_status"))?.block, true, `${key} → ${resolvedKey}: second read blocked`);
      assert.equal(target[SESSIONS_SEND_ACCEPTED].get("run-1").targets.get(resolvedKey).historyReads, 2);
    }
  }
  // Unrelated keys still pass.
  const target = { [SESSIONS_SEND_ACCEPTED]: new Map([["run-1", { at: Date.now(), targets: new Map([["global", { code: "A", label: "l", historyReads: 5, displayKey: "main" }]]) }]]) };
  assert.equal(createPollGuard({ target })({ toolName: "sessions_history", params: { sessionKey: "agent:makaron:feishu:group:oc_b" }, runId: "run-1" }, { runId: "run-1", toolCallId: "z" }), undefined);
});

// ---------------------------------------------------------------- (f)

test("align (f): a start that waits minutes in the chat queue is never timed out or started twice", async () => {
  // 700 ms here is longer than every engine timer (idle recheck, sweep, lost-run grace, backoff,
  // recovery observation, anchor budget): like Feishu / WeCom waiting up to ~10 min per task ahead.
  const w = await createWorld({ bridge: { startDelayMs: 700, holdRuns: true } });
  try {
    const r = await w.send(DM, X, "排在人后面", { runId: "rA", mode: "inline", timeoutMs: 100 });
    await waitFor(() => w.fake.callsOf("start").length === 1, { what: "start called" });
    w.endRun("human-run-1", X); // the person's run ahead of it ends meanwhile
    await sleep(900);
    await waitFor(() => w.rec(r.sendId).phase === "running", { what: "the slow start answered started" });
    assert.equal(w.fake.callsOf("start").length, 1, "exactly one start while the first was pending");
    assert(w.rec(r.sendId).inline.expiredAt, "the inline window passed meanwhile; only the requester side turned async");
    w.fake.finishRun(w.rec(r.sendId).targetRun.runId, ok("排到了"));
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
    assert.equal(w.fake.callsOf("start").length, 1);
  } finally { await w.close(); }
  // A slow BUSY answer is retried once, with the next attempt's ids.
  const w2 = await createWorld({ bridge: { startDelayMs: 400, start: [{ status: "busy", reason: "pending_queue" }] } });
  try {
    const r = await w2.send(DM, X, "排队满了", { runId: "rA" });
    await waitFor(() => w2.rec(r.sendId).phase === "result_ready", { what: "result after the slow busy" });
    assert.deepEqual(w2.starts("request").map((s) => s.args.attempt), [0, 1]);
  } finally { await w2.close(); }
});

test("align (f): a lifecycle end that lands while a start is out still cuts the BUSY backoff", async () => {
  const w = await createWorld({ bridge: { startDelayMs: 200, start: [{ status: "busy", reason: "active_run" }] }, timing: { busyBackoffMs: [5_000] } });
  try {
    const r = await w.send(DM, X, "忙的时候来", { runId: "rA" });
    await waitFor(() => w.fake.callsOf("start").length === 1, { what: "first start out" });
    w.endRun("human-run", X); // the run it is busy behind ends before the BUSY answer is recorded
    await waitFor(() => w.starts("request").length === 2, { timeoutMs: 3_000, what: "a retry well before the 5 s backoff" });
    assert.equal(w.starts("request")[1].args.attempt, 1);
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
  } finally { await w.close(); }
});

test("align (f): an anchor post slower than the accept budget is posted once; the call answers within the budget", async () => {
  const w = await createWorld({ bridge: { postDelayMs: 1_500 }, timing: { anchorPostMs: 100 } });
  try {
    const r = await w.send(DM, X, "慢的发送", { runId: "rA" });
    assert.equal(r.status, "accepted");
    assert.equal(w.fake.callsOf("post").length, 1);
    assert.equal(w.fake.callsOf("post")[0].outcome, undefined, "answered while the post was still in flight");
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
    assert.equal(w.fake.callsOf("post").length, 1, "never re-posted while the first post was in flight");
  } finally { await w.close(); }
});

// ---------------------------------------------------------------- (g)

test("align (g): bridge calls run in the engine's own async context, never in the caller's (a Telegram update frame)", async () => {
  const als = new AsyncLocalStorage();
  const w = await createWorld({ bridge: { holdRuns: true } }); // engine built outside any frame
  try {
    const seen = [];
    const { start, post } = w.fake;
    w.fake.start = (req) => { seen.push(["start", req.kind, als.getStore()]); return start(req); };
    w.fake.post = (p) => { seen.push(["post", p.idempotencyKey, als.getStore()]); return post(p); };
    const r = await als.run({ update: 42 }, () => w.send(DM, X, "在一个 Telegram 更新里发起", { runId: "rA" }));
    const st = await awaitStart(w, "request", r.sendId);
    w.fake.finishRun(st.args.runId, ok("好了"));
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
    // The requester run's end arrives inside another update's frame; the wake must not inherit it.
    als.run({ update: 43 }, () => w.endRun("rA", DM));
    await waitFor(() => w.starts("wake").length === 1, { what: "wake" });
    assert.deepEqual(seen.map(([what, , store]) => [what, store]), seen.map(([what]) => [what, undefined]), JSON.stringify(seen));
    assert(seen.some(([what, kind]) => what === "start" && kind === "wake"));
    assert(seen.filter(([what]) => what === "post").length >= 2);
  } finally { await w.close(); }
});

// ---------------------------------------------------------------- (h)

test("align (h): the requester's 会话请求 row leaves at result_ready / failure_ready; sync, memory-only, case-insensitive", async () => {
  const target = { [TASK_REGISTRY_BRIDGE]: { listeners: new Set(), listActive() { throw new Error("the source must never call listActive"); } } };
  const notices = [];
  let calledSync = false;
  let inChanged = false;
  target[TASK_REGISTRY_BRIDGE].listeners.add(() => { throw new Error("a broken listener"); });
  target[TASK_REGISTRY_BRIDGE].listeners.add((n) => { if (inChanged) calledSync = true; notices.push(n); });
  let tasks;
  const w = await createWorld({ bridge: { holdRuns: true }, onSendChange: (rec) => { inChanged = true; try { tasks?.changed(rec); } finally { inChanged = false; } } });
  try {
    tasks = createTaskSource({ ledger: w.ledger, target });
    tasks.install();
    const source = [...target[TASK_REGISTRY_BRIDGE].extraSources][0];
    const ok1 = await w.send(DM, X, "成功的", { runId: "rA" });
    const bad = await w.send(DM, ROOM(1), "失败的", { runId: "rA" });
    const s1 = await awaitStart(w, "request", ok1.sendId);
    const s2 = await awaitStart(w, "request", bad.sendId);
    const rows = source(DM);
    assert(Array.isArray(rows), "synchronous: an array, not a promise");
    assert.deepEqual(rows.map((x) => x.taskId).sort(), [`v-a2a:${ok1.sendId}`, `v-a2a:${bad.sendId}`].sort());
    assert.equal(source(DM.toUpperCase()).length, 2, "keys match case-insensitively (DingTalk lower-cases them)");
    assert.equal(source(` ${DM.toLowerCase()} `).length, 2);
    // A record is visible in memory before its write lands; the notice follows the write.
    await waitFor(() => notices.length > 0, { what: "a notice past the throwing listener" });
    assert(notices.every((n) => n.kind === "v-a2a"), "kind v-a2a");
    assert.equal(calledSync, false, "listeners run in a microtask, never inside the engine's write");
    notices.length = 0;
    w.fake.finishRun(s1.args.runId, ok("好了"));
    await waitFor(() => w.rec(ok1.sendId).phase === "result_ready");
    assert.deepEqual(source(DM).map((x) => x.taskId), [`v-a2a:${bad.sendId}`], "result_ready: the row is gone before any hand-back");
    w.fake.finishRun(s2.args.runId, { status: "error", finals: [], visibleReplySent: false, finalCount: 0, error: "boom" });
    await waitFor(() => w.rec(bad.sendId).phase === "failure_ready");
    assert.deepEqual(source(DM), [], "failure_ready: gone too");
    await waitFor(() => notices.some((n) => n.kind === "v-a2a" && n.sessionKeys[0] === DM), { what: "notice for the requester" });
    assert.equal(w.batchOf(ok1.sendId).phase, "open", "nothing was handed back yet");
  } finally { tasks?.uninstall(); await w.close(); }
});

// ---------------------------------------------------------------- (i)

test("align (i): W(S) waits only for subagent / acp / exec / media work — never sessions_send rows or cron", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const s = await w.send(DM, ROOM(1), "看看有没有后台", { runId: "rA" });
    const st = await awaitStart(w, "request", s.sendId);
    w.tasks.set(ROOM(1), [
      { taskId: "v-a2a:s_other", runtime: "session", taskKind: "sessions_send", childSessionKey: X },
      { taskId: "sub-ss", runtime: "subagent", taskKind: "sessions_send" },
      { taskId: "cron-exec", runtime: "cron", taskKind: "exec" },
      { taskId: "acp-cron", runtime: "acp", taskKind: "cron" },
      { taskId: "cli-cron", runtime: "cli", taskKind: "cron" },
    ]);
    w.fake.finishRun(st.args.runId, ok("做完了"));
    await waitFor(() => ["result_ready", "awaiting_background"].includes(w.rec(s.sendId).phase));
    assert.equal(w.rec(s.sendId).phase, "result_ready");
    // Real background work still holds it.
    const s2 = await w.send(DM, ROOM(2), "有后台", { runId: "rA" });
    const st2 = await awaitStart(w, "request", s2.sendId);
    w.tasks.set(ROOM(2), [{ taskId: "img", runtime: "cli", taskKind: "image_generation" }]);
    w.fake.finishRun(st2.args.runId, ok("开始生成"));
    await waitFor(() => w.rec(s2.sendId).phase === "awaiting_background");
  } finally { await w.close(); }
});

// ---------------------------------------------------------------- (j)

test("align (j): DingTalk — dingtalk-connector maps to the dingtalk:<acct> bridge; owner ids; label from the entry", async () => {
  assert.equal(labels.bridgeChannelOf("dingtalk-connector"), "dingtalk");
  assert.equal(labels.bridgeChannelOf("feishu"), "feishu");
  const cfg = { commands: { ownerAllowFrom: [`feishu:${OWNER}`, `dingtalk-connector:${DT_STAFF}`, "dingtalk:staff02"] } };
  assert.deepEqual(labels.ownerIdsFor(cfg, "dingtalk"), [DT_STAFF, "staff02"]);
  assert.deepEqual(labels.ownerIdsFor(cfg, "dingtalk-connector"), [DT_STAFF, "staff02"]);
  assert.deepEqual(labels.ownerIdsFor(cfg, "feishu"), [OWNER]);

  const registry = { v: 1, bridges: new Map(), listeners: new Set() };
  const dt = createFakeBridge({ channel: "dingtalk", accountId: "__default__" });
  dt.register(registry);
  registry.bridges.set("dingtalk:default", { ...dt, accountId: "default" }); // the bridge registers both keys on V
  const bt = createBridgeTransport({ registry });
  const entries = { [DT_KEY]: dtEntry(), "agent:makaron:dingtalk-connector:group:cidnoacct": { delivery: { kind: "external", context: { channel: "dingtalk-connector", to: "cidNoAcct" } }, subject: "无账号群", displayName: "dingtalk-connector:g-无账号群" } };
  const routes = createRoutes({ getSessionEntry: ({ sessionKey }) => entries[sessionKey], getConfig: () => cfg, bridges: bt.bridges });
  const a = await routes.resolve({ sessionKey: DT_KEY, agentId: "makaron" });
  assert.deepEqual([a.ok, a.transport, a.bridgeKey], [true, "bridge", "dingtalk:__default__"]);
  assert.equal(a.route.label, "运营群", "filled from the entry: the bridge passes it as the group subject");
  assert.equal(routes.label({ sessionKey: DT_KEY, route: a.route }), "运营群");
  const b = await routes.resolve({ sessionKey: "agent:makaron:dingtalk-connector:group:cidnoacct", agentId: "makaron" });
  assert.deepEqual([b.transport, b.bridgeKey, b.route.label], ["bridge", "dingtalk:default", "无账号群"]);
  assert.deepEqual(dt.callsOf("resolveRoute")[0].args.ownerIds, [DT_STAFF, "staff02"]);

  // No bridge: the agent transport keeps the delivery channel for the outbound adapter, while
  // formatting, caps and identities use DingTalk's.
  const plain = createRoutes({ getSessionEntry: ({ sessionKey }) => entries[sessionKey], getConfig: () => cfg, bridges: new Map() });
  const c = await plain.resolve({ sessionKey: DT_KEY, agentId: "makaron" });
  assert.deepEqual([c.transport, c.route.channel, c.route.deliveryChannel, c.route.label], ["agent", "dingtalk", "dingtalk-connector", "运营群"]);
  assert.equal(deriveRoute({ sessionKey: DT_KEY, delivery: { channel: "dingtalk-connector", to: DT_CID } }).route.deliveryChannel, "dingtalk-connector");
  assert.equal(formatForChannel("dingtalk-connector", ["头", "正文"]), formatForChannel("dingtalk", ["头", "正文"]));
  const posted = [];
  const started = [];
  const agent = createAgentTransport({
    loadOutboundAdapter: async (ch) => ({ sendText: async (p) => { posted.push([ch, p.to]); return { messageId: "m1" }; } }),
    callGateway: async (method, params) => { if (method === "agent") { started.push(params.channel); return { runId: params.idempotencyKey }; } return { status: "ok" }; },
  });
  await agent.post({ route: c.route, text: "x" });
  await agent.start({ route: c.route, promptText: "p", sessionKey: DT_KEY, runId: "v-a2a-req-s_x-0", provenance: {} });
  assert.deepEqual(posted, [["dingtalk-connector", DT_CID]]);
  assert.deepEqual(started, ["dingtalk-connector"]);
});

test("align (j): a Feishu owner's request reaches a DingTalk group through its bridge, with the owner's DingTalk id", async () => {
  const w = await createWorld({
    entries: { [DT_KEY]: dtEntry() },
    cfg: { commands: { ownerAllowFrom: [`feishu:${OWNER}`, `dingtalk-connector:${DT_STAFF}`] } },
  });
  const dt = createFakeBridge({ channel: "dingtalk", accountId: "__default__" });
  dt.register(w.registry);
  try {
    const r = await w.send(DM, DT_KEY, "钉钉群里做一件事", { runId: "rA" });
    assert.equal(r.status, "accepted");
    assert.equal(r.label, "运营群");
    const st = await waitFor(() => dt.callsOf("start")[0], { what: "dingtalk start" });
    assert.equal(st.args.route.label, "运营群");
    assert.deepEqual([st.args.sender.id, st.args.sender.isOwnerIdentity], [DT_STAFF, true]);
    assert.match(dt.callsOf("post")[0].args.text, /^\*\*📨 来自「Tianyi 私聊」的请求 #\w+\*\*/u, "DingTalk markdown");
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
    assert.equal(w.rec(r.sendId).target.bridgeKey, "dingtalk:__default__");
    assert.equal(w.agent.calls.length, 0, "never the agent transport");
  } finally { await w.close(); }
});

// ---------------------------------------------------------------- (k)

test("align (k): one RunOutcome rule — no terminal outcome is ok only with a non-error final, else aborted", async () => {
  assert.equal(requests.normalizeRunOutcome({ status: "aborted", finals: [{ text: "写好了" }], visibleReplySent: true, finalCount: 1 }).status, "ok");
  assert.equal(requests.normalizeRunOutcome({ status: "aborted", finals: [{ mediaUrls: ["https://m/1.png"] }], visibleReplySent: true, finalCount: 1 }).status, "ok");
  assert.equal(requests.normalizeRunOutcome({ status: "aborted", finals: [], visibleReplySent: true, finalCount: 0 }).status, "aborted", "visible streaming is not a final");
  assert.equal(requests.normalizeRunOutcome({ status: "error", finals: [{ text: "x" }], visibleReplySent: true, finalCount: 1, error: "boom" }).status, "error", "failed is a terminal outcome");
  assert.equal(requests.normalizeRunOutcome({ status: undefined, finals: [], visibleReplySent: false, finalCount: 0 }).status, "aborted");
  assert.equal(requests.normalizeRunOutcome({ status: "weird", finals: [{ text: "y" }], visibleReplySent: true, finalCount: 1 }).status, "ok");

  const w = await createWorld({ bridge: { start: [
    { status: "started", runStatus: "aborted", finals: [{ text: "停之前已经交了最终回复" }] },
    { status: "started", runStatus: "aborted", finals: [] },
  ] } });
  try {
    const a = await w.send(DM, ROOM(1), "第一件", { runId: "rA" });
    await waitFor(() => ["result_ready", "failure_ready"].includes(w.rec(a.sendId).phase));
    assert.equal(w.rec(a.sendId).phase, "result_ready");
    assert.equal(w.rec(a.sendId).result.text, "停之前已经交了最终回复");
    const b = await w.send(DM, ROOM(2), "第二件", { runId: "rA" });
    await waitFor(() => ["result_ready", "failure_ready"].includes(w.rec(b.sendId).phase));
    assert.equal(w.rec(b.sendId).failure.class, "aborted");
  } finally { await w.close(); }

  // The agent transport follows the same rule.
  const waits = [
    { status: "ok", stopReason: "aborted", terminalReply: { disposition: "visible", text: "已回复" } },
    { status: "error", error: "Run aborted by user" },
  ];
  const agent = createAgentTransport({ callGateway: async (method, params) => (method === "agent" ? { runId: params.idempotencyKey } : waits.shift()) });
  const one = await agent.start({ route: null, promptText: "p", sessionKey: "agent:makaron:main", runId: "v-a2a-req-s_x-0", provenance: {} });
  assert.equal((await one.done).status, "ok");
  const two = await agent.start({ route: null, promptText: "p", sessionKey: "agent:makaron:main", runId: "v-a2a-req-s_x-1", provenance: {} });
  assert.equal((await two.done).status, "aborted");
});

// ---------------------------------------------------------------- review (fix-plugin)

test("align (j): a group route is named from the entry's subject only — 9.1's displayName is '<provider>:g-<slug>', never a name", async () => {
  // 9.1 buildGroupDisplayName (src/config/sessions/group.ts) always returns `${provider}:${token}`,
  // token "g-<slug of the subject, else of the chat id>". A bridge passes route.label on as the group
  // subject (DingTalk conversationTitle, Telegram chat.title) and the core stores it as the session's
  // subject, so a displayName there would rename the target group to an id-like token.
  const registry = { v: 1, bridges: new Map(), listeners: new Set() };
  const dt = createFakeBridge({ channel: "dingtalk", accountId: "__default__" });
  dt.register(registry);
  const noSubject = "agent:makaron:dingtalk-connector:group:cidnosubject";
  const tg = "agent:makaron:telegram:group:-1001234";
  const entries = {
    [noSubject]: { delivery: { kind: "external", context: { channel: "dingtalk-connector", to: "cidNoSubject", accountId: "__default__" } }, displayName: "dingtalk-connector:g-cidnosubject" },
    [DT_KEY]: { ...dtEntry(), displayName: "dingtalk-connector:g-运营群" },
    [tg]: { delivery: { kind: "external", context: { channel: "telegram", to: "-1001234", accountId: "default" } }, displayName: "telegram:g-1001234" },
  };
  const getSessionEntry = ({ sessionKey }) => entries[sessionKey];
  const viaBridge = createRoutes({ getSessionEntry, getConfig: () => ({}), bridges: createBridgeTransport({ registry }).bridges });
  const a = await viaBridge.resolve({ sessionKey: noSubject, agentId: "makaron" });
  assert.equal(a.transport, "bridge");
  assert.equal(a.route.label, undefined, "never the core's id-like displayName");
  assert.equal((await viaBridge.resolve({ sessionKey: DT_KEY, agentId: "makaron" })).route.label, "运营群");
  const plain = createRoutes({ getSessionEntry, getConfig: () => ({}), bridges: new Map() });
  const b = await plain.resolve({ sessionKey: tg, agentId: "makaron" });
  assert.deepEqual([b.transport, b.route.label], ["agent", undefined]);
  // End to end: the DingTalk bridge gets no title to pass on as GroupSubject.
  const w = await createWorld({ entries: { [noSubject]: entries[noSubject] } });
  const wdt = createFakeBridge({ channel: "dingtalk", accountId: "__default__" });
  wdt.register(w.registry);
  try {
    const r = await w.send(DM, noSubject, "没有群名的钉钉群", { runId: "rA" });
    const st = await waitFor(() => wdt.callsOf("start")[0], { what: "dingtalk start" });
    assert.equal(st.args.route.label, undefined);
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
  } finally { await w.close(); }
});

test("align (g): the clean context is the process's, taken once — a service restarted inside a turn's async context (config reload) does not hand it to the turns it starts", async (t) => {
  const keepAlive = setInterval(() => {}, 1_000);
  t.after(() => clearInterval(keepAlive));
  const als = new AsyncLocalStorage();
  const seen = [];
  const sdk = {
    callGatewayFromCli: async (method, _opts, params) => {
      seen.push([method, als.getStore()]);
      if (method === "agent") return { runId: params.idempotencyKey, status: "accepted" };
      if (method === "agent.wait") return { status: "ok", terminalReply: { disposition: "visible", text: "好了" } };
      throw new Error(`unexpected ${method}`);
    },
  };
  // Built when the plugin module is first evaluated (Gateway boot), outside any frame.
  const host = new Host({ env: {}, recoverOnStart: false, sdk });
  const api = fakeApi();
  api.runtime = { agent: { session: { getSessionEntry: () => ({ sessionId: "s" }) } }, subagent: { getSessionMessages: async () => ({ messages: [] }) } };
  host.register(api);
  const stateDir = tmpDir("vsr-ctx-");
  const ctx = { stateDir, config: { commands: { ownerAllowFrom: [] } } };
  try {
    const svc = api.services[0];
    await svc.start(ctx);
    await svc.stop();
    // 9.1 replaces the plugin runtime on a config reload, and the reload runs in the writer's async
    // context (registerConfigWriteListener → setTimeout): an agent's config.patch through the
    // gateway tool starts the new service inside its turn's stores (prepared-model generation
    // scope, gateway caller identity, transcript write context).
    await als.run({ frame: "config.patch from an agent turn" }, () => svc.start(ctx));
    const from = "agent:makaron:main";
    const to = "agent:makaron:webchat:app1";
    const r = await als.run({ frame: "vrelay.send" }, () => host.engine.send({
      v: 1, idempotencyKey: `ss:${"c".repeat(32)}`, toolCallId: "t1",
      requester: { sessionKey: from, replySessionKey: from, agentId: "makaron", runId: "root-1", channel: null, accountId: null, to: null, threadId: null, senderId: null, senderIsOwner: false },
      target: { sessionKey: to, agentId: "makaron", displayKey: to, created: false },
      message: "交给 App 会话", mode: "async", inlineTimeoutMs: 0,
    }));
    assert.equal(r.status, "accepted");
    host.engine.onAgentEvent({ runId: "root-1", sessionKey: from, stream: "lifecycle", seq: 1, ts: Date.now(), data: { phase: "end" } });
    await waitFor(() => host.engine.ledger.getSend(r.sendId)?.phase === "handed_back", { what: "handed back" });
    assert.equal(seen.filter(([m]) => m === "agent").length, 2, "request turn + wake turn");
    assert.deepEqual(seen.map(([m, store]) => [m, store]), seen.map(([m]) => [m, undefined]), JSON.stringify(seen));
  } finally {
    await host.stop();
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test("align (g): anchor edits and agent-transport posts run in the clean context too", async () => {
  const als = new AsyncLocalStorage();
  const seen = [];
  const base = createFakeAgent();
  const agent = {
    ...base,
    post: (p) => { seen.push(["agent.post", als.getStore()]); return base.post(p); },
    start: (req, o) => { seen.push(["agent.start", als.getStore()]); return base.start(req, o); },
  };
  const tg = "agent:makaron:telegram:group:-1001234";
  const w = await createWorld({ bridge: { holdRuns: true }, agent, entries: { [tg]: { delivery: { kind: "external", context: { channel: "telegram", to: "-1001234", accountId: "default" } } } } });
  try {
    const edit = w.fake.edit;
    w.fake.edit = (p) => { seen.push(["edit", als.getStore()]); return edit(p); };
    // Busy at accept: the anchor carries the queue line, and the start edits it away.
    w.busy.add(X);
    const r = await als.run({ update: 7 }, () => w.send(DM, X, "排在后面", { runId: "rA" }));
    assert.equal(w.rec(r.sendId).request.queuedLine, true);
    w.busy.delete(X);
    als.run({ update: 8 }, () => w.endRun("human-run", X));
    await waitFor(() => seen.some(([what]) => what === "edit"), { what: "queue line edited away" });
    // No Telegram bridge: the anchor and the turn go through the agent transport.
    const t2 = await als.run({ update: 9 }, () => w.send(DM, tg, "TG 群里做", { runId: "rA" }));
    await waitFor(() => w.rec(t2.sendId).phase === "result_ready", { what: "agent-transport turn done" });
    assert(seen.some(([what]) => what === "agent.post") && seen.some(([what]) => what === "agent.start"), JSON.stringify(seen));
    assert.deepEqual(seen.map(([what, store]) => [what, store]), seen.map(([what]) => [what, undefined]), JSON.stringify(seen));
  } finally { await w.close(); }
});

test("align (k): a wake turn that serves a send follows the same rule — aborted with a final hands that final back", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const s = await w.send(DM, X, "交给 X 去分派", { runId: "rA" });
    const xs = await awaitStart(w, "request", s.sendId);
    const child = await w.send(X, ROOM(1), "子任务", { runId: xs.args.runId });
    assert.equal(child.status, "accepted");
    w.fake.finishRun(xs.args.runId, ok("已分派"));
    await waitFor(() => w.rec(s.sendId).phase === "awaiting_children", { what: "S waits for its child" });
    const cs = await awaitStart(w, "request", child.sendId);
    w.fake.finishRun(cs.args.runId, ok("子结果"));
    const wake = await waitFor(() => w.starts("wake")[0], { what: "X's wake" });
    // No terminal outcome from the core (stopped after the final went out): the bridges' rule.
    w.fake.finishRun(wake.args.runId, { status: "aborted", finals: [{ text: "汇总好了" }], visibleReplySent: true, finalCount: 1 });
    await waitFor(() => ["result_ready", "failure_ready"].includes(w.rec(s.sendId).phase), { what: "S settled" });
    assert.equal(w.rec(s.sendId).phase, "result_ready");
    assert.equal(w.rec(s.sendId).result.text, "汇总好了");
  } finally { await w.close(); }
});
