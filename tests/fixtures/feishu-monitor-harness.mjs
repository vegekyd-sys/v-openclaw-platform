// Loads the Feishu monitor chunk (monitor.account-*.js, as V runs it or as a patch generates it)
// with every import replaced by a stub, so its real code can run in a test process with no
// Gateway, no Feishu credentials and no network.
//
// compileFeishuMonitor() rewrites the chunk's ESM import lines into lookups on a stub table and
// returns its exports plus any top-level names asked for in `expose`. createFeishuHarness()
// supplies a stub table that records every visible side effect (messages, cards, CardKit calls,
// typing reactions) in `harness.visible`, a fake Feishu client, and a fake core whose
// `inbound.run` hands each prepared turn to `harness.core(turn)` (a test script).
import { createRequire } from "node:module";
import vm from "node:vm";

import { normalizeAccountId } from "../../apps/v-session-relay/plugin/core/contracts.js";

const require = createRequire(import.meta.url);

const IMPORT_RE = /^import (.+) from "([^"]+)";$/u;

/** Rewrites the chunk's import/export lines; returns a function (imp, dynImp) => namespace. */
export function compileFeishuMonitor(source, { expose = [], filename = "monitor.account.js" } = {}) {
  const exportNames = [];
  const lines = source.split("\n").map((line) => {
    const exported = /^export \{ ([^}]+) \};$/u.exec(line);
    if (exported) {
      exportNames.push(...exported[1].split(",").map((name) => name.trim()).filter(Boolean));
      return "";
    }
    if (!line.startsWith("import ")) return line;
    const m = IMPORT_RE.exec(line);
    if (!m) throw new Error(`unsupported import line: ${line.slice(0, 100)}`);
    const [, clause, spec] = m;
    const s = JSON.stringify(spec);
    const ns = /^\* as ([\w$]+)$/u.exec(clause.trim());
    if (ns) return `const ${ns[1]} = __imp(${s});`;
    const parts = [];
    let rest = clause.trim();
    const def = /^([\w$]+)\s*(?:,\s*(\{.*\}))?$/u.exec(rest);
    if (def) {
      parts.push(`const ${def[1]} = __imp(${s}).default;`);
      rest = def[2] ?? "";
    }
    if (rest.startsWith("{")) {
      const names = rest.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
        const mm = /^([\w$]+)(?: as ([\w$]+))?$/u.exec(x);
        if (!mm) throw new Error(`unsupported import binding: ${x}`);
        return mm[2] ? `${mm[1]}: ${mm[2]}` : mm[1];
      });
      parts.push(`const { ${names.join(", ")} } = __imp(${s});`);
    }
    return parts.join(" ");
  });
  const body = `"use strict";\n${lines.join("\n").replace(/\bawait import\(/gu, "await __dynImp(")}\nreturn { ${[...exportNames, ...expose].join(", ")} };\n`;
  const fn = vm.compileFunction(body, ["__imp", "__dynImp"], { filename });
  return (imp, dynImp) => fn(imp, dynImp);
}

const BUILTINS = new Set(["node:fs", "node:os", "node:path", "node:crypto", "node:http"]);

function memoryReplayGuard() {
  const seen = new Map();
  return {
    async claim(key) {
      const k = String(key ?? "").trim();
      if (!k) return { kind: "invalid" };
      if (seen.get(k) === "committed") return { kind: "duplicate" };
      if (seen.get(k) === "inflight") return { kind: "inflight", pending: Promise.resolve() };
      seen.set(k, "inflight");
      return { kind: "claimed", handle: { commit: async () => { seen.set(k, "committed"); return true; }, release: () => { seen.delete(k); } } };
    },
    async forget(key) { seen.delete(String(key)); return true; },
    async hasRecent(key) { return seen.get(String(key)) === "committed"; },
    async warmup() { return 0; },
    seen,
  };
}

/**
 * A loaded monitor with stubs. Options:
 *   source        the chunk text
 *   accountConfig Feishu account config (renderMode, streaming, typingIndicator…)
 *   route(peer)   → resolveAgentRoute result for a peer ({ kind, id })
 *   expose        extra top-level names to return
 */
export function createFeishuHarness({ source, accountConfig = {}, route, expose = [] } = {}) {
  const harness = {
    visible: [], // every user-visible side effect
    api: [], // every Feishu API call (visible or not)
    turns: [], // prepared turns the fake core received
    logs: [],
    handlers: null, // event handlers the monitor registered
    chats: new Map(), // chat_id -> { code, msg, data } for im.chat.get
    clientFailures: [], // queued failures for im.message.create/reply: { method, error }
    core: async () => ({ dispatched: false }),
    messageSeq: 0,
  };
  const account = {
    accountId: "default",
    appId: "cli_test_app",
    appSecret: "test-secret",
    domain: "feishu",
    enabled: true,
    configured: true,
    config: { connectionMode: "websocket", typingIndicator: true, ...accountConfig },
  };
  harness.account = account;
  const cfg = { channels: { feishu: { ...account.config } }, session: {} };
  harness.cfg = cfg;

  const record = (entry) => { harness.visible.push(entry); return entry; };
  const nextMessageId = () => `om_test_${++harness.messageSeq}`;
  const failFor = (method) => {
    const i = harness.clientFailures.findIndex((f) => f.method === method);
    if (i < 0) return;
    const [f] = harness.clientFailures.splice(i, 1);
    throw f.error;
  };
  const client = {
    im: {
      message: {
        create: async (req) => {
          harness.api.push({ method: "im.message.create", req });
          failFor("create");
          const receiveId = req?.data?.receive_id;
          record({ kind: "message.create", req });
          return { code: 0, data: { message_id: nextMessageId(), chat_id: String(receiveId).startsWith("ou_") ? "oc_d1dec7" : receiveId } };
        },
        reply: async (req) => {
          harness.api.push({ method: "im.message.reply", req });
          failFor("reply");
          record({ kind: "message.reply", req });
          return { code: 0, data: { message_id: nextMessageId(), chat_id: "oc_unknown" } };
        },
        update: async (req) => {
          harness.api.push({ method: "im.message.update", req });
          failFor("update");
          record({ kind: "message.update", req });
          return { code: 0, data: {} };
        },
        patch: async (req) => { harness.api.push({ method: "im.message.patch", req }); record({ kind: "message.patch", req }); return { code: 0 }; },
        get: async (req) => { harness.api.push({ method: "im.message.get", req }); return { code: 0, data: { items: [] } }; },
      },
      messageReaction: {
        create: async (req) => { harness.api.push({ method: "im.messageReaction.create", req }); record({ kind: "reaction", req }); return { code: 0, data: { reaction_id: "r1" } }; },
        delete: async (req) => { harness.api.push({ method: "im.messageReaction.delete", req }); return { code: 0 }; },
      },
      chat: {
        get: async (req) => {
          harness.api.push({ method: "im.chat.get", req });
          const chat = harness.chats.get(req?.path?.chat_id);
          if (chat?.throw) throw chat.throw;
          return chat ?? { code: 232011, msg: "Operator can NOT be out of the chat." };
        },
      },
    },
  };
  harness.client = client;

  const channelRuntime = {
    inbound: {
      buildContext: (p) => ({
        Body: p.message.body,
        BodyForAgent: p.message.bodyForAgent,
        RawBody: p.message.rawBody,
        CommandBody: p.message.commandBody,
        From: p.from,
        To: p.reply?.to,
        SenderId: p.sender.id,
        SenderName: p.sender.name,
        MessageSid: p.messageId,
        SessionKey: p.route.routeSessionKey,
        AccountId: p.route.accountId,
        CommandAuthorized: p.access.commands.authorized,
        GroupSystemPrompt: p.supplemental?.groupSystemPrompt,
        ...p.extra, // the core spreads extra last (context.ts:592)
        __params: p,
      }),
      run: async ({ adapter }) => {
        const turn = adapter.resolveTurn();
        harness.turns.push(turn);
        return await harness.core(turn);
      },
    },
    routing: {
      resolveAgentRoute: ({ peer, accountId }) => route?.(peer, accountId) ?? ({
        agentId: "makaron",
        accountId,
        sessionKey: `agent:makaron:feishu:${peer.kind}:${peer.id}`,
        mainSessionKey: "agent:makaron:main",
        matchedBy: "binding",
        dmScope: "per-channel-peer",
      }),
    },
    commands: { shouldComputeCommandAuthorized: () => false, isControlCommandMessage: () => false },
    debounce: {
      resolveInboundDebounceMs: () => 0,
      createInboundDebouncer: ({ onFlush }) => ({
        enqueue: async (entry) => {
          await onFlush([entry], ({ dispatch }) => dispatch({ abortSignal: { aborted: false }, onAbandoned: async () => {} }));
        },
      }),
    },
    session: { readSessionUpdatedAt: () => undefined },
    text: {
      resolveTextChunkLimit: () => 4000,
      resolveChunkMode: () => "length",
      resolveMarkdownTableMode: () => "off",
      convertMarkdownTables: (text) => text,
      chunkMarkdownTextWithMode: (text) => [text],
    },
  };
  harness.channelRuntime = channelRuntime;
  const feishuRuntime = { channel: channelRuntime, config: { current: () => cfg } };

  const sendRecord = (kind) => async (p) => { record({ kind, to: p.to, text: p.text, replyToMessageId: p.replyToMessageId }); return { messageId: nextMessageId(), chatId: "oc_x" }; };
  const stubs = {
    "./v-feishu-approvals.js": { vFeishuApprovalCardAction: () => undefined, vFeishuApprovalRegisterContext: () => undefined },
    "./accounts-RwSyseKr.js": { o: () => account, s: () => account, t: { resolveFeishuAccount: () => account } },
    "./targets-BTQCYRZQ.js": { i: (id) => (String(id).includes("ou_") ? "open_id" : "chat_id") },
    "./reply-delivery-result-CEFTDA3f.js": {
      M: (t) => t === "group" || t === "topic_group",
      bt: () => undefined,
      _t: () => false,
      xt: async () => ({ ingress: { admission: "dispatch" } }),
      wt: () => ({ requireMention: false }),
      St: async () => ({ senderAccess: { decision: "allow" }, ingress: { admission: "dispatch" }, commandAccess: { authorized: true } }),
      yt: async () => ({ ingress: { admission: harness.dmAdmission ?? "dispatch" }, senderAccess: { effectiveAllowFrom: [] }, commandAccess: { authorized: true } }),
      vt: (x) => x,
      D: sendRecord("sendMessageFeishu"),
      E: sendRecord("sendCardFeishu"),
      O: sendRecord("sendStructuredCardFeishu"),
      y: async (p) => { record({ kind: "sendMediaFeishu", to: p.to, mediaUrl: p.mediaUrl }); return { messageId: nextMessageId() }; },
      w: async () => null,
      g: async (payload) => ({ payload, card: undefined }),
      u: (payload) => ({ payload }),
      x: () => false,
      n: (p) => ({ visibleReplySent: p.visibleReplySent === true, content: p.content, results: p.results ?? [] }),
      i: Object.freeze({ visibleReplySent: false, results: [] }),
      r: (list, content) => ({ visibleReplySent: (list ?? []).some((r) => r?.visibleReplySent), content, results: list ?? [] }),
      t: (error) => error,
      st: (opts) => [opts.text],
      S: (opts) => [opts.text],
      ct: (text) => text,
      Et: (chat) => chat?.chat_type,
    },
    "./client-DMbIL3UH.js": {
      r: () => client,
      n: () => ({ register: (handlers) => { harness.handlers = handlers; } }),
      i: async () => ({ start: async () => {}, close: () => {} }),
      s: () => 30_000,
      a: () => "test-agent",
    },
    "./chat-CxXaPTuO.js": {
      // the real getChatInfo (chat-CxXaPTuO.js:52-71), minus the fields the bridge does not read
      r: async (c, chatId) => {
        const res = await c.im.chat.get({ path: { chat_id: chatId } });
        if (res.code !== 0) throw new Error(res.msg);
        return { chat_id: chatId, name: res.data?.name, owner_id: res.data?.owner_id, user_count: res.data?.user_count };
      },
    },
    "./runtime-C5JxBWZp.js": { t: () => feishuRuntime },
    "./monitor-DoMmOfaD.js": { t: async () => ({ botOpenId: "ou_b07", botName: "V", source: "fetch" }) },
    "./thread-bindings-BiL1wGqK.js": { t: () => ({ stop: () => {} }) },
    "./runtime-api.js": {
      normalizeAgentId: (x) => String(x ?? "").trim().toLowerCase(),
      resolveChannelContextVisibilityMode: () => "all",
      evaluateSupplementalContextVisibility: () => ({ include: true }),
    },
    "openclaw/plugin-sdk/routing": {
      normalizeAccountId,
      resolveAgentRoute: (p) => channelRuntime.routing.resolveAgentRoute(p),
      resolveInboundLastRouteSessionKey: ({ sessionKey }) => sessionKey,
    },
    "openclaw/plugin-sdk/session-store-runtime": { getSessionEntry: () => undefined, resolveStorePath: () => "/nonexistent/sessions" },
    "openclaw/plugin-sdk/persistent-dedupe": { createChannelReplayGuard: () => memoryReplayGuard() },
    "openclaw/plugin-sdk/channel-outbound": {
      DEFAULT_INGRESS_ADOPTION_STALL_MS: 60_000,
      bindIngressLifecycleToReplyOptions: () => ({}),
      createChannelMessageReplyPipeline: ({ typing }) => ({
        typingCallbacks: { onReplyStart: () => typing?.start?.(), onIdle: () => typing?.stop?.(), onCleanup: () => {} },
        responsePrefix: undefined,
        responsePrefixContextProvider: () => ({}),
        onModelSelected: () => undefined,
      }),
      resolveChannelPreviewStreamMode: (config, fallback) => config?.streaming ?? fallback,
      resolveChannelStreamingBlockEnabled: () => undefined,
      resolveAgentOutboundIdentity: () => undefined,
      formatChannelProgressDraftLineForEntry: () => "",
      isChannelProgressDraftWorkToolName: () => false,
    },
    "openclaw/plugin-sdk/channel-pairing": {
      createChannelPairingController: () => ({
        readAllowFromStore: async () => [],
        issueChallenge: async (p) => { await p.sendPairingReply("pairing code: 1234"); },
      }),
    },
    "openclaw/plugin-sdk/conversation-runtime": {
      resolveConfiguredBindingRoute: ({ route: r }) => ({ route: r, bindingResolution: null }),
      resolveRuntimeConversationBindingRoute: ({ route: r }) => ({ route: r }),
      ensureConfiguredBindingRouteReady: async () => ({ ok: true }),
    },
    "openclaw/plugin-sdk/error-runtime": {
      formatErrorMessage: (e) => (e instanceof Error ? e.message : String(e)),
      toStringifiedError: (e) => (e instanceof Error ? e : new Error(String(e))),
      collectErrorGraphCandidates: () => [],
    },
    "openclaw/plugin-sdk/number-runtime": {
      parseStrictNonNegativeInteger: (v) => (/^\d+$/u.test(String(v ?? "").trim()) ? Number(String(v).trim()) : undefined),
      resolveTimerTimeoutMs: (n, d) => (Number.isFinite(n) && n > 0 ? n : d),
      asDateTimestampMs: (v) => (Number.isFinite(v) ? v : undefined),
      isFutureDateTimestampMs: () => false,
      resolveDateTimestampMs: (v) => v,
      resolveExpiresAtMsFromDurationMs: (ms) => Date.now() + ms,
      resolveExpiresAtMsFromDurationSeconds: (s) => Date.now() + s * 1000,
    },
    "openclaw/plugin-sdk/string-coerce-runtime": {
      asBoolean: (v) => v === true,
      asNullableRecord: (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null),
      isRecord: (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v),
      normalizeLowercaseStringOrEmpty: (v) => (typeof v === "string" ? v.trim().toLowerCase() : ""),
      normalizeNullableString: (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
      normalizeOptionalLowercaseString: (v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined),
      normalizeOptionalString: (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
      readStringValue: (v) => (typeof v === "string" ? v : undefined),
      uniqueStrings: (list) => [...new Set(list)],
    },
    "openclaw/plugin-sdk/text-chunking": { stripReasoningTagsFromText: (text) => text },
    "openclaw/plugin-sdk/runtime-group-policy": {
      resolveDefaultGroupPolicy: () => "open",
      resolveOpenProviderRuntimeGroupPolicy: () => ({ groupPolicy: "open", providerMissingFallbackApplied: false }),
      warnMissingProviderGroupPolicyFallbackOnce: () => undefined,
    },
    "openclaw/plugin-sdk/channel-ingress-runtime": { fanInChannelIngressLifecycles: () => ({ lifecycle: undefined }) },
    "openclaw/plugin-sdk/channel-inbound": {
      formatAgentEnvelope: ({ body }) => body,
      resolveEnvelopeFormatOptions: () => ({}),
      formatInboundMediaUnavailableText: ({ body }) => body,
      toInboundMediaFactsWithMetadata: async () => [],
      isChannelPartialDeliveryError: () => false,
      recordChannelBotPairLoopAndCheckSuppression: () => ({ suppressed: false }),
      resolveInboundReplyDispatchCounts: () => ({}),
    },
    "openclaw/plugin-sdk/reply-payload": {
      // the real resolveSendableOutboundReplyParts (src/infra/outbound/reply-payload-parts.ts)
      resolveSendableOutboundReplyParts: (payload, options) => {
        const text = options?.text ?? payload.text ?? "";
        const mediaUrls = [...(payload.mediaUrls ?? []), ...(payload.mediaUrl ? [payload.mediaUrl] : [])].filter((u) => typeof u === "string" && u.trim());
        return { text, trimmedText: text.trim(), mediaUrls, mediaCount: mediaUrls.length, hasText: Boolean(text.trim()), hasMedia: mediaUrls.length > 0, hasContent: Boolean(text.trim()) || mediaUrls.length > 0 };
      },
      getReplyPayloadTtsSupplement: () => undefined,
      resolveTextChunksWithFallback: (text, chunks) => (chunks?.length ? chunks : [text]),
      sendMediaWithLeadingCaption: async ({ mediaUrls, send }) => { for (const mediaUrl of mediaUrls) await send({ mediaUrl }); },
    },
    "openclaw/plugin-sdk/security-runtime": { resolvePinnedMainDmOwnerFromAllowlist: () => null, safeEqualSecret: (a, b) => a === b },
    "openclaw/plugin-sdk/reply-history": {
      DEFAULT_GROUP_HISTORY_LIMIT: 20,
      createChannelHistoryWindow: () => ({
        record: () => {},
        buildPendingContext: ({ currentMessage }) => `PENDING-GROUP-HISTORY\n${currentMessage}`,
        buildInboundHistory: () => undefined,
        clear: () => {},
      }),
    },
    "openclaw/plugin-sdk/text-utility-runtime": { escapeHtml: (s) => s, sliceUtf16Safe: (s, a, b) => String(s).slice(a, b), truncateUtf16Safe: (s, n) => String(s).slice(0, n) },
    "openclaw/plugin-sdk/collection-runtime": { pruneMapToMaxSize: () => {} },
    "openclaw/plugin-sdk/agent-runtime": { formatReasoningMessage: (t) => t, resolveHumanDelayConfig: () => undefined },
    "openclaw/plugin-sdk/channel-feedback": { logTypingFailure: () => {} },
    "openclaw/plugin-sdk/plugin-runtime": { getGlobalHookRunner: () => null },
    "openclaw/plugin-sdk/gateway-runtime": {
      callGatewayFromCli: async () => { throw new Error("no Gateway in tests"); },
      channelBlockedPatch: (x) => x,
      channelReadyPatch: (x) => x,
    },
    "openclaw/plugin-sdk/question-gateway-runtime": {
      questionGatewayRuntime: { subscribeRequested: () => () => {}, registerChannelDelivery: () => {} },
    },
    "openclaw/plugin-sdk/command-primitives-runtime": {
      isAbortRequestText: (t) => /^\/?stop$/iu.test(String(t).trim()),
      isBtwRequestText: () => false,
    },
    "openclaw/plugin-sdk/ssrf-runtime": {
      // CardKit / token calls of the streaming card: recorded as visible, then refused
      fetchWithSsrFGuard: async (p) => {
        record({ kind: "cardkit", url: p?.url });
        throw new Error("network disabled in tests");
      },
    },
  };
  harness.stubs = stubs;

  const fallback = (spec, name) => {
    const fn = (...args) => { harness.logs.push(`stub ${spec}#${String(name)} called`); return undefined; };
    return fn;
  };
  const moduleFor = (spec) => {
    if (BUILTINS.has(spec)) {
      const mod = require(spec);
      return { ...mod, default: mod };
    }
    const table = stubs[spec] ?? {};
    return new Proxy(table, { get: (target, name) => (name in target ? target[name] : fallback(spec, name)) });
  };
  const load = compileFeishuMonitor(source, { expose });
  harness.module = load(moduleFor, async (spec) => moduleFor(spec));
  harness.runtime = {
    log: (m) => harness.logs.push(String(m)),
    error: (m) => harness.logs.push(`ERROR ${String(m)}`),
  };

  /** Starts monitorSingleAccount; resolves once the message handlers are registered. */
  harness.startMonitor = async () => {
    const abort = new AbortController();
    const running = harness.module.monitorSingleAccount({
      cfg,
      account,
      runtime: harness.runtime,
      abortSignal: abort.signal,
      channelRuntime,
      botOpenIdSource: { kind: "prefetched", botOpenId: "ou_b07", botName: "V", source: "config" },
    });
    for (let i = 0; i < 100 && !harness.handlers; i += 1) await new Promise((r) => setImmediate(r));
    if (!harness.handlers) throw new Error(`monitor did not register handlers: ${harness.logs.join(" | ")}`);
    harness.stopMonitor = async () => { abort.abort(); await running; };
    return { running };
  };
  return harness;
}
