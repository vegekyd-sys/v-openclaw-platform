// Child process for crash-injection tests (design §10.1). One "Gateway life":
//   node crash-child.mjs <ledgerDir> <worldFile> first     — accept two sends from one root run
//   node crash-child.mjs <ledgerDir> <worldFile> recover   — restart: run §6.3 recovery
// With VSR_CRASH_AT=<phase> the ledger exits the process (code 86) at that write. The channel
// world (visible posts, Feishu uuid dedupe, started turns, transcripts) lives in <worldFile> so it
// survives the crash like the real chat platform does. Prints a JSON summary and exits 0 when
// every send and batch is closed.
import fs from "node:fs";

import { resolvePluginConfig, sendIdempotencyKey } from "../../core/contracts.js";
import { Engine } from "../../core/engine.js";
import { Ledger } from "../../core/ledger.js";
import { recover } from "../../core/recovery.js";
import { createRoutes } from "../../core/routes.js";
import { createBridgeTransport } from "../../core/transports/bridge.js";
import { createFakeBridge } from "./fake-bridge.mjs";

const [dir, worldFile, mode] = process.argv.slice(2);
// The engine's timers are unref()'d (the Gateway keeps its own loop alive); this life needs one.
const keepAlive = setInterval(() => {}, 1_000);
const OWNER = "ou_00000000000000000000000000000001";
const DM = `agent:makaron:feishu:direct:${OWNER}`;
const X = `agent:makaron:feishu:group:oc_${"a".padStart(32, "0")}`;
const ROOM = `agent:makaron:feishu:group:oc_${"b".padStart(32, "0")}`;

const world = fs.existsSync(worldFile)
  ? JSON.parse(fs.readFileSync(worldFile, "utf8"))
  : { posted: {}, visible: [], starts: [], transcripts: {}, lives: 0 };
world.lives += 1;
const save = () => fs.writeFileSync(worldFile, JSON.stringify(world));
save();

const registry = { v: 1, bridges: new Map(), listeners: new Set() };
const fake = createFakeBridge({ channel: "feishu", runMs: 30 });
let n = 0;
fake.post = async (p) => {
  const prior = world.posted[p.idempotencyKey];
  if (prior) return { messageId: prior, deduped: true }; // Feishu im.message.create uuid dedupe
  const messageId = `om_${world.lives}_${(n += 1)}`;
  world.posted[p.idempotencyKey] = messageId;
  world.visible.push({ messageId, text: p.text, replyTo: p.replyToMessageId ?? null, key: p.idempotencyKey });
  save();
  return { messageId };
};
const origStart = fake.start;
fake.start = async (req) => {
  const out = await origStart(req);
  world.starts.push({ kind: req.kind, id: req.id, attempt: req.attempt, runId: req.runId, messageSid: req.messageSid, status: out.status, life: world.lives });
  if (out.status === "started") {
    (world.transcripts[req.sessionKey] ??= []).push({ role: "user", content: req.promptText, provenance: req.provenance });
    out.done.then((o) => {
      for (const f of o.finals ?? []) if (f.text) world.transcripts[req.sessionKey].push({ role: "assistant", content: f.text });
      save();
    }, () => {});
  }
  save();
  return out;
};
fake.register(registry);

const logger = { info: () => {}, debug: () => {}, warn: (m) => process.stderr.write(`warn ${m}\n`), error: (m) => process.stderr.write(`error ${m}\n`) };
const bridge = createBridgeTransport({ registry, logger });
const cfg = { commands: { ownerAllowFrom: [`feishu:${OWNER}`] } };
const routes = createRoutes({ getSessionEntry: () => ({ sessionId: "s" }), getConfig: () => cfg, bridges: bridge.bridges, logger });
const ledger = await Ledger.open(dir, { logger }); // VSR_CRASH_AT from the environment; default onCrash exits 86
const engine = new Engine({
  ledger, config: resolvePluginConfig({}), routes, bridge, logger,
  agent: { post: async () => { throw new Error("no agent transport here"); }, start: async () => ({ status: "rejected", code: "INTERNAL", message: "no agent", started: false }) },
  sdk: { resolveActiveEmbeddedRunSessionId: () => undefined },
  runtime: { getSessionMessages: async ({ sessionKey }) => ({ messages: (world.transcripts[sessionKey] ?? []).slice(-20) }) },
  timing: { pumpDebounceMs: 5, busyBackoffMs: [20, 40], idleRecheckMs: 30, backgroundPollMs: 30, anchorPostMs: 2_000, postRetryMs: [10, 20, 30], sweepMs: 50, recoveryObserveMs: 200, transcriptGapMs: 0, bridgeReadyMs: 200, lostRunGraceMs: 200 },
  taskBridge: () => undefined, flushSeam: () => undefined, env: {},
});
engine.start();

const params = (to, message, call) => ({
  v: 1, idempotencyKey: sendIdempotencyKey({ requesterSessionKey: DM, requesterRunId: "root-run-1", toolCallId: call }), toolCallId: call,
  requester: { sessionKey: DM, replySessionKey: DM, agentId: "makaron", runId: "root-run-1", channel: "feishu", accountId: "default", to: `user:${OWNER}`, threadId: null, senderId: OWNER, senderIsOwner: true },
  target: { sessionKey: to, agentId: "makaron", displayKey: to, created: false },
  message, mode: "async", inlineTimeoutMs: 0,
});

if (mode === "first") {
  await engine.send(params(X, "写一份上线通知", "call-1"));
  await engine.send(params(ROOM, "整理一下测试结果", "call-2"));
  engine.onAgentEvent({ runId: "root-run-1", sessionKey: DM, stream: "lifecycle", seq: 1, ts: Date.now(), data: { phase: "end" } });
} else {
  await recover(engine);
}

const quiet = () => {
  const sends = [...ledger.sends.values()];
  const batches = [...ledger.batches.values()];
  return sends.length > 0
    && sends.every((s) => ["handed_back", "delivered_inline", "skipped", "cancelled"].includes(s.phase))
    && batches.every((b) => ["woken", "skipped"].includes(b.phase) && (b.phase !== "woken" || b.wake.endedAt))
    && engine.running.size === 0;
};
const deadline = Date.now() + 8_000;
while (!quiet()) {
  if (Date.now() > deadline) {
    process.stdout.write(JSON.stringify({ timeout: true, sends: [...ledger.sends.values()].map((s) => [s.sendId, s.phase]), batches: [...ledger.batches.values()].map((b) => [b.batchId, b.phase]) }));
    process.exit(2);
  }
  await new Promise((r) => setTimeout(r, 10));
}
await ledger.flush();
process.stdout.write(JSON.stringify({
  sends: [...ledger.sends.values()].map((s) => ({ sendId: s.sendId, code: s.code, phase: s.phase, failure: s.failure?.class ?? null, result: s.result?.text ?? null, batchId: s.batchId })),
  batches: [...ledger.batches.values()].map((b) => ({ batchId: b.batchId, phase: b.phase, members: b.members, wake: b.wake })),
}));
await engine.stop();
await ledger.close();
clearInterval(keepAlive);
process.exit(0);
