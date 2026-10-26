// index.js / core/host.js wiring (§3.10, §13.1–§13.2): register() three times shares one engine,
// Worker children start nothing (guard only with workerGuard), method scopes, and the agent
// transport end to end through the plugin's own Gateway client.
import assert from "node:assert/strict";
import fs from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";
import { test } from "node:test";

import { METHODS, METHOD_SCOPES, SESSIONS_SEND_ACCEPTED, sendIdempotencyKey } from "../core/contracts.js";
import { HOST_KEY, Host } from "../core/host.js";
import { tmpDir, waitFor } from "./fixtures/harness.mjs";

const manifest = JSON.parse(fs.readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8"));
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function fakeApi({ pluginConfig = {}, runtime = {} } = {}) {
  const api = {
    pluginConfig, logger: { info() {}, warn() {}, error() {}, debug() {} }, runtime,
    hooks: [], methods: [], services: [],
    on(name, fn, opts) { api.hooks.push({ name, fn, opts }); },
    registerGatewayMethod(name, fn, opts) { api.methods.push({ name, fn, opts }); },
    registerService(svc) { api.services.push(svc); },
  };
  return api;
}
const call = async (api, method, params) => {
  const m = api.methods.find((x) => x.name === method);
  let responded;
  const result = await m.fn({ params, respond: (...args) => { responded = args; } });
  return responded ? { responded } : result;
};

test("host: manifest and package match the frozen config schema; version 2.0.0", async () => {
  const { CONFIG_SCHEMA } = await import("../core/contracts.js");
  assert.deepEqual(manifest.configSchema, JSON.parse(JSON.stringify(CONFIG_SCHEMA)));
  assert.equal(manifest.configSchema.properties.workerGuard.type, "boolean");
  assert.equal(manifest.id, "v-session-relay");
  assert.equal(pkg.version, "2.0.0");
  assert.deepEqual(pkg.openclaw.extensions, ["./index.js"]);
});

test("host: Worker children register nothing, or only the guard when workerGuard is on", () => {
  const plain = fakeApi();
  new Host({ env: { VLAB_WORKER_CHILD: "1" } }).register(plain);
  assert.deepEqual([plain.hooks.length, plain.methods.length, plain.services.length], [0, 0, 0]);
  const guarded = fakeApi({ pluginConfig: { workerGuard: true } });
  new Host({ env: { VLAB_WORKER_CHILD: "1" } }).register(guarded);
  assert.deepEqual(guarded.hooks.map((h) => h.name), ["before_tool_call"]);
  assert.deepEqual([guarded.methods.length, guarded.services.length], [0, 0]);
});

test("host: three register() calls, one engine; methods carry their scopes; stop at the last reference", async (t) => {
  const keepAlive = setInterval(() => {}, 1_000);
  t.after(() => clearInterval(keepAlive));
  const stateDir = tmpDir("vsr-host-");
  const host = new Host({ env: {}, recoverOnStart: false });
  const apis = [fakeApi(), fakeApi(), fakeApi()];
  for (const api of apis) host.register(api);
  for (const api of apis) {
    assert.deepEqual(api.methods.map((m) => [m.name, m.opts.scope]), Object.values(METHODS).map((m) => [m, METHOD_SCOPES[m]]));
    assert.equal(api.hooks[0].fn, host.guard, "one guard instance for every registry");
  }
  assert.equal(METHOD_SCOPES["vrelay.list"], "operator.read");
  // Before start: vrelay.send falls back, list answers empty.
  assert.deepEqual(await call(apis[0], "vrelay.send", {}), { status: "fallback", reason: "disabled" });
  assert.deepEqual(await call(apis[0], "vrelay.list", {}), { items: [], counts: { running: 0, queued: 0, awaiting: 0 } });
  const bad = await call(apis[0], "vrelay.wait", {});
  assert.equal(bad.responded[0], false);
  await Promise.all(apis.map((api) => api.services[0].start({ stateDir, config: {} })));
  const engine = host.engine;
  assert(engine);
  assert(fs.existsSync(path.join(stateDir, "v-session-relay", "v2", "LOCK")));
  await apis[0].services[0].stop();
  await apis[1].services[0].stop();
  assert.equal(host.engine, engine, "still referenced");
  await apis[2].services[0].stop();
  assert.equal(host.engine, null);
  assert(!fs.existsSync(path.join(stateDir, "v-session-relay", "v2", "LOCK")));
  fs.rmSync(stateDir, { recursive: true, force: true });
});

test("index.js: loads through the plugin SDK, routes a send to a chat-less session over the agent transport", async (t) => {
  if (typeof nodeModule.registerHooks !== "function") { t.skip("module.registerHooks unavailable"); return; }
  const keepAlive = setInterval(() => {}, 1_000);
  t.after(() => clearInterval(keepAlive));
  const fake = { listeners: new Set(), calls: [] };
  globalThis.__vsrFakeSdk = fake;
  const src = `
    const f = globalThis.__vsrFakeSdk;
    export const definePluginEntry = (o) => o;
    export const onAgentEvent = (fn) => { f.listeners.add(fn); return () => f.listeners.delete(fn); };
    export const resolveActiveEmbeddedRunSessionId = () => undefined;
    export const callGatewayFromCli = (...args) => f.call(...args);
  `;
  const url = `data:text/javascript,${encodeURIComponent(src)}`;
  nodeModule.registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith("openclaw/plugin-sdk/")) return { url, shortCircuit: true };
      return next(specifier, context);
    },
  });
  delete globalThis[HOST_KEY];
  const stateDir = tmpDir("vsr-index-");
  const runs = new Map();
  fake.call = async (method, opts, params, extra) => {
    fake.calls.push({ method, params, extra, config: opts?.config });
    if (method === "agent") { runs.set(params.idempotencyKey, params); return { runId: params.idempotencyKey, status: "accepted" }; }
    if (method === "agent.wait") return { status: "ok", terminalReply: { disposition: "visible", text: `reply to ${runs.get(params.runId)?.message.slice(0, 12)}` } };
    throw new Error(`unexpected ${method}`);
  };
  try {
    const entry = (await import("../index.js")).default;
    assert.equal(entry.id, "v-session-relay");
    const api = fakeApi({ runtime: { agent: { session: { getSessionEntry: () => ({ sessionId: "s" }) } }, subagent: { getSessionMessages: async () => ({ messages: [] }) } } });
    entry.register(api);
    entry.register(api);
    entry.register(api);
    assert.equal(api.services.length, 3);
    await api.services[0].start({ stateDir, config: { commands: { ownerAllowFrom: [] } } });
    const host = globalThis[HOST_KEY];
    await host.recovery;
    assert.equal(fake.listeners.size, 1, "one lifecycle subscription despite three register() calls");
    const from = "agent:makaron:main";
    const to = "agent:makaron:webchat:app1";
    const params = {
      v: 1, idempotencyKey: sendIdempotencyKey({ requesterSessionKey: from, requesterRunId: "root-1", toolCallId: "t1" }), toolCallId: "t1",
      requester: { sessionKey: from, replySessionKey: from, agentId: "makaron", runId: "root-1", channel: null, accountId: null, to: null, threadId: null, senderId: null, senderIsOwner: true },
      target: { sessionKey: to, agentId: "makaron", displayKey: to, created: false },
      message: "主会话把一件事交给 App 会话", mode: "async", inlineTimeoutMs: 0,
    };
    const accepted = await call(api, "vrelay.send", params);
    assert.equal(accepted.status, "accepted");
    for (const l of fake.listeners) l({ runId: "root-1", sessionKey: from, stream: "lifecycle", seq: 1, ts: Date.now(), data: { phase: "end" } });
    await waitFor(() => host.engine.ledger.getSend(accepted.sendId)?.phase === "handed_back", { what: "handed back via agent transport" });
    const agentCalls = fake.calls.filter((c) => c.method === "agent");
    assert.equal(agentCalls.length, 2, "request turn + wake turn");
    assert.equal(agentCalls[0].params.deliver, true);
    assert.equal(agentCalls[0].params.inputProvenance.kind, "inter_session");
    assert.deepEqual(agentCalls[0].extra.scopes, ["operator.admin"], "owner chain → admin scope (A5)");
    assert.equal(agentCalls[0].extra.progress, false);
    assert.match(agentCalls[1].params.message, /^\[会话协作结果\]/u);
    assert.match(agentCalls[1].params.message, /最终回复：\n   reply to 主会话把一件事交给 Ap/u);
    const list = await call(api, "vrelay.list", { active: false });
    assert.equal(list.items[0].sendId, accepted.sendId);
    // The guard is live in the Gateway.
    globalThis[SESSIONS_SEND_ACCEPTED] = new Map([["r9", { at: Date.now(), targets: new Map([[to, { code: "AAAA", label: "V App", historyReads: 0 }]]) }]]);
    assert.equal(api.hooks[0].fn({ toolName: "exec", params: { command: "sleep 60" } }, { runId: "r9", toolCallId: "g1" })?.block, true);
    for (const svc of api.services) await svc.stop();
    assert.equal(host.engine, null);
  } finally {
    delete globalThis[SESSIONS_SEND_ACCEPTED];
    await globalThis[HOST_KEY]?.stop?.();
    delete globalThis[HOST_KEY];
    delete globalThis.__vsrFakeSdk;
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
