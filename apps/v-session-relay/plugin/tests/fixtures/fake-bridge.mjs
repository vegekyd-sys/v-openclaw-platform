// A fake InterSessionBridge (design §2.a) for plugin tests: no channel, no Gateway.
//
// Everything it is asked to do lands in `bridge.calls` (method, args, outcome), and every
// visible side effect in `bridge.visible` (posts and edits), so a test can assert "zero
// visible output while BUSY" directly. Behaviour is injected per call:
//
//   createFakeBridge({
//     channel: "feishu", accountId: "default",
//     start: [{ status: "busy", reason: "active_run" }, { status: "started", finals: [{ text: "ok" }] }],
//     post:  [{ fail: "CHANNEL_DOWN", transient: true }],      // then auto message ids
//     routes: { "agent:makaron:feishu:group:oc_x": { ...route } }, // else derived from the key (feishu/telegram)
//     startDelayMs, postDelayMs, runMs,                          // async latency
//     holdRuns: true,                                            // done waits for finishRun(runId, outcome)
//   })
//
// A start script item is one of
//   { status: "started", runId?, finals?, runStatus?, error?, visibleReplySent?, runMs? }
//   { status: "busy", reason }
//   { status: "rejected", code, message? }
//   { throw: "message" }                                         // start() rejects
// When the script runs out, `defaultStart` (started, ok, one final "done <id>") applies.
import {
  BridgeError,
  CHANNEL_CAPS,
  normalizeAccountId,
  registerBridge,
  unregisterBridge,
  validateStartOutcome,
  validateStartRequest,
} from "../../core/contracts.js";

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Feishu/Telegram route derived from a session key (§2.a resolveRoute rules); DingTalk/WeCom need a stored `to`. */
export function deriveRoute(sessionKey, { channel, accountId = "default", ownerIds = [], delivery } = {}) {
  const parts = String(sessionKey).split(":");
  // agent:<agentId>:<channel>:<direct|group>:<peer>
  const [, , keyChannel, chatType, peer] = parts;
  const ch = channel ?? keyChannel;
  if (delivery?.to) {
    const chatId = delivery.to.replace(/^(chat|user):/u, "");
    const direct = /^user:/u.test(delivery.to) || chatType === "direct";
    return {
      ok: true,
      route: {
        channel: ch, accountId: normalizeAccountId(delivery.accountId ?? accountId), to: delivery.to, chatId,
        chatType: direct ? "direct" : "group",
        ...(direct ? { peerId: chatId } : {}),
        humans: direct ? (ownerIds.includes(chatId) ? "owner_only" : "single_peer") : "unknown",
      },
    };
  }
  if (ch !== keyChannel || !["direct", "group"].includes(chatType) || !peer) return { ok: false, code: "NO_ROUTE", reason: "no delivery address" };
  if (ch === "feishu") {
    const ok = chatType === "group" ? /^oc_[0-9a-f]+$/u.test(peer) : /^ou_[0-9a-f]+$/u.test(peer);
    if (!ok) return { ok: false, code: "NO_ROUTE", reason: "key does not carry a Feishu id" };
    const to = chatType === "group" ? `chat:${peer}` : `user:${peer}`;
    return {
      ok: true,
      route: {
        channel: ch, accountId: normalizeAccountId(accountId), to, chatId: peer, chatType,
        ...(chatType === "direct" ? { peerId: peer } : {}),
        humans: chatType === "direct" ? (ownerIds.includes(peer) ? "owner_only" : "single_peer") : "unknown",
      },
    };
  }
  if (ch === "telegram") {
    return {
      ok: true,
      route: {
        channel: ch, accountId: normalizeAccountId(accountId), to: peer, chatId: peer, chatType,
        ...(chatType === "direct" ? { peerId: peer } : {}),
        humans: chatType === "direct" ? (ownerIds.includes(peer) ? "owner_only" : "single_peer") : "shared",
      },
    };
  }
  return { ok: false, code: "NO_ROUTE", reason: `${ch} needs a stored delivery address` };
}

export function createFakeBridge(options = {}) {
  const channel = options.channel ?? "feishu";
  const accountId = normalizeAccountId(options.accountId);
  const caps = { ...(CHANNEL_CAPS[channel] ?? CHANNEL_CAPS.feishu), ...(options.caps ?? {}) };
  const startScript = [...(options.start ?? [])];
  const postScript = [...(options.post ?? [])];
  const routes = new Map(Object.entries(options.routes ?? {}));
  const calls = [];
  const visible = [];
  const runs = new Map(); // runId -> { req, deferred, outcome }
  const postedByKey = new Map(); // idempotencyKey -> messageId (only when caps.idempotentPost)
  let posts = 0;
  const now = options.now ?? (() => Date.now());

  const defaultStart = options.defaultStart ?? ((req) => ({ status: "started", finals: [{ text: `done ${req.id}` }] }));

  const snapshot = (value) => {
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };
  function record(method, args) {
    const entry = { method, at: now(), args: snapshot(args) };
    calls.push(entry);
    return entry;
  }

  const runOutcome = (item, error) => ({
    status: item.runStatus ?? (error ? "error" : "ok"),
    finals: item.finals ?? [],
    visibleReplySent: item.visibleReplySent ?? (item.finals ?? []).length > 0,
    finalCount: (item.finals ?? []).length,
    ...(item.error ?? error ? { error: item.error ?? error } : {}),
  });

  const bridge = {
    v: 1,
    channel,
    accountId,
    caps,

    async resolveRoute(q) {
      const entry = record("resolveRoute", q);
      if (options.resolveRoute) return (entry.outcome = await options.resolveRoute(q));
      const fixed = routes.get(q.sessionKey);
      const out = fixed
        ? (fixed.ok === false ? fixed : { ok: true, route: fixed })
        : deriveRoute(q.sessionKey, { channel, accountId, ownerIds: q.ownerIds ?? [], delivery: q.delivery });
      entry.outcome = out;
      return out;
    },

    async post(p) {
      const entry = record("post", p);
      await sleep(options.postDelayMs ?? 0);
      const item = postScript.shift();
      if (item?.fail) {
        const error = new BridgeError(item.fail, item.message ?? `fake post failed: ${item.fail}`, { transient: item.transient ?? false });
        entry.outcome = { error: { code: error.code, transient: error.transient } };
        throw error;
      }
      if (caps.idempotentPost && postedByKey.has(p.idempotencyKey)) {
        const out = { messageId: postedByKey.get(p.idempotencyKey), deduped: true };
        entry.outcome = out;
        return out;
      }
      posts += 1;
      const messageId = item?.messageId ?? `om_fake_${channel}_${posts}`;
      if (caps.idempotentPost) postedByKey.set(p.idempotencyKey, messageId);
      visible.push({ kind: "post", messageId, to: p.route?.to, text: p.text, replyToMessageId: p.replyToMessageId ?? null });
      const out = { messageId };
      entry.outcome = out;
      return out;
    },

    async start(req) {
      const entry = record("start", req);
      const check = validateStartRequest(req);
      if (!check.ok) {
        entry.outcome = { invalid: check.errors };
        if (options.onInvalid === "reject") return { status: "rejected", code: "INTERNAL", message: check.errors.join("; "), started: false };
        throw new TypeError(`fake bridge: invalid StartRequest: ${check.errors.join("; ")}`);
      }
      await sleep(options.startDelayMs ?? 0);
      const item = startScript.shift() ?? defaultStart(req);
      if (item.throw) {
        entry.outcome = { threw: item.throw };
        throw new Error(item.throw);
      }
      let outcome;
      if (item.status === "busy") outcome = { status: "busy", reason: item.reason ?? "active_run" };
      else if (item.status === "rejected") outcome = { status: "rejected", code: item.code ?? "GATED", message: item.message ?? "", started: false };
      else {
        const runId = item.runId ?? req.runId; // a harness that ignores the preset runId reports its own (A2)
        const d = deferred();
        runs.set(runId, { req, deferred: d, item, finished: false });
        if (!(options.holdRuns || item.hold)) {
          const ms = item.runMs ?? options.runMs ?? 0;
          setTimeout(() => bridge.finishRun(runId), ms);
        }
        outcome = { status: "started", runId, done: d.promise };
      }
      const valid = validateStartOutcome(outcome);
      if (!valid.ok) throw new TypeError(`fake bridge produced an invalid outcome: ${valid.errors.join("; ")}`);
      entry.outcome = { ...outcome, done: outcome.done ? "[promise]" : undefined };
      return outcome;
    },

    async edit(p) {
      record("edit", p);
      visible.push({ kind: "edit", messageId: p.messageId, text: p.text });
    },

    // ---------------------------------------------------------------- test controls
    calls,
    visible,
    runs,
    /** Resolve a started run's `done` (default: the scripted outcome). */
    finishRun(runId, outcome) {
      const run = runs.get(runId);
      if (!run || run.finished) return false;
      run.finished = true;
      run.deferred.resolve(outcome ?? runOutcome(run.item));
      return true;
    },
    /** Reject a started run's `done` (a crashed transport, not a failed turn). */
    failRun(runId, error = new Error("fake run lost")) {
      const run = runs.get(runId);
      if (!run || run.finished) return false;
      run.finished = true;
      run.deferred.reject(error);
      return true;
    },
    queueStart(...items) { startScript.push(...items); },
    queuePost(...items) { postScript.push(...items); },
    setRoute(sessionKey, route) { routes.set(sessionKey, route); },
    callsOf(method) { return calls.filter((c) => c.method === method); },
    register(reg) { return registerBridge(bridge, reg); },
    unregister(reg) { return unregisterBridge(bridge, reg); },
  };
  if (!caps.editPost) delete bridge.edit;
  return bridge;
}
