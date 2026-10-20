// Test world for engine / recovery tests: a temp ledger, the fake Feishu bridge in a private
// registry, a fake session store and transcript, a fake task registry bridge and fast timers.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolvePluginConfig, sendIdempotencyKey } from "../../core/contracts.js";
import { Engine } from "../../core/engine.js";
import { Ledger } from "../../core/ledger.js";
import { recover } from "../../core/recovery.js";
import { createRoutes } from "../../core/routes.js";
import { createBridgeTransport } from "../../core/transports/bridge.js";
import { createFakeBridge } from "./fake-bridge.mjs";

export const OWNER = "ou_00000000000000000000000000000001";
export const PEER = "ou_00000000000000000000000000000002";
export const hex = (n) => n.toString(16).padStart(32, "0");
export const DM = `agent:makaron:feishu:direct:${OWNER}`;
export const groupKey = (n) => `agent:makaron:feishu:group:oc_${hex(n)}`;
export const X = groupKey(0xa);
export const ROOM = (i) => groupKey(0x100 + i);

export const FAST = Object.freeze({
  pumpDebounceMs: 5,
  busyBackoffMs: [20, 40, 60, 80, 100],
  idleRecheckMs: 30,
  backgroundPollMs: 30,
  queueNoteAfterMs: 60_000,
  anchorPostMs: 300,
  postRetryMs: [10, 20, 30],
  sweepMs: 40,
  archiveEveryMs: 3600_000,
  recoveryObserveMs: 120,
  transcriptGapMs: 0,
  bridgeReadyMs: 200,
  lostRunGraceMs: 150,
});

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(pred, { timeoutMs = 3000, stepMs = 5, what = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(stepMs);
  }
}

export function tmpDir(prefix = "vsr-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

let callSeq = 0;
/** vrelay.send params as the core patch builds them. */
export function sendParams(from, to, message, { runId = "run-root-1", mode = "async", timeoutMs = 120_000, toolCallId, senderId = OWNER, senderIsOwner = true, channel = "feishu", created = false } = {}) {
  const call = toolCallId ?? `call_${(callSeq += 1)}`;
  const fromAgent = from.split(":")[1];
  const toAgent = to.split(":")[1];
  const peer = from.split(":").at(-1);
  return {
    v: 1,
    idempotencyKey: sendIdempotencyKey({ requesterSessionKey: from, requesterRunId: runId, toolCallId: call }),
    toolCallId: call,
    requester: {
      sessionKey: from, replySessionKey: from, agentId: fromAgent, runId,
      channel, accountId: "default", to: from.includes(":direct:") ? `user:${peer}` : `chat:${peer}`, threadId: null,
      senderId, senderIsOwner,
    },
    target: { sessionKey: to, agentId: toAgent, displayKey: to, created },
    message,
    mode,
    inlineTimeoutMs: mode === "inline" ? timeoutMs : 0,
  };
}

/** A recording agent transport (used when no bridge fits). */
export function createFakeAgent({ world } = {}) {
  const calls = [];
  const visible = [];
  let n = 0;
  return {
    kind: "agent",
    calls,
    visible,
    async post({ route, text }) {
      calls.push({ method: "post", route, text });
      visible.push({ kind: "post", to: route?.to, text });
      return { messageId: `agent_msg_${(n += 1)}` };
    },
    async start(req, { principal } = {}) {
      calls.push({ method: "start", req, principal });
      world?.transcriptStart(req);
      const done = new Promise((r) => setTimeout(() => {
        const out = { status: "ok", finals: [{ text: `agent done ${req.id}` }], visibleReplySent: true, finalCount: 1 };
        world?.transcriptEnd(req, out);
        r(out);
      }, 5));
      return { status: "started", runId: req.runId, done };
    },
  };
}

export async function createWorld(options = {}) {
  // Engine timers are unref()'d (right for the Gateway); a test world holds the loop open itself.
  const keepAlive = setInterval(() => {}, 1_000);
  const dir = options.dir ?? tmpDir();
  const registry = { v: 1, bridges: new Map(), listeners: new Set() };
  const entries = new Map(Object.entries(options.entries ?? {}));
  const transcripts = new Map();
  const busy = new Set();
  const tasks = new Map();
  const taskBridge = { listeners: new Set(), listActive: (key) => tasks.get(key) ?? [] };
  const logs = [];
  const logger = { info: (m) => logs.push(["info", m]), warn: (m) => logs.push(["warn", m]), error: (m) => logs.push(["error", m]), debug: () => {} };

  const world = {
    dir, registry, entries, transcripts, busy, tasks, taskBridge, logs, logger,
    transcriptStart(req) {
      const list = transcripts.get(req.sessionKey) ?? [];
      list.push({ role: "user", content: req.promptText, provenance: req.provenance });
      transcripts.set(req.sessionKey, list);
    },
    transcriptEnd(req, outcome) {
      const list = transcripts.get(req.sessionKey) ?? [];
      for (const f of outcome?.finals ?? []) if (f.text) list.push({ role: "assistant", content: [{ type: "text", text: f.text }] });
      transcripts.set(req.sessionKey, list);
    },
  };

  const fake = createFakeBridge({ channel: "feishu", runMs: 5, ...(options.bridge ?? {}) });
  const origStart = fake.start;
  // Like the core (inbound MessageSid dedupe, 20 min) and a Worker (a runId it ran is refused): an
  // attempt id is good for one start. A reused one is recorded and rejected; close() fails on it.
  const usedSids = new Set();
  const usedRunIds = new Set();
  world.reusedIds = [];
  fake.start = async (req) => {
    if (usedSids.has(req.messageSid) || usedRunIds.has(req.runId)) {
      world.reusedIds.push({ kind: req.kind, id: req.id, attempt: req.attempt, messageSid: req.messageSid, runId: req.runId });
      return { status: "rejected", code: "GATED", message: `duplicate MessageSid ${req.messageSid}`, started: false };
    }
    usedSids.add(req.messageSid);
    usedRunIds.add(req.runId);
    const out = await origStart(req);
    if (out.status === "started") {
      world.transcriptStart(req);
      out.done.then((o) => world.transcriptEnd(req, o), () => {});
    }
    return out;
  };
  if (options.registerBridge !== false) fake.register(registry);

  const config = resolvePluginConfig({ ownerName: "Tianyi", ...(options.pluginConfig ?? {}) });
  const cfg = { commands: { ownerAllowFrom: [`feishu:${OWNER}`] }, ...(options.cfg ?? {}) };
  const bt = createBridgeTransport({ registry, logger });
  const routes = createRoutes({
    getSessionEntry: ({ sessionKey }) => entries.get(sessionKey) ?? { sessionId: "s", updatedAt: 0 },
    getConfig: () => cfg, bridges: bt.bridges, ownerName: "Tianyi", agentNames: { codex: "Codex" }, logger,
  });
  const agent = options.agent ?? createFakeAgent({ world });

  async function makeEngine(ledgerOpts = {}) {
    const ledger = await Ledger.open(dir, { logger, crashAt: null, ...ledgerOpts });
    const engine = new Engine({
      ledger, config, routes, bridge: bt, agent, logger,
      sdk: { resolveActiveEmbeddedRunSessionId: (k) => (busy.has(k) ? "sid-busy" : undefined) },
      runtime: { getSessionMessages: async ({ sessionKey, limit }) => ({ messages: (transcripts.get(sessionKey) ?? []).slice(-(limit ?? 20)) }) },
      timing: { ...FAST, ...(options.timing ?? {}) },
      taskBridge: () => taskBridge,
      flushSeam: () => options.flushSeam,
      env: options.env ?? {},
      onSendChange: options.onSendChange,
    });
    engine.start();
    return engine;
  }

  world.fake = fake;
  world.bridge = bt;
  world.routes = routes;
  world.agent = agent;
  world.config = config;
  world.engine = await makeEngine(options.ledger);
  world.ledger = world.engine.ledger;
  world.makeEngine = makeEngine;
  /** Simulate the end of a (human / root) run as the Gateway's lifecycle stream reports it. */
  world.endRun = (runId, sessionKey, phase = "end", data = {}) => world.engine.onAgentEvent({ runId, sessionKey, stream: "lifecycle", seq: 1, ts: Date.now(), data: { phase, ...data } });
  world.send = (...args) => world.engine.send(sendParams(...args));
  world.rec = (id) => world.engine.ledger.getSend(id);
  world.batchOf = (id) => world.engine.ledger.getBatch(world.rec(id).batchId);
  world.starts = (kind) => fake.callsOf("start").filter((c) => !kind || c.args.kind === kind);
  world.posts = () => fake.visible.filter((v) => v.kind === "post");
  /** Simulated Gateway restart: the old engine and ledger stop, a new one recovers from disk. */
  world.restart = async ({ runRecovery = true, ledger: ledgerOpts = {} } = {}) => {
    const old = world.engine;
    await old.stop().catch(() => {});
    await old.ledger.close().catch(() => {});
    world.engine = await makeEngine({ crashAt: null, ...ledgerOpts });
    world.ledger = world.engine.ledger;
    world.recovery = runRecovery ? recover(world.engine) : null;
    return world.engine;
  };
  world.close = async () => {
    await world.engine.stop();
    await world.engine.ledger.close();
    clearInterval(keepAlive);
    fs.rmSync(dir, { recursive: true, force: true });
    if (world.reusedIds.length && !options.allowReusedIds) {
      throw new Error(`a start reused an attempt id (the core would drop it): ${JSON.stringify(world.reusedIds)}`);
    }
  };
  return world;
}
