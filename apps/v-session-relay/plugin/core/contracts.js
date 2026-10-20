// v-session-relay 2.0 contracts (docs/inter-session/design.md §2, frozen by WP0).
//
// Every name another package shares with this plugin lives here: the globalThis
// symbols the dist patches and the plugin meet on, the Gateway method names and
// scopes, the id / #code / runId / MessageSid generators, the error and policy
// codes, the default limits, and the validators for the channel inbound bridge
// (§2.a) and its StartRequest. The dist patches inline the same literals; their
// tests assert that both sides agree.
//
// ESM, Node 22, no dependencies (node: built-ins only).

import { createHash, randomBytes } from "node:crypto";

export const CONTRACT_VERSION = 1;

// ---------------------------------------------------------------- globalThis seams (§2.a)

/** Channel inbound bridge registry: `globalThis[BRIDGES] = { v, bridges, listeners }`. */
export const BRIDGES = Symbol.for("openclaw.v.interSessionInboundBridges");
/** WP1 exports `{ v: 1, activeAfterYield({ sessionKey, providedReplyOperation }) }` from agent-runner.runtime. */
export const DEFERRED_MEMORY_FLUSH = Symbol.for("openclaw.v.deferredMemoryFlush");
/** WP2 writes `Map<requesterRunId, { at, targets: Map<sessionKey, { code, label, historyReads }> }>`. */
export const SESSIONS_SEND_ACCEPTED = Symbol.for("openclaw.v.sessionsSendAccepted");
/** WP3 adds `extraSources: Set<(sessionKey) => TaskLike[]>` to the task registry bridge. */
export const TASK_REGISTRY_BRIDGE = Symbol.for("openclaw.v.taskRegistryBridge");

export const SYMBOL_KEYS = Object.freeze({
  bridges: "openclaw.v.interSessionInboundBridges",
  deferredMemoryFlush: "openclaw.v.deferredMemoryFlush",
  sessionsSendAccepted: "openclaw.v.sessionsSendAccepted",
  taskRegistryBridge: "openclaw.v.taskRegistryBridge",
});

// ---------------------------------------------------------------- dist patch markers (§3)

export const MARKERS = Object.freeze({
  sessionsSendRelay: "v-sessions-send-relay-v3",
  sessionsSendRelayTools: "v-sessions-send-relay-tools-v1",
  interSessionExclusive: "v-inter-session-exclusive-v1",
  taskBridgeExtraSources: "v-task-bridge-extra-sources-v1",
  feishuBridge: "v-feishu-inter-session-bridge-v1",
  telegramBridge: "v-telegram-inter-session-bridge-v1",
  dingtalkBridge: "v-dingtalk-inter-session-bridge-v1",
  wecomBridge: "v-wecom-inter-session-bridge-v1",
  experienceSessionKind: "v-experience-session-kind-v1",
});

// ---------------------------------------------------------------- Gateway methods (§2.b)

export const OPERATOR_SCOPES = Object.freeze({
  admin: "operator.admin",
  read: "operator.read",
  write: "operator.write",
});

export const METHODS = Object.freeze({
  send: "vrelay.send",
  wait: "vrelay.wait",
  get: "vrelay.get",
  list: "vrelay.list",
  cancel: "vrelay.cancel",
});

/** Scope each plugin method is registered with (`api.registerGatewayMethod(name, handler, { scope })`). */
export const METHOD_SCOPES = Object.freeze({
  [METHODS.send]: OPERATOR_SCOPES.write,
  [METHODS.wait]: OPERATOR_SCOPES.write,
  [METHODS.get]: OPERATOR_SCOPES.read,
  [METHODS.list]: OPERATOR_SCOPES.read,
  [METHODS.cancel]: OPERATOR_SCOPES.admin,
});

/** Scopes the core sessions_send patch passes explicitly on vrelay.send / vrelay.wait (§2.b). */
export const SEND_CALL_SCOPES = Object.freeze([OPERATOR_SCOPES.write]);

/**
 * Only an error text matching this means "plugin absent": the core then caches the
 * absence for TIMEOUTS.absentCacheMs and runs v2. Any other RPC error is reported,
 * never downgraded (a downgrade could send the same request twice). See A4 in §12.1.
 *
 * WP0 probe (docs/inter-session/probe-results.md): with the plugin absent, sessions_send's
 * gatewayCall gets "missing scope: operator.admin" from a worker and from a Gateway-hosted
 * tool, with or without scopes ["operator.write"] (unclassified methods need admin and
 * authorization runs before the method lookup). "unknown method: vrelay.send" stays in the
 * pattern for an admin-scoped caller.
 */
export const RELAY_FALLBACK_RE = /unknown method: vrelay\.send|missing scope: operator\.admin/u;

export const TIMEOUTS = Object.freeze({
  sendRpcMs: 20_000, // core → vrelay.send
  waitSliceMaxMs: 55_000, // one vrelay.wait long-poll slice
  waitRpcGraceMs: 15_000, // gateway timeoutMs = slice + grace
  inlineMaxMs: 300_000, // inline wait ceiling: min(timeoutSeconds * 1000, 300000)
  absentCacheMs: 60_000, // core caches "plugin absent" this long
  idempotencyBucketMs: 600_000, // requesterRunId missing → "nr:" + floor(now / bucket)
  contentDedupeMs: 600_000, // in-flight content dedupe window
  anchorPostMs: 5_000, // synchronous anchor post budget at accept time
  bridgeReadyMs: 60_000, // transports/bridge waits this long for a bridge to register
  feishuUuidDedupeMs: 3_600_000, // im.message.create uuid dedupe (server side)
  messageSidDedupeMs: 1_200_000, // core inbound dedupe (inbound-dedupe.ts)
});

// ---------------------------------------------------------------- vocabularies

export const CHANNELS = Object.freeze(["feishu", "telegram", "dingtalk", "wecom"]);
export const START_KINDS = Object.freeze(["request", "ask", "wake", "collect"]);
/** Short kind used inside runId / MessageSid / synthetic message ids / transcript tags. */
export const KIND_ABBR = Object.freeze({ request: "req", ask: "ask", wake: "wake", collect: "col" });
const ABBR_KIND = Object.freeze(Object.fromEntries(Object.entries(KIND_ABBR).map(([k, v]) => [v, k])));

export const CHAT_TYPES = Object.freeze(["direct", "group"]);
export const HUMANS = Object.freeze(["owner_only", "single_peer", "shared", "unknown"]);
export const TRANSPORTS = Object.freeze(["bridge", "agent"]);
export const EDGES = Object.freeze(["delegate", "followup", "ask"]);
export const RUN_ROLES = Object.freeze(["root", "request", "ask", "wake", "collect", "unknown"]);
export const SEND_MODES = Object.freeze(["async", "inline"]);

export const ROUTE_ERROR_CODES = Object.freeze(["NO_ROUTE", "CHAT_GONE", "NOT_MEMBER"]);
export const BRIDGE_ERROR_CODES = Object.freeze(["POST_FAILED", "CHAT_GONE", "NOT_MEMBER", "CHANNEL_DOWN"]);
export const BUSY_REASONS = Object.freeze(["active_run", "pending_queue", "recovery_owner"]);
export const START_REJECT_CODES = Object.freeze([
  "NO_ROUTE", "ROUTE_MISMATCH", "GATED", "CHANNEL_DOWN", "RESTART_WEDGE", "ARCHIVED", "INTERNAL",
]);
export const RUN_STATUSES = Object.freeze(["ok", "error", "aborted"]);

export const SEND_STATUSES = Object.freeze(["fallback", "accepted", "forbidden", "error"]);
export const FALLBACK_REASONS = Object.freeze(["disabled", "unsupported_requester", "unsupported_target"]);
export const SEND_ERROR_CODES = Object.freeze(["NO_ROUTE", "CHAT_GONE", "NOT_MEMBER", "LEDGER", "INTERNAL"]);
export const WAIT_STATUSES = Object.freeze(["pending", "ok", "no_reply", "failed", "expired"]);
export const FAILURE_CLASSES = Object.freeze([
  "not_started", "started_failed", "interrupted", "aborted", "timeout", "cancelled",
]);

/** §5.1 interception codes, in the order of the classification table. */
export const POLICY_CODES = Object.freeze([
  "LEAF", "WAIT_CYCLE", "REPLY_TO_REQUESTER", "DEPTH", "FANOUT", "MEMBERS",
  "CHAIN_BUDGET", "PAIR_BUDGET", "RATE", "CHAIN_EXPIRED", "QUEUE_FULL",
]);

/** SendRecord.phase (§2.c). */
export const SEND_PHASES = Object.freeze([
  "accepted", "posting", "posted", "queued", "starting", "running", "target_done",
  "awaiting_children", "awaiting_background", "result_ready", "failure_ready",
  "handed_back", "delivered_inline", "skipped", "cancelled",
]);
/** Phases that close a send for good (§6.1). result_ready / failure_ready still wait for their batch. */
export const SEND_TERMINAL_PHASES = Object.freeze(["handed_back", "delivered_inline", "skipped", "cancelled"]);
/**
 * Phases in which a send counts as settled for its batch (§5.4). §5.4 names result_ready,
 * failure_ready and skipped; cancelled is settled too: §6.2 shows a vrelay.cancel'ed send as
 * "批次里该项 ⏹" in the requester's wake, and §6.1 requires every accepted send to close. A
 * batch waiting for a cancelled member would never become ready and never wake.
 */
export const SEND_SETTLED_PHASES = Object.freeze(["result_ready", "failure_ready", "skipped", "cancelled"]);
/** BatchRecord.phase (§2.c). */
export const BATCH_PHASES = Object.freeze(["open", "sealed", "ready", "waking", "woken", "skipped"]);
export const BATCH_TERMINAL_PHASES = Object.freeze(["woken", "skipped"]);

/** Error text of a run that died across a restart while recovery owned the session (memory v-restart-recovery-wedge). */
export const RESTART_WEDGE_RE = /restart recovery claim changed/u;

// ---------------------------------------------------------------- default limits (§3.10 configSchema)

export const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 2,
  maxFanoutPerRun: 5,
  maxChainMembers: 8,
  maxSendsPerChain: 24,
  maxPerPair: 6,
  maxSendsPerMinute: 8,
  chainIdleTtlMs: 21_600_000,
  chainHardTtlMs: 86_400_000,
  maxWakeRoundsPerSend: 4,
  queueTimeoutMs: 21_600_000,
  runTimeoutMs: 43_200_000,
  inlineMaxMs: 300_000,
  maxConcurrentRequestTurns: 4,
  maxQueuePerTarget: 10,
  sharedVisibleChars: 200,
});

export const PLUGIN_ROLES = Object.freeze(["gateway", "worker-guard"]);

/**
 * WP0 probe finding F-a (docs/inter-session/probe-results.md): V's Worker config is derived
 * from the Gateway config (worker-config-derive.mjs), so a plugin declared for the Gateway is
 * also loaded, with the same `config`, in every Worker child. `config.role` therefore cannot tell
 * the two processes apart. V's own worker plugin marks its children with this variable
 * (worker exec-env.mjs:28) and skips its Gateway services when it is "1" (worker index.mjs:351,
 * 388); plugin 2.0 uses the same test to never start the engine, services or event subscriptions
 * inside a Worker.
 */
export const WORKER_CHILD_ENV = "VLAB_WORKER_CHILD";
export const isWorkerChildProcess = (env = process.env) => env?.[WORKER_CHILD_ENV] === "1";

export const DEFAULT_CONFIG = Object.freeze({
  role: "gateway",
  workerGuard: false,
  ownerName: "Tianyi",
  agentNames: Object.freeze({}),
  limits: DEFAULT_LIMITS,
});

/**
 * `openclaw.plugin.json` configSchema for plugin 2.0 (§3.10, amended by §13.1). `role` is kept
 * only so an older config still validates; it no longer decides anything (a Worker gets the same
 * config). `workerGuard: true` registers the §8.7 poll guard inside Worker children.
 */
export const CONFIG_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    role: { type: "string", enum: [...PLUGIN_ROLES] },
    workerGuard: { type: "boolean" },
    ledgerDir: { type: "string" },
    ownerName: { type: "string" },
    agentNames: { type: "object", additionalProperties: { type: "string" } },
    limits: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(Object.keys(DEFAULT_LIMITS).map((k) => [k, { type: "integer", minimum: 0 }])),
    },
  },
});

/** Plugin config → effective config (unknown limit keys ignored, invalid values fall back to defaults). */
export function resolvePluginConfig(raw = {}) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const limits = { ...DEFAULT_LIMITS };
  for (const [k, v] of Object.entries(cfg.limits ?? {})) {
    if (Object.hasOwn(DEFAULT_LIMITS, k) && Number.isSafeInteger(v) && v >= 0) limits[k] = v;
  }
  return {
    role: PLUGIN_ROLES.includes(cfg.role) ? cfg.role : DEFAULT_CONFIG.role,
    workerGuard: cfg.workerGuard === true,
    ledgerDir: typeof cfg.ledgerDir === "string" && cfg.ledgerDir ? cfg.ledgerDir : undefined,
    ownerName: typeof cfg.ownerName === "string" && cfg.ownerName ? cfg.ownerName : DEFAULT_CONFIG.ownerName,
    agentNames: cfg.agentNames && typeof cfg.agentNames === "object" ? { ...cfg.agentNames } : {},
    limits: Object.freeze(limits),
  };
}

/** Per-channel bridge capabilities (§2.a, §7.7). */
export const CHANNEL_CAPS = Object.freeze({
  feishu: Object.freeze({ streaming: true, replyAnchor: true, idempotentPost: true, editPost: true, maxVisibleChars: 1500, askUser: true, media: true }),
  telegram: Object.freeze({ streaming: true, replyAnchor: true, idempotentPost: false, editPost: false, maxVisibleChars: 3500, askUser: true, media: true }),
  dingtalk: Object.freeze({ streaming: true, replyAnchor: false, idempotentPost: false, editPost: false, maxVisibleChars: 1500, askUser: true, media: true }),
  wecom: Object.freeze({ streaming: false, replyAnchor: false, idempotentPost: false, editPost: false, maxVisibleChars: 1000, maxVisibleBytes: 3800, askUser: true, media: true }),
});

// ---------------------------------------------------------------- errors

/** What bridge.post throws (§2.a). */
export class BridgeError extends Error {
  constructor(code, message, { transient = false, cause } = {}) {
    if (!BRIDGE_ERROR_CODES.includes(code)) throw new TypeError(`unknown BridgeError code: ${code}`);
    super(message ?? code, cause === undefined ? undefined : { cause });
    this.name = "BridgeError";
    this.code = code;
    this.transient = Boolean(transient);
  }
}

export const isBridgeError = (err) => Boolean(err && err.name === "BridgeError" && BRIDGE_ERROR_CODES.includes(err.code));

// ---------------------------------------------------------------- account ids and bridge registry

const ACCOUNT_ID_VALID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/iu;
const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Same result as core `normalizeAccountId` (9.1 src/routing/account-id.ts): empty or unusable → "default". */
export function normalizeAccountId(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "default";
  const lower = trimmed.toLowerCase();
  const canonical = ACCOUNT_ID_VALID_RE.test(trimmed)
    ? lower
    : lower.replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+/u, "").replace(/-+$/u, "").slice(0, 64);
  return !canonical || BLOCKED_OBJECT_KEYS.has(canonical) ? "default" : canonical;
}

/** Registry key of a bridge: `${channel}:${normalizeAccountId(accountId)}`. */
export const bridgeKey = (channel, accountId) => `${channel}:${normalizeAccountId(accountId)}`;

/**
 * Channel ids a session's delivery context may carry for a bridge channel. DingTalk sessions record
 * the connector plugin's id, "dingtalk-connector", while its bridge registers as "dingtalk"
 * (review-dingtalk); `commands.ownerAllowFrom` uses the connector's id too.
 */
export const CHANNEL_ALIASES = Object.freeze({ "dingtalk-connector": "dingtalk" });

/** The bridge channel (one of CHANNELS) for a delivery channel id; unknown ids come back as they are. */
export function bridgeChannelOf(channel) {
  if (typeof channel !== "string" || !channel.trim()) return channel ?? null;
  const c = channel.trim().toLowerCase();
  return CHANNEL_ALIASES[c] ?? c;
}

/** The one registry object every patch and the plugin share (created on first use). */
export function getBridgeRegistry(target = globalThis) {
  target[BRIDGES] ??= { v: 1, bridges: new Map(), listeners: new Set() };
  return target[BRIDGES];
}

function notify(reg, key, bridge) {
  for (const listener of [...reg.listeners]) {
    try { listener(key, bridge); } catch { /* a listener never breaks registration */ }
  }
}

/** Register a bridge under `${channel}:${accountId}` and tell the listeners. Returns the key. */
export function registerBridge(bridge, reg = getBridgeRegistry()) {
  const key = bridgeKey(bridge.channel, bridge.accountId);
  reg.bridges.set(key, bridge);
  notify(reg, key, bridge);
  return key;
}

/** Remove a bridge only if it is still the registered object for its key. */
export function unregisterBridge(bridge, reg = getBridgeRegistry()) {
  const key = bridgeKey(bridge.channel, bridge.accountId);
  if (reg.bridges.get(key) !== bridge) return false;
  reg.bridges.delete(key);
  notify(reg, key, null);
  return true;
}

// ---------------------------------------------------------------- ids (§2.c)

const sha256Hex = (s) => createHash("sha256").update(String(s)).digest("hex");

function newRecordId(prefix, now = Date.now(), rand = randomBytes(5)) {
  return `${prefix}${Math.floor(now).toString(36)}${Buffer.from(rand).subarray(0, 5).toString("hex")}`;
}
/** `s_` + Date.now().toString(36) + 5 random bytes in hex. */
export const newSendId = (now, rand) => newRecordId("s_", now, rand);
export const newBatchId = (now, rand) => newRecordId("b_", now, rand);
export const newChainId = (now, rand) => newRecordId("c_", now, rand);

export const SEND_ID_RE = /^s_[0-9a-z]+[0-9a-f]{10}$/u;
export const BATCH_ID_RE = /^b_[0-9a-z]+[0-9a-f]{10}$/u;
export const CHAIN_ID_RE = /^c_[0-9a-z]+[0-9a-f]{10}$/u;

/** Crockford base32 (no I, L, O, U). */
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4,5}$/u;

function randomCode(length, rand) {
  const bytes = rand ? Buffer.from(rand(length)) : randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += CROCKFORD_ALPHABET[bytes[i] & 31];
  return out;
}

/**
 * A #code for a new send: 4 Crockford chars; when `isTaken(code)` reports a clash with a
 * non-terminal record, retry, and grow to 5 chars after `tries` clashes.
 * `rand(n)` (tests) returns n random bytes.
 */
export function newCode(isTaken = () => false, { rand, tries = 8 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const code = randomCode(4, rand);
    if (!isTaken(code)) return code;
  }
  for (let i = 0; i < 64; i += 1) {
    const code = randomCode(5, rand);
    if (!isTaken(code)) return code;
  }
  throw new Error("v-session-relay: no free #code");
}

/** Normalizes `kind` (full or abbreviated) to the abbreviation; throws on anything else. */
export function kindAbbr(kind) {
  if (Object.hasOwn(KIND_ABBR, kind)) return KIND_ABBR[kind];
  if (Object.hasOwn(ABBR_KIND, kind)) return kind;
  throw new TypeError(`unknown inter-session kind: ${kind}`);
}
export function kindFromAbbr(abbr) {
  if (!Object.hasOwn(ABBR_KIND, abbr)) throw new TypeError(`unknown inter-session kind abbreviation: ${abbr}`);
  return ABBR_KIND[abbr];
}

function assertAttempt(attempt, what = "attempt") {
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new TypeError(`${what} must be a non-negative integer: ${attempt}`);
}
/** wake turns are keyed by a batchId; request / ask / collect turns by a sendId (§2.c). */
function idMatchesKind(kind, id) {
  const re = kindFromAbbr(kindAbbr(kind)) === "wake" ? BATCH_ID_RE : SEND_ID_RE;
  return typeof id === "string" && re.test(id);
}
function assertIdForKind(kind, id) {
  if (!idMatchesKind(kind, id)) {
    const want = kindFromAbbr(kindAbbr(kind)) === "wake" ? "a batch id (b_…)" : "a send id (s_…)";
    throw new TypeError(`not a send/batch id for ${kind}: ${id} (needs ${want})`);
  }
}

/** The prefix of every plugin-started runId and synthetic message id (WP11 filters on it). */
export const V_A2A_PREFIX = "v-a2a-";
/** The prefix of every plugin MessageSid and transcript tag. */
export const V_A2A_SID_PREFIX = "v-a2a:";

/** Synthetic, never-owner sender of a chain whose root person has no id in the target channel (§2.a): `v-a2a:<chainId>`. */
export function syntheticSenderIdFor(chainId) {
  if (typeof chainId !== "string" || !CHAIN_ID_RE.test(chainId)) throw new TypeError(`not a chain id: ${chainId}`);
  return `${V_A2A_SID_PREFIX}${chainId}`;
}

/** Preset target / ask / collect / wake runId, unique per attempt: `v-a2a-req-<sendId>-<n>` (§2.c). */
export function runIdFor(kind, id, attempt) {
  assertIdForKind(kind, id);
  assertAttempt(attempt);
  return `${V_A2A_PREFIX}${kindAbbr(kind)}-${id}-${attempt}`;
}

/** Core MessageSid (inbound dedupe key, 20 min), unique per attempt: `v-a2a:req:<sendId>:<n>`. */
export function messageSidFor(kind, id, attempt) {
  assertIdForKind(kind, id);
  assertAttempt(attempt);
  return `${V_A2A_SID_PREFIX}${kindAbbr(kind)}:${id}:${attempt}`;
}

/** Channel-side synthetic message id: Telegram reuses the MessageSid (messageIdOverride); the others use the runId form. */
export function syntheticMessageIdFor(channel, kind, id, attempt) {
  return channel === "telegram" ? messageSidFor(kind, id, attempt) : runIdFor(kind, id, attempt);
}

/** All per-attempt ids of one StartRequest. */
export function startIds({ channel, kind, id, attempt }) {
  return {
    runId: runIdFor(kind, id, attempt),
    messageSid: messageSidFor(kind, id, attempt),
    syntheticMessageId: syntheticMessageIdFor(channel, kind, id, attempt),
  };
}

const RUN_ID_RE = /^v-a2a-(req|ask|col|wake)-([sb]_[0-9a-z]+[0-9a-f]{10})-(\d+)$/u;
const MESSAGE_SID_RE = /^v-a2a:(req|ask|col|wake):([sb]_[0-9a-z]+[0-9a-f]{10}):(\d+)$/u;

/** True for every run the plugin started (target, ask, collect, wake): the `v-a2a-` prefix. */
export const isInterSessionRunId = (runId) => typeof runId === "string" && runId.startsWith(V_A2A_PREFIX);
export const isInterSessionMessageSid = (sid) => typeof sid === "string" && sid.startsWith(V_A2A_SID_PREFIX);

/** `v-a2a-req-<sendId>-<n>` → `{ kind: "request", abbr: "req", id, attempt }`, or null. */
export function parseInterSessionRunId(runId) {
  const m = typeof runId === "string" ? RUN_ID_RE.exec(runId) : null;
  return m && idMatchesKind(m[1], m[2]) ? { kind: kindFromAbbr(m[1]), abbr: m[1], id: m[2], attempt: Number(m[3]) } : null;
}
/** `v-a2a:req:<sendId>:<n>` → `{ kind, abbr, id, attempt }`, or null. */
export function parseMessageSid(sid) {
  const m = typeof sid === "string" ? MESSAGE_SID_RE.exec(sid) : null;
  return m && idMatchesKind(m[1], m[2]) ? { kind: kindFromAbbr(m[1]), abbr: m[1], id: m[2], attempt: Number(m[3]) } : null;
}

/** Feishu im.message.create uuid (server dedupe 1 h, ≤ 50 chars): `va` + kind initial + sha256(id:purpose)[0,40). */
export function feishuPostUuid(kind, id, purpose) {
  assertIdForKind(kind, id);
  const initial = kindFromAbbr(kindAbbr(kind))[0];
  if (typeof purpose !== "string" || !purpose) throw new TypeError("purpose must be a non-empty string");
  return `va${initial}${sha256Hex(`${id}:${purpose}`).slice(0, 40)}`;
}

/** Transcript tag carried in InputProvenance.originSessionId: `v-a2a:<chainId>:<depth>:<kind>:<id>`. */
export function originSessionIdFor({ chainId, depth, kind, id }) {
  if (typeof chainId !== "string" || !CHAIN_ID_RE.test(chainId)) throw new TypeError(`not a chain id: ${chainId}`);
  assertIdForKind(kind, id);
  assertAttempt(depth, "depth");
  return `${V_A2A_SID_PREFIX}${chainId}:${depth}:${kindAbbr(kind)}:${id}`;
}
const ORIGIN_RE = /^v-a2a:(c_[0-9a-z]+[0-9a-f]{10}):(\d+):(req|ask|col|wake):([sb]_[0-9a-z]+[0-9a-f]{10})$/u;
export function parseOriginSessionId(origin) {
  const m = typeof origin === "string" ? ORIGIN_RE.exec(origin) : null;
  return m && idMatchesKind(m[3], m[4]) ? { chainId: m[1], depth: Number(m[2]), kind: kindFromAbbr(m[3]), abbr: m[3], id: m[4] } : null;
}
/** Recovery looks for `…:<kind>:<id>` at the end of a user message's originSessionId (§6.3). */
export function originTagSuffix(kind, id) {
  assertIdForKind(kind, id);
  return `:${kindAbbr(kind)}:${id}`;
}

/** vrelay.send idempotencyKey (§2.b). */
export function sendIdempotencyKey({ requesterSessionKey, requesterRunId, toolCallId, now = Date.now() }) {
  const run = requesterRunId ?? `nr:${Math.floor(now / TIMEOUTS.idempotencyBucketMs)}`;
  return `ss:${sha256Hex(`${requesterSessionKey}|${run}|${toolCallId}`).slice(0, 32)}`;
}

/** Content dedupe key: same requester session, same target, same message (§2.b). */
export const sendContentKey = ({ requesterSessionKey, targetSessionKey, message }) =>
  sha256Hex(`${requesterSessionKey}|${targetSessionKey}|${message}`);

export const messageSha256 = (message) => sha256Hex(message);

/** RunRecord file name: `runs/<sha1(runId)>.json`. */
export const runRecordName = (runId) => `${createHash("sha1").update(String(runId)).digest("hex")}.json`;

/** Inline timeout the core passes for a given timeoutSeconds (§2.b). */
export const inlineTimeoutMsFor = (timeoutSeconds) =>
  timeoutSeconds === 0 ? 0 : Math.min(timeoutSeconds * 1000, TIMEOUTS.inlineMaxMs);

// ---------------------------------------------------------------- validators

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.length > 0;
const isBool = (v) => typeof v === "boolean";
const isPosInt = (v) => Number.isSafeInteger(v) && v > 0;

/** Validates an InterSessionBridge (§2.a). Returns `{ ok, errors }`. */
export function validateBridge(bridge) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!bridge || typeof bridge !== "object") return { ok: false, errors: ["bridge is not an object"] };
  if (bridge.v !== 1) err("v must be 1");
  if (!CHANNELS.includes(bridge.channel)) err(`channel must be one of ${CHANNELS.join("|")}`);
  if (!isStr(bridge.accountId)) err("accountId must be a non-empty string");
  else if (normalizeAccountId(bridge.accountId) !== bridge.accountId) err("accountId must be normalized (normalizeAccountId)");
  const caps = bridge.caps;
  if (!isObj(caps)) err("caps must be an object");
  else {
    for (const k of ["streaming", "replyAnchor", "idempotentPost", "editPost", "askUser", "media"]) if (!isBool(caps[k])) err(`caps.${k} must be boolean`);
    if (!isPosInt(caps.maxVisibleChars)) err("caps.maxVisibleChars must be a positive integer");
    if (caps.maxVisibleBytes !== undefined && !isPosInt(caps.maxVisibleBytes)) err("caps.maxVisibleBytes must be a positive integer when set");
    if (caps.editPost === true && typeof bridge.edit !== "function") err("caps.editPost requires edit()");
  }
  for (const fn of ["resolveRoute", "post", "start"]) if (typeof bridge[fn] !== "function") err(`${fn} must be a function`);
  if (bridge.edit !== undefined && typeof bridge.edit !== "function") err("edit must be a function when set");
  return { ok: errors.length === 0, errors };
}

/** Validates a Route (§2.a). */
export function validateRoute(route) {
  const errors = [];
  if (!isObj(route)) return { ok: false, errors: ["route is not an object"] };
  if (!CHANNELS.includes(route.channel)) errors.push("route.channel unknown");
  if (!isStr(route.accountId)) errors.push("route.accountId must be a non-empty string");
  if (!isStr(route.to)) errors.push("route.to must be a non-empty string");
  if (!isStr(route.chatId)) errors.push("route.chatId must be a non-empty string");
  if (!CHAT_TYPES.includes(route.chatType)) errors.push("route.chatType must be direct|group");
  if (!HUMANS.includes(route.humans)) errors.push(`route.humans must be one of ${HUMANS.join("|")}`);
  if (route.peerId !== undefined && !isStr(route.peerId)) errors.push("route.peerId must be a non-empty string when set");
  if (route.label !== undefined && typeof route.label !== "string") errors.push("route.label must be a string when set");
  return { ok: errors.length === 0, errors };
}

const PROVENANCE_FIELDS = new Set(["kind", "sourceSessionKey", "sourceChannel", "sourceTool", "originSessionId"]);

/** Validates a StartRequest (§2.a), including the per-attempt id formulas and the sender rules. */
export function validateStartRequest(req) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!isObj(req)) return { ok: false, errors: ["start request is not an object"] };
  for (const e of validateRoute(req.route).errors) err(e);
  if (!isStr(req.sessionKey)) err("sessionKey must be a non-empty string");
  if (!isStr(req.agentId)) err("agentId must be a non-empty string");
  const kindOk = START_KINDS.includes(req.kind);
  if (!kindOk) err(`kind must be one of ${START_KINDS.join("|")}`);
  const idOk = isStr(req.id) && (req.kind === "wake" ? BATCH_ID_RE.test(req.id) : SEND_ID_RE.test(req.id));
  if (!idOk) err(req.kind === "wake" ? "wake id must be a batchId" : "id must be a sendId");
  const attemptOk = Number.isSafeInteger(req.attempt) && req.attempt >= 0;
  if (!attemptOk) err("attempt must be a non-negative integer");
  if (kindOk && idOk && attemptOk && isObj(req.route) && CHANNELS.includes(req.route.channel)) {
    const ids = startIds({ channel: req.route.channel, kind: req.kind, id: req.id, attempt: req.attempt });
    if (req.runId !== ids.runId) err(`runId must be ${ids.runId}`);
    if (req.messageSid !== ids.messageSid) err(`messageSid must be ${ids.messageSid}`);
    if (req.syntheticMessageId !== ids.syntheticMessageId) err(`syntheticMessageId must be ${ids.syntheticMessageId}`);
  }
  if (!(req.anchorMessageId === null || isStr(req.anchorMessageId))) err("anchorMessageId must be a string or null");
  if (!isStr(req.promptText)) err("promptText must be a non-empty string");
  if (typeof req.channelPromptContext !== "string") err("channelPromptContext must be a string");
  if (Object.hasOwn(req, "groupSystemPrompt") || Object.hasOwn(req, "GroupSystemPrompt")) err("A2A context goes in channelPromptContext, never GroupSystemPrompt");
  const p = req.provenance;
  if (!isObj(p)) err("provenance must be an object");
  else {
    for (const k of Object.keys(p)) if (!PROVENANCE_FIELDS.has(k)) err(`provenance.${k} is not one of the 5 schema fields`);
    if (p.kind !== "inter_session") err('provenance.kind must be "inter_session"');
    if (!isStr(p.sourceSessionKey)) err("provenance.sourceSessionKey must be a non-empty string");
    if (p.sourceTool !== "sessions_send") err('provenance.sourceTool must be "sessions_send"');
    if (p.sourceChannel !== undefined && !isStr(p.sourceChannel)) err("provenance.sourceChannel must be a non-empty string when set");
    const origin = parseOriginSessionId(p.originSessionId);
    if (!origin) err("provenance.originSessionId must be v-a2a:<chainId>:<depth>:<kind>:<id>");
    else if (origin.id !== req.id || (kindOk && origin.kind !== req.kind)) err("provenance.originSessionId must name this kind and id");
  }
  const s = req.sender;
  if (!isObj(s)) err("sender must be an object");
  else {
    if (!isStr(s.id)) err("sender.id must be a non-empty string");
    if (typeof s.name !== "string") err("sender.name must be a string");
    if (!isBool(s.isOwnerIdentity)) err("sender.isOwnerIdentity must be boolean");
    if (isStr(s.id) && s.id.startsWith(V_A2A_SID_PREFIX) && s.isOwnerIdentity === true) err("a synthetic sender is never the owner");
  }
  if (req.routePeerId !== undefined && !isStr(req.routePeerId)) err("routePeerId must be a non-empty string when set");
  if (isObj(req.route) && req.route.chatType === "direct" && isStr(req.route.peerId) && req.routePeerId !== req.route.peerId) err("routePeerId of a direct chat must be its peer");
  if (req.askUserAnswererId !== undefined && !isStr(req.askUserAnswererId)) err("askUserAnswererId must be a non-empty string when set");
  if (isStr(req.askUserAnswererId) && req.askUserAnswererId.startsWith(V_A2A_SID_PREFIX)) err("askUserAnswererId must be a real person, never a synthetic id");
  return { ok: errors.length === 0, errors };
}

/** Validates a StartOutcome returned by bridge.start (§2.a). */
export function validateStartOutcome(outcome) {
  const errors = [];
  if (!isObj(outcome)) return { ok: false, errors: ["outcome is not an object"] };
  if (outcome.status === "started") {
    if (!isStr(outcome.runId)) errors.push("started.runId must be a non-empty string");
    if (!outcome.done || typeof outcome.done.then !== "function") errors.push("started.done must be a promise");
  } else if (outcome.status === "busy") {
    if (!BUSY_REASONS.includes(outcome.reason)) errors.push(`busy.reason must be one of ${BUSY_REASONS.join("|")}`);
  } else if (outcome.status === "rejected") {
    if (!START_REJECT_CODES.includes(outcome.code)) errors.push(`rejected.code must be one of ${START_REJECT_CODES.join("|")}`);
    if (typeof outcome.message !== "string") errors.push("rejected.message must be a string");
    if (outcome.started !== false) errors.push("rejected.started must be false");
  } else errors.push("status must be started|busy|rejected");
  return { ok: errors.length === 0, errors };
}

/** Validates a RunOutcome (the value `done` resolves to). */
export function validateRunOutcome(run) {
  const errors = [];
  if (!isObj(run)) return { ok: false, errors: ["run outcome is not an object"] };
  if (!RUN_STATUSES.includes(run.status)) errors.push(`status must be one of ${RUN_STATUSES.join("|")}`);
  if (!Array.isArray(run.finals)) errors.push("finals must be an array");
  else for (const [i, f] of run.finals.entries()) {
    if (!isObj(f)) { errors.push(`finals[${i}] must be an object`); continue; }
    if (f.text !== undefined && typeof f.text !== "string") errors.push(`finals[${i}].text must be a string`);
    if (f.mediaUrls !== undefined && !(Array.isArray(f.mediaUrls) && f.mediaUrls.every(isStr))) errors.push(`finals[${i}].mediaUrls must be strings`);
  }
  if (!isBool(run.visibleReplySent)) errors.push("visibleReplySent must be boolean");
  if (!Number.isSafeInteger(run.finalCount) || run.finalCount < 0) errors.push("finalCount must be a non-negative integer");
  if (run.error !== undefined && typeof run.error !== "string") errors.push("error must be a string when set");
  return { ok: errors.length === 0, errors };
}

/** Validates vrelay.send params as assembled by the core patch (§2.b). */
export function validateSendParams(params) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!isObj(params)) return { ok: false, errors: ["params is not an object"] };
  if (params.v !== 1) err("v must be 1");
  if (!isStr(params.idempotencyKey) || !/^ss:[0-9a-f]{32}$/u.test(params.idempotencyKey)) err("idempotencyKey must be ss:<32 hex>");
  if (!isStr(params.toolCallId)) err("toolCallId must be a non-empty string");
  const r = params.requester;
  if (!isObj(r)) err("requester must be an object");
  else {
    for (const k of ["sessionKey", "replySessionKey", "agentId"]) if (!isStr(r[k])) err(`requester.${k} must be a non-empty string`);
    for (const k of ["runId", "channel", "accountId", "to", "threadId", "senderId"]) if (!(r[k] === null || isStr(r[k]))) err(`requester.${k} must be a string or null`);
    if (!(r.senderIsOwner === null || isBool(r.senderIsOwner))) err("requester.senderIsOwner must be boolean or null");
  }
  const t = params.target;
  if (!isObj(t)) err("target must be an object");
  else {
    for (const k of ["sessionKey", "agentId", "displayKey"]) if (!isStr(t[k])) err(`target.${k} must be a non-empty string`);
    if (!isBool(t.created)) err("target.created must be boolean");
  }
  if (!isStr(params.message)) err("message must be a non-empty string");
  if (!SEND_MODES.includes(params.mode)) err("mode must be async|inline");
  if (!Number.isSafeInteger(params.inlineTimeoutMs) || params.inlineTimeoutMs < 0) err("inlineTimeoutMs must be a non-negative integer");
  else if (params.mode === "async" && params.inlineTimeoutMs !== 0) err("async sends carry inlineTimeoutMs 0");
  else if (params.mode === "inline" && (params.inlineTimeoutMs === 0 || params.inlineTimeoutMs > TIMEOUTS.inlineMaxMs)) err(`inline sends carry 0 < inlineTimeoutMs <= ${TIMEOUTS.inlineMaxMs}`);
  return { ok: errors.length === 0, errors };
}
