// Feishu F-series regression harness for the INSTALLED @openclaw/feishu and openclaw packages.
//
// Run: FEISHU_PKG=<dir of @openclaw/feishu> OPENCLAW_PKG=<dir of openclaw> node --import ./hooks.mjs harness.mjs
//
// Only node: builtins are imported statically. Everything from the packages is
// imported dynamically AFTER the environment is isolated and the network fakes
// are installed. stdout carries exactly one JSON object; all other output goes
// to stderr. Exit 0 = harness ran (verdict is in the JSON), exit 2 = harness
// breakage or a request escaped the fakes.
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import { dirname, join } from "node:path";
import { mock } from "node:test";
import { pathToFileURL } from "node:url";

const FEISHU_HOST = "open.feishu.cn";
const escapedRequests = [];
const results = [];

function die(message, extra = {}) {
  process.stdout.write(
    `${JSON.stringify({ error: message, ...extra, results, escapedRequests })}\n`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------- isolation
// Read the two package locations before the OPENCLAW_* environment is cleared.
const feishuPkgEnv = process.env.FEISHU_PKG;
const openclawPkgEnv = process.env.OPENCLAW_PKG;
const originalTmp = os.tmpdir();
const sandbox = mkdtempSync(join(originalTmp, "feishu-regress96-"));
for (const key of Object.keys(process.env)) {
  if (
    key.startsWith("OPENCLAW_") ||
    key.startsWith("VLAB_FEISHU_") ||
    /^(https?|all|no)_proxy$/i.test(key)
  ) {
    delete process.env[key];
  }
}
for (const sub of ["home", "tmp", "state", "openclaw-home"]) {
  mkdirSync(join(sandbox, sub), { recursive: true });
}
process.env.HOME = join(sandbox, "home");
process.env.TMPDIR = join(sandbox, "tmp");
process.env.OPENCLAW_STATE_DIR = join(sandbox, "state");
process.env.OPENCLAW_HOME = join(sandbox, "openclaw-home");

// Any raw socket is an escape: the SDK and CardKit fakes answer everything in-process.
net.Socket.prototype.connect = function guardedConnect(...args) {
  const first = args[0];
  const target =
    typeof first === "object" && first !== null
      ? `${first.host ?? first.path ?? "?"}:${first.port ?? ""}`
      : `${args[1] ?? "localhost"}:${first}`;
  escapedRequests.push({ via: "socket", target });
  process.nextTick(() => this.destroy(new Error(`harness blocked socket to ${target}`)));
  return this;
};

// A rejection nobody handled is reported, not fatal; the checks carry the verdict.
const unhandled = [];
process.on("unhandledRejection", (error) => {
  unhandled.push(String(error?.message ?? error).slice(0, 200));
  process.stderr.write(`[unhandledRejection] ${error?.stack ?? error}\n`);
});

// stdout is reserved for the final JSON.
for (const level of ["log", "info", "warn", "debug", "error"]) {
  console[level] = (...args) => process.stderr.write(`[${level}] ${args.map(String).join(" ")}\n`);
}

// ---------------------------------------------------------------- locate packages
if (!feishuPkgEnv || !openclawPkgEnv) {
  die("set FEISHU_PKG and OPENCLAW_PKG");
}
const FEISHU_PKG = realpathSync(feishuPkgEnv);
const OPENCLAW_PKG = realpathSync(openclawPkgEnv);

function listMjs(dir, recursive) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (recursive && name !== "node_modules") out.push(...listMjs(full, true));
    } else if (name.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}
function findByMarker(files, marker) {
  return files.filter((file) => readFileSync(file, "utf8").includes(marker));
}
function findCoreChunk(prefix, marker) {
  const dist = join(OPENCLAW_PKG, "dist");
  const top = readdirSync(dist).filter((name) => name.endsWith(".mjs"));
  let hits = findByMarker(
    top.filter((name) => name.startsWith(prefix)).map((name) => join(dist, name)),
    marker,
  );
  if (hits.length === 0) hits = findByMarker(top.map((name) => join(dist, name)), marker);
  if (hits.length !== 1) die(`expected one core chunk with ${marker}, found ${hits.length}`);
  return hits[0];
}

const DISPATCH_MARKER = "//#region extensions/feishu/src/reply-dispatcher.ts";
const feishuDist = join(FEISHU_PKG, "dist");
const setupDir = join(feishuDist, ".setup");
let feishuChunks = findByMarker(
  (() => {
    try {
      return listMjs(setupDir, false);
    } catch {
      return [];
    }
  })(),
  DISPATCH_MARKER,
);
if (feishuChunks.length === 0) feishuChunks = findByMarker(listMjs(feishuDist, true), DISPATCH_MARKER);
if (feishuChunks.length !== 1) die(`expected one Feishu chunk with ${DISPATCH_MARKER}, found ${feishuChunks.length}`);
const FEISHU_CHUNK = feishuChunks[0];
const PROGRESS_CHUNK = findCoreChunk("progress-card-", "//#region src/session-cards/progress-card-changed.ts");
const NOTICE_CHUNK = findCoreChunk("execution-", "//#region src/channels/turn/pending-delivery-notice.ts");
const COMPLETION_CHUNK = findCoreChunk("delivery-completion-", "//#region src/infra/outbound/delivery-completion.ts");

// The plugin must see the same core the harness checks.
const pluginRequire = createRequire(FEISHU_CHUNK);
function packageRootOf(file) {
  let dir = dirname(file);
  while (dir !== dirname(dir)) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (pkg.name === "openclaw") return realpathSync(dir);
    } catch {}
    dir = dirname(dir);
  }
  return null;
}
const sdkOutboundPath = pluginRequire.resolve("openclaw/plugin-sdk/channel-outbound");
const pluginCoreRoot = packageRootOf(sdkOutboundPath);
if (pluginCoreRoot !== OPENCLAW_PKG) {
  die("the Feishu package resolves openclaw to a different core than OPENCLAW_PKG", {
    pluginCoreRoot,
    OPENCLAW_PKG,
  });
}

// ---------------------------------------------------------------- network fakes
const wire = [];
let messageSeq = 0;
let cardSeq = 0;
const contactReplies = new Map(); // senderId -> () => sdk response data
const fetchInterceptors = []; // { match(rec) -> bool, once, respond: async (rec) -> Response | undefined }

function parseBody(raw) {
  if (raw == null) return undefined;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const lark = pluginRequire("@larksuiteoapi/node-sdk");
if (!lark?.defaultHttpInstance?.defaults) die("Lark SDK defaultHttpInstance not found");
lark.defaultHttpInstance.defaults.adapter = async (config) => {
  const url = new URL(config.url);
  const method = String(config.method ?? "get").toUpperCase();
  const rec = { via: "sdk", method, host: url.hostname, path: url.pathname, query: url.search, body: parseBody(config.data) };
  wire.push(rec);
  if (url.hostname !== FEISHU_HOST) {
    escapedRequests.push({ via: "sdk", target: config.url });
    throw new Error(`harness blocked SDK request to ${url.hostname}`);
  }
  let data = { code: 0, msg: "ok", data: {} };
  if (url.pathname.endsWith("/tenant_access_token/internal") || url.pathname.endsWith("/app_access_token/internal")) {
    data = { code: 0, msg: "ok", tenant_access_token: "t-harness", app_access_token: "a-harness", expire: 7200 };
  } else if (url.pathname.includes("/reactions")) {
    data = { code: 0, msg: "ok", data: { reaction_id: "reaction-harness" } };
  } else if (url.pathname.startsWith("/open-apis/contact/v3/users/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    data = contactReplies.get(id)?.() ?? { code: 0, msg: "ok", data: { user: { name: "Harness User" } } };
  } else if (method === "POST" && url.pathname.startsWith("/open-apis/im/v1/messages")) {
    data = { code: 0, msg: "ok", data: { message_id: `om_out_${++messageSeq}` } };
  }
  return { data, status: 200, statusText: "OK", headers: {}, config, request: {} };
};

const fakeFetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? String(input)));
  const rec = { via: "fetch", method: String(init.method ?? "GET").toUpperCase(), host: url.hostname, path: url.pathname, body: parseBody(init.body) };
  wire.push(rec);
  if (url.hostname !== FEISHU_HOST) {
    escapedRequests.push({ via: "fetch", target: url.toString() });
    throw new Error(`harness blocked fetch to ${url.hostname}`);
  }
  for (let i = 0; i < fetchInterceptors.length; i += 1) {
    const hook = fetchInterceptors[i];
    if (hook.match(rec)) {
      if (hook.once) fetchInterceptors.splice(i, 1);
      const response = await hook.respond(rec);
      if (response) return response;
      break;
    }
  }
  let payload = { code: 0, msg: "ok" };
  if (url.pathname.endsWith("/tenant_access_token/internal")) {
    payload = { code: 0, msg: "ok", tenant_access_token: "t-harness", expire: 7200 };
  } else if (url.pathname === "/open-apis/cardkit/v1/cards" && rec.method === "POST") {
    payload = { code: 0, msg: "ok", data: { card_id: `card_${++cardSeq}` } };
  }
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
};
// A fetch with a `mock` object is treated by core's SSRF guard as a test mock: no DNS pinning.
fakeFetch.mock = {};
globalThis.fetch = fakeFetch;

// ---------------------------------------------------------------- load the real code
const importFile = (file) => import(pathToFileURL(file).href);
const m = await importFile(FEISHU_CHUNK);
const coreProgress = await importFile(PROGRESS_CHUNK);
for (const name of [
  "createFeishuReplyDispatcher",
  "resolveFeishuSenderName",
  "createSequentialQueue",
  "createFeishuMessageReceiveHandler",
  "streamingStartBackoffUntilByAccount",
  "parseSecretEntrySubmission",
]) {
  if (!m[`__h_${name}`]) die(`loader hook did not expose ${name}; was harness started with --import ./hooks.mjs?`);
}
if (typeof coreProgress.__h_notifyProgressCardChanged !== "function") die("core notifyProgressCardChanged not exposed");
const { setFeishuRuntime } = await importFile(join(feishuDist, "runtime-api.js"));
const sdk = (name) => importFile(pluginRequire.resolve(`openclaw/plugin-sdk/${name}`));
const outbound = await sdk("channel-outbound");
const chunking = await sdk("reply-chunking");
const textChunking = await sdk("text-chunking");
const tables = await sdk("markdown-table-runtime");
setFeishuRuntime({
  channel: {
    text: {
      resolveTextChunkLimit: chunking.resolveTextChunkLimit,
      resolveChunkMode: chunking.resolveChunkMode,
      chunkTextWithMode: chunking.chunkTextWithMode,
      chunkMarkdownTextWithMode: chunking.chunkMarkdownTextWithMode,
      convertMarkdownTables: textChunking.convertMarkdownTables,
      resolveMarkdownTableMode: tables.resolveMarkdownTableMode,
    },
  },
  logging: { shouldLogVerbose: () => false },
});

// ---------------------------------------------------------------- helpers
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const flushMicro = async (n = 5) => {
  for (let i = 0; i < n; i += 1) await new Promise((resolve) => setImmediate(resolve));
};
const short = (value, max = 220) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text && text.length > max ? `${text.slice(0, max)}…` : text;
};

function feishuCfg(overrides = {}) {
  return {
    channels: {
      feishu: {
        appId: "cli_harness",
        appSecret: "harness-secret",
        renderMode: "auto",
        streaming: { mode: "partial" },
        ...overrides,
      },
    },
  };
}

function makeDispatcher({ cfg = feishuCfg(), agentId = "main", identity = { name: "V" }, sessionKey = "agent:main:feishu:group:oc_h", ...rest } = {}) {
  m.__h_streamingStartBackoffUntilByAccount.clear();
  const logs = [];
  const d = m.__h_createFeishuReplyDispatcher({
    cfg,
    agentId,
    runtime: { log: (line) => logs.push(String(line)), error: (line) => logs.push(`ERROR ${line}`) },
    chatId: "oc_h",
    sendTarget: "oc_h",
    replyToMessageId: "om_in",
    sessionKey,
    identity,
    ...rest,
  });
  return { d, logs, start: wire.length };
}

function selectRuntime(d, agentRuntime) {
  d.replyOptions.onModelSelected({
    provider: "openai",
    model: "gpt-5.6-luna",
    thinkLevel: "off",
    ...(agentRuntime ? { agentRuntime } : {}),
  });
}

async function finish(h, finalText) {
  let finalization;
  if (finalText !== undefined) {
    const delivery = await h.d.delivery.deliver({ text: finalText }, { kind: "final" });
    // Attach the handler now: the idle pass below may reject it before we await it.
    finalization = delivery?.finalization?.catch((error) => h.logs.push(`FINALIZATION ${String(error)}`));
  }
  try {
    await h.d.dispatcherOptions.onIdle?.();
  } catch (error) {
    h.logs.push(`IDLE ${String(error)}`);
  }
  await finalization;
  h.d.dispatcherOptions.onCleanup?.();
  await settle(50);
}

const since = (h) => wire.slice(h.start);
const cardCreates = (calls) => calls.filter((c) => c.via === "fetch" && c.method === "POST" && c.path === "/open-apis/cardkit/v1/cards");
const contentWrites = (calls) =>
  calls
    .filter((c) => c.via === "fetch" && c.method === "PUT" && /\/elements\/content(\/content)?$/.test(c.path))
    .map((c) =>
      c.path.endsWith("/content/content")
        ? { kind: "append", text: c.body.content, uuid: c.body.uuid }
        : { kind: "replace", text: JSON.parse(c.body.element).content, uuid: c.body.uuid },
    );
const lastText = (calls) => contentWrites(calls).at(-1)?.text;
const createdCard = (calls) => {
  const create = cardCreates(calls)[0];
  return create ? JSON.parse(create.body.data) : undefined;
};

async function check(id, expected, fn) {
  try {
    const { pass, evidence } = await fn();
    results.push({ id, pass: Boolean(pass), evidence, expected });
  } catch (error) {
    results.push({ id, pass: false, evidence: `threw: ${error?.stack ?? error}`.slice(0, 600), expected });
  }
}

// ---------------------------------------------------------------- F1
await check(
  "F1",
  "listed runtime (vlab-worker) tool start opens the card with the status line; pi tool start opens nothing; listed runtime onItemEvent(tool) adds nothing; suppressDefaultToolProgressMessages=true; claude-cli compaction opens card with the compacting line, pi does not",
  async () => {
    const facts = {};
    const cfg = feishuCfg();
    const expectedLine = outbound.formatChannelProgressDraftLineForEntry(
      cfg.channels.feishu,
      { event: "tool", name: "exec", phase: "start" },
      { commandText: "status" },
    );
    const a = makeDispatcher({ cfg });
    await a.d.dispatcherOptions.onReplyStart();
    selectRuntime(a.d, "vlab-worker");
    a.d.replyOptions.onToolStart({ name: "exec", phase: "start", args: { command: "ls" } });
    await settle();
    facts.listedCards = cardCreates(since(a)).length;
    facts.listedText = lastText(since(a));
    facts.suppress = a.d.replyOptions.suppressDefaultToolProgressMessages;
    facts.allowLifecycle = a.d.replyOptions.allowToolLifecycleWhenProgressHidden;
    await finish(a);

    const b = makeDispatcher({ cfg });
    await b.d.dispatcherOptions.onReplyStart();
    selectRuntime(b.d, "pi");
    b.d.replyOptions.onToolStart({ name: "read", phase: "start" });
    await settle();
    facts.piCards = cardCreates(since(b)).length;
    await finish(b);

    const c = makeDispatcher({ cfg });
    await c.d.dispatcherOptions.onReplyStart();
    selectRuntime(c.d, "claude-cli");
    facts.itemReturn = c.d.replyOptions.onItemEvent({ kind: "tool", name: "exec", toolCallId: "exec-1", phase: "start", meta: "run tests, `pnpm test`" });
    await settle();
    facts.itemEventCards = cardCreates(since(c)).length;
    await finish(c);

    const e = makeDispatcher({ cfg });
    await e.d.dispatcherOptions.onReplyStart();
    selectRuntime(e.d, "claude-cli");
    e.d.replyOptions.onCompactionStart();
    await settle();
    facts.compactionText = lastText(since(e));
    await finish(e);

    const f = makeDispatcher({ cfg: feishuCfg({ renderMode: "card" }) });
    selectRuntime(f.d, "pi");
    f.d.replyOptions.onCompactionStart();
    await settle();
    facts.piCompactionCards = cardCreates(since(f)).length;

    const pass =
      facts.listedCards === 1 &&
      Boolean(expectedLine) &&
      facts.listedText === expectedLine &&
      facts.piCards === 0 &&
      facts.itemReturn === false &&
      facts.itemEventCards === 0 &&
      facts.suppress === true &&
      facts.allowLifecycle === true &&
      facts.compactionText === "📦 **Compacting context...**" &&
      facts.piCompactionCards === 0;
    return { pass, evidence: short({ expectedLine, ...facts }, 600) };
  },
);

// ---------------------------------------------------------------- F2
await check(
  "F2",
  "codex preamble items become the card body joined by blank lines and stay under the answer; claude-cli commentary is replaced by the answer; no thinking preview for codex (pi gets one); commentaryProgressEnabled=true",
  async () => {
    const facts = {};
    const a = makeDispatcher();
    await a.d.dispatcherOptions.onReplyStart();
    selectRuntime(a.d, "codex");
    facts.commentaryProgressEnabled = a.d.replyOptions.commentaryProgressEnabled;
    a.d.replyOptions.onItemEvent({ kind: "preamble", itemId: "c1", progressText: "Reading" });
    await settle();
    a.d.replyOptions.onItemEvent({ kind: "preamble", itemId: "c2", progressText: "Running tests" });
    await settle();
    facts.codexCommentary = lastText(since(a));
    a.d.replyOptions.onPartialReply({ text: "The answer" });
    await settle();
    facts.codexUnderAnswer = lastText(since(a));
    await finish(a);

    const b = makeDispatcher();
    await b.d.dispatcherOptions.onReplyStart();
    selectRuntime(b.d, "claude-cli");
    b.d.replyOptions.onItemEvent({ kind: "preamble", itemId: "c1", progressText: "Looking" });
    await settle();
    facts.cliCommentary = lastText(since(b));
    b.d.replyOptions.onPartialReply({ text: "The answer" });
    await settle();
    facts.cliAfterAnswer = lastText(since(b));
    await finish(b);

    const c = makeDispatcher({ allowReasoningPreview: true });
    await c.d.dispatcherOptions.onReplyStart();
    selectRuntime(c.d, "codex");
    c.d.replyOptions.onReasoningStream?.({ text: "thinking" });
    await settle();
    facts.codexReasoningCards = cardCreates(since(c)).length;
    await finish(c);

    const p = makeDispatcher({ allowReasoningPreview: true });
    await p.d.dispatcherOptions.onReplyStart();
    selectRuntime(p.d, "pi");
    p.d.replyOptions.onReasoningStream?.({ text: "thinking" });
    await settle();
    facts.piReasoningText = lastText(since(p));
    await finish(p);

    const pass =
      facts.commentaryProgressEnabled === true &&
      facts.codexCommentary === "Reading\n\nRunning tests" &&
      typeof facts.codexUnderAnswer === "string" &&
      facts.codexUnderAnswer.startsWith("Reading\n\nRunning tests") &&
      facts.codexUnderAnswer.endsWith("The answer") &&
      facts.cliCommentary === "Looking" &&
      facts.cliAfterAnswer === "The answer" &&
      facts.codexReasoningCards === 0 &&
      typeof facts.piReasoningText === "string" &&
      facts.piReasoningText.includes("💭 **Thinking**");
    return { pass, evidence: short(facts, 600) };
  },
);

// ---------------------------------------------------------------- F3
await check(
  "F3",
  "a payload with channelData.vSecretEntry is sent as exactly one interactive reply card (header 'V 需要一个凭据', password input, callback value {a:'v.secret_entry.submit',q,n}), no text message and no CardKit card; parseSecretEntrySubmission: other action -> undefined, valid -> submit, empty -> empty, bad id -> invalid",
  async () => {
    const questionId = `ask_${"a".repeat(32)}`;
    const secretPayload = (id) => ({
      text: "",
      channelData: { vSecretEntry: { questionId: id, name: "SERVICE_API_KEY", reason: "harness", allowedHosts: ["api.example.com"] } },
    });
    const isSend = (c) => c.via === "sdk" && c.method === "POST" && /^\/open-apis\/im\/v1\/messages(\/[^/]+\/reply)?$/.test(c.path);
    const contentOf = (c) => {
      try {
        return JSON.parse(c.body?.content);
      } catch {
        return undefined;
      }
    };
    const isSecretCard = (c) => c.body?.msg_type === "interactive" && contentOf(c)?.schema === "2.0";
    const isStreamingRef = (c) => c.body?.msg_type === "interactive" && contentOf(c)?.type === "card";

    // renderMode auto (no card before the reply): the secret card must be the only thing sent.
    const h = makeDispatcher();
    await h.d.dispatcherOptions.onReplyStart();
    await h.d.delivery.deliver(secretPayload(questionId), { kind: "final" });
    await settle();
    await finish(h);
    const calls = since(h);
    const sends = calls.filter(isSend);
    const interactive = sends.filter(isSecretCard);
    const textSends = sends.filter((c) => c.body?.msg_type !== "interactive");
    const card = interactive[0] ? contentOf(interactive[0]) : undefined;
    const flat = [];
    const walk = (node) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") {
        flat.push(node);
        Object.values(node).forEach(walk);
      }
    };
    walk(card?.body);
    const input = flat.find((n) => n.tag === "input");
    const callback = flat.find((n) => n.type === "callback")?.value;
    const extraCardKit = cardCreates(calls).length;

    // renderMode card (informational): the streaming card opened at reply start is separate
    // from the secret card; record what happens to it.
    const k = makeDispatcher({ cfg: feishuCfg({ renderMode: "card" }) });
    await k.d.dispatcherOptions.onReplyStart();
    await k.d.delivery.deliver(secretPayload(`ask_${"b".repeat(32)}`), { kind: "final" });
    await settle();
    await finish(k);
    const kCalls = since(k);
    const cardMode = {
      secretCards: kCalls.filter((c) => isSend(c) && isSecretCard(c)).length,
      streamingCardRefs: kCalls.filter((c) => isSend(c) && isStreamingRef(c)).length,
      streamingCardDeleted: kCalls.some((c) => c.via === "sdk" && c.method === "DELETE" && /^\/open-apis\/im\/v1\/messages\/[^/]+$/.test(c.path)),
      streamingContentWrites: contentWrites(kCalls).map((w) => w.text),
      streamingCardClosedWithSummary: kCalls
        .filter((c) => c.via === "fetch" && c.method === "PATCH" && c.path.endsWith("/settings"))
        .map((c) => JSON.parse(c.body.settings).config?.summary?.content),
    };

    const P = m.__h_parseSecretEntrySubmission;
    const base = { operator: { open_id: "ou_harness" }, context: { open_message_id: "om_card" }, token: "tok" };
    const parsed = {
      other: P({ event: { action: { value: { a: "something.else" } } } }),
      submit: P({ event: { ...base, action: { value: { a: "v.secret_entry.submit", q: questionId, n: "SERVICE_API_KEY" }, form_value: { secret_value: "s3cr3t" } } } })?.kind,
      empty: P({ event: { ...base, action: { value: { a: "v.secret_entry.submit", q: questionId, n: "SERVICE_API_KEY" }, form_value: { secret_value: "  " } } } })?.kind,
      badId: P({ event: { ...base, action: { value: { a: "v.secret_entry.submit", q: "ask_nothex", n: "SERVICE_API_KEY" } } } }),
    };
    const pass =
      sends.length === 1 &&
      interactive.length === 1 &&
      textSends.length === 0 &&
      cardMode.secretCards === 1 &&
      extraCardKit === 0 &&
      interactive[0].path === "/open-apis/im/v1/messages/om_in/reply" &&
      card?.header?.title?.content === "V 需要一个凭据" &&
      input?.input_type === "password" &&
      callback?.a === "v.secret_entry.submit" &&
      callback?.q === questionId &&
      callback?.n === "SERVICE_API_KEY" &&
      parsed.other === undefined &&
      parsed.submit === "submit" &&
      parsed.empty === "empty" &&
      parsed.badId?.kind === "invalid";
    return {
      pass,
      evidence: short({ sends: sends.map((c) => `${c.path} ${c.body?.msg_type}`), header: card?.header?.title?.content, input: input?.input_type, callback, extraCardKit, parsed: { ...parsed, badId: parsed.badId?.kind }, renderModeCardInfo: cardMode }, 900),
    };
  },
);

// ---------------------------------------------------------------- F4
await check(
  "F4",
  "no card header for agents makaron/short-v or identity theme 'hidden'; agent main with {name:'V',theme:'green'} gets header title 'V' template 'green'",
  async () => {
    const variants = [
      ["makaron", { name: "Mk" }],
      ["short-v", { name: "Sv" }],
      ["main", { name: "V", theme: "hidden" }],
      ["main", { name: "V", theme: "green" }],
    ];
    const seen = [];
    for (const [agentId, identity] of variants) {
      const h = makeDispatcher({ cfg: feishuCfg({ renderMode: "card" }), agentId, identity, sessionKey: `agent:${agentId}:feishu:group:oc_h` });
      await h.d.dispatcherOptions.onReplyStart();
      await settle();
      const card = createdCard(since(h));
      seen.push({ agentId, theme: identity.theme ?? null, header: card ? (card.header ?? null) : "no-card" });
      await finish(h);
    }
    const pass =
      seen[0].header === null &&
      seen[1].header === null &&
      seen[2].header === null &&
      seen[3].header?.title?.content === "V" &&
      seen[3].header?.template === "green";
    return { pass, evidence: short(seen, 600) };
  },
);

// ---------------------------------------------------------------- F5
await check(
  "F5",
  "card note (at create and at close) = 'Agent: V | Model: gpt-5.6-luna | Provider: openai | Runtime: vlab-worker' via the real core onModelSelected; without agentRuntime the Runtime part is absent",
  async () => {
    const want = "Agent: V | Model: gpt-5.6-luna | Provider: openai | Runtime: vlab-worker";
    const wantPlain = "Agent: V | Model: gpt-5.6-luna | Provider: openai";
    const noteOf = (card) => card?.body?.elements?.find((e) => e.element_id === "note")?.content;
    const closeNoteOf = (calls) => calls.filter((c) => c.path.endsWith("/elements/note/content")).at(-1)?.body?.content;

    const a = makeDispatcher();
    await a.d.dispatcherOptions.onReplyStart();
    selectRuntime(a.d, "vlab-worker");
    await finish(a, "reply");
    const createNote = noteOf(createdCard(since(a)));
    const closeNote = closeNoteOf(since(a));

    const b = makeDispatcher();
    await b.d.dispatcherOptions.onReplyStart();
    selectRuntime(b.d, undefined);
    await finish(b, "reply");
    const plainNote = noteOf(createdCard(since(b)));

    const pass =
      createNote === `<font color='grey'>${want}</font>` &&
      closeNote === `<font color='grey'>${want}</font>` &&
      plainNote === `<font color='grey'>${wantPlain}</font>`;
    return { pass, evidence: short({ createNote, closeNote, plainNote }, 600) };
  },
);

// ---------------------------------------------------------------- F6
await check(
  "F6",
  "nameless user record: 1 contact GET for calls at t=0 and t=+59s, a 2nd GET at t=+60.001s; control (no user record): a GET on every call",
  async () => {
    const account = { accountId: "default", configured: true, appId: "cli_harness", appSecret: "harness-secret", domain: "feishu", config: {} };
    const gets = (id) => wire.filter((c) => c.via === "sdk" && c.method === "GET" && c.path === `/open-apis/contact/v3/users/${id}`).length;
    contactReplies.set("ou_nameless_harness", () => ({ code: 0, msg: "ok", data: { user: { open_id: "ou_nameless_harness" } } }));
    contactReplies.set("ou_norecord_harness", () => ({ code: 0, msg: "ok", data: {} }));
    const observed = [];
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-27T00:00:00Z") });
    try {
      for (const tick of [0, 59_000, 1_001]) {
        mock.timers.tick(tick);
        await m.__h_resolveFeishuSenderName({ account, senderId: "ou_nameless_harness", log: () => {} });
        observed.push(gets("ou_nameless_harness"));
      }
    } finally {
      mock.timers.reset();
    }
    await m.__h_resolveFeishuSenderName({ account, senderId: "ou_norecord_harness", log: () => {} });
    await m.__h_resolveFeishuSenderName({ account, senderId: "ou_norecord_harness", log: () => {} });
    const control = gets("ou_norecord_harness");
    const pass = observed.join(",") === "1,1,2" && control === 2;
    return { pass, evidence: `nameless GETs after t=0,+59s,+60.001s: ${observed.join(",")}; no-record GETs after 2 calls: ${control}` };
  },
);

// ---------------------------------------------------------------- F7
await check(
  "F7",
  "real core notifyProgressCardChanged: other session key opens no card; progress_card tool start adds no line; matching key (any case) opens the card with the exact checklist; after a partial the checklist sits under the answer below a rule; closed card = answer only; log 'progress-stream dispatcher='",
  async () => {
    const notify = coreProgress.__h_notifyProgressCardChanged;
    const checklist =
      "☑️ <font color='grey'>~~读取文件~~</font>\n▶️ **写报告**　<font color='blue'>进行中</font>";
    const card = { revision: 1, steps: [{ step: "读取文件", status: "completed" }, { step: "写报告", status: "in_progress" }] };
    const h = makeDispatcher({ sessionKey: "agent:main:feishu:group:oc_f7" });
    await h.d.dispatcherOptions.onReplyStart();
    selectRuntime(h.d, "claude-cli");
    notify("agent:main:feishu:group:oc_someone_else", card);
    await settle();
    const facts = { cardsAfterOtherKey: cardCreates(since(h)).length };
    facts.toolReturn = h.d.replyOptions.onToolStart({ name: "mcp__openclaw__progress_card", phase: "start" });
    await settle();
    facts.cardsAfterToolStart = cardCreates(since(h)).length;
    notify("AGENT:MAIN:feishu:group:oc_f7", card);
    await settle();
    facts.cardsAfterNotify = cardCreates(since(h)).length;
    facts.checklistText = lastText(since(h));
    h.d.replyOptions.onPartialReply({ text: "Answer" });
    await settle();
    facts.underAnswer = lastText(since(h));
    await finish(h, "Answer");
    facts.finalText = lastText(since(h));
    facts.logLine = h.logs.find((line) => line.includes("progress-stream dispatcher="));
    const pass =
      facts.cardsAfterOtherKey === 0 &&
      facts.toolReturn === false &&
      facts.cardsAfterToolStart === 0 &&
      facts.cardsAfterNotify === 1 &&
      facts.checklistText === checklist &&
      facts.underAnswer === `Answer\n\n---\n\n${checklist}` &&
      facts.finalText === "Answer" &&
      /progress-stream dispatcher=\d+ rev=1 steps=2 /.test(facts.logLine ?? "");
    return { pass, evidence: short(facts, 700) };
  },
);

// ---------------------------------------------------------------- c8c7a7427e1
await check(
  "c8c7a7427e1",
  "close logs card-phase enter/done in order: start-promise, partial-update-queue, queue, [final-body], note, settings; a 500 on /settings logs settings:error and 'Close failed:'",
  async () => {
    const phasesOf = (logs) =>
      logs
        .filter((line) => line.startsWith("feishu[default] card-phase "))
        .map((line) => JSON.parse(line.slice("feishu[default] card-phase ".length)))
        .map((entry) => `${entry.phase}:${entry.event}`);
    const a = makeDispatcher({ cfg: feishuCfg({ renderMode: "card" }) });
    await a.d.dispatcherOptions.onReplyStart();
    await finish(a, "reply");
    const phases = phasesOf(a.logs);
    const normalized = phases.filter((p) => !p.startsWith("final-body:"));
    const expectedCore = [
      "start-promise:enter", "start-promise:done",
      "partial-update-queue:enter", "partial-update-queue:done",
      "queue:enter", "queue:done",
      "note:enter", "note:done",
      "settings:enter", "settings:done",
    ];
    const finalBody = phases.filter((p) => p.startsWith("final-body:"));
    const finalBodyOk = finalBody.length === 0 || finalBody.join(",") === "final-body:enter,final-body:done";

    fetchInterceptors.push({
      once: true,
      match: (rec) => rec.method === "PATCH" && rec.path.endsWith("/settings"),
      respond: async () => new Response("upstream error", { status: 500 }),
    });
    const b = makeDispatcher({ cfg: feishuCfg({ renderMode: "card" }) });
    await b.d.dispatcherOptions.onReplyStart();
    await finish(b, "reply");
    const errPhases = phasesOf(b.logs);
    const closeFailed = b.logs.some((line) => line.includes("Close failed:"));
    const pass =
      JSON.stringify(normalized) === JSON.stringify(expectedCore) &&
      finalBodyOk &&
      errPhases.includes("settings:error") &&
      closeFailed;
    return { pass, evidence: short({ phases, errPhases, closeFailed }, 700) };
  },
);

// ---------------------------------------------------------------- 115e09052ec
await check(
  "115e09052ec",
  "with the first mid-stream write held, partials 'a:', 'a: b:', 'a: b: c:' produce exactly 2 content writes ['a:', 'a: b: c:'], all PUT /elements/content with uuid r_…; no append write (/content/content) mid-stream",
  async () => {
    const h = makeDispatcher({ cfg: feishuCfg({ renderMode: "card" }) });
    await h.d.dispatcherOptions.onReplyStart();
    await settle(200);
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    fetchInterceptors.push({
      once: true,
      match: (rec) => rec.method === "PUT" && rec.path.endsWith("/elements/content"),
      respond: async () => {
        await held;
        return undefined; // fall through to the default success response
      },
    });
    h.d.replyOptions.onPartialReply({ text: "a:" });
    await settle(100);
    h.d.replyOptions.onPartialReply({ text: "a: b:" });
    h.d.replyOptions.onPartialReply({ text: "a: b: c:" });
    await settle(100);
    release();
    await settle();
    const writes = contentWrites(since(h));
    await finish(h);
    const pass =
      writes.length === 2 &&
      writes[0].text === "a:" &&
      writes[1].text === "a: b: c:" &&
      writes.every((w) => w.kind === "replace" && String(w.uuid).startsWith("r_"));
    return { pass, evidence: short(writes, 500) };
  },
);

// ---------------------------------------------------------------- 697c81298da
await check(
  "697c81298da",
  "DEFAULT_TASK_TIMEOUT_MS === 600000; a same-key task waits behind a hung task until 600000 ms, then onTaskTimeout(key, 600000) fires and it starts",
  async () => {
    const constant = m.__h_DEFAULT_TASK_TIMEOUT_MS;
    const started = [];
    const timeouts = [];
    mock.timers.enable({ apis: ["setTimeout"] });
    let before;
    let after;
    try {
      const queue = m.__h_createSequentialQueue({ onTaskTimeout: (key, ms) => timeouts.push([key, ms]) });
      void queue("chat", () => {
        started.push("hung");
        return new Promise(() => {});
      });
      void queue("chat", async () => {
        started.push("next");
      });
      await flushMicro();
      mock.timers.tick(599_999);
      await flushMicro();
      before = { started: [...started], timeouts: timeouts.length };
      mock.timers.tick(1);
      await flushMicro();
      after = { started: [...started], timeouts: [...timeouts] };
    } finally {
      mock.timers.reset();
    }
    const pass =
      constant === 600000 &&
      before.started.join(",") === "hung" &&
      before.timeouts === 0 &&
      after.started.join(",") === "hung,next" &&
      JSON.stringify(after.timeouts) === JSON.stringify([["chat", 600000]]);
    return { pass, evidence: short({ constant, before, after }, 400) };
  },
);

// ---------------------------------------------------------------- 7490709cbe8
await check(
  "7490709cbe8",
  "a second message for a busy chat starts immediately only when VLAB_FEISHU_STEER_ENABLED=1 and the chat is listed (or '*'); default, unlisted chat and switch '0' keep strict per-chat order",
  async () => {
    const flushFactory = (params) => {
      const source = params.lifecycle;
      const completion = params.dispatch({
        abortSignal: source?.abortSignal ?? new AbortController().signal,
        onAdopted: async () => await source?.onAdopted?.(),
        onDeferred: () => source?.onDeferred?.(),
        onDeferredHeartbeat: () => source?.onDeferredHeartbeat?.(),
        deferredHeartbeatIntervalMs: source?.deferredHeartbeatIntervalMs,
        onAdoptionFinalizing: () => source?.onAdoptionFinalizing?.(),
        onFailed: source?.onFailed ? async (error) => await source.onFailed?.(error) : undefined,
        onAbandoned: async () => await source?.onAbandoned?.(),
      });
      return { admission: completion, completion };
    };
    let run = 0;
    const scenario = async (env) => {
      delete process.env.VLAB_FEISHU_STEER_ENABLED;
      delete process.env.VLAB_FEISHU_STEER_CHAT_IDS;
      Object.assign(process.env, env);
      run += 1;
      const firstId = `om_first_${run}`;
      const secondId = `om_second_${run}`;
      let onFlush;
      const channelRuntime = {
        commands: { isControlCommandMessage: () => false },
        debounce: {
          resolveInboundDebounceMs: () => 0,
          createInboundDebouncer: (params) => {
            onFlush = params.onFlush;
            return {
              enqueue: async (entry) => {
                await onFlush?.([entry], flushFactory).completion;
              },
              flushKey: async () => {},
              cancelKey: () => false,
              drain: async () => {},
            };
          },
        },
      };
      let releaseFirst;
      const firstTurn = new Promise((resolve) => {
        releaseFirst = resolve;
      });
      const started = [];
      const handler = m.__h_createFeishuMessageReceiveHandler({
        cfg: {},
        channelRuntime,
        accountId: "default",
        runtime: { log: () => {}, error: () => {} },
        chatHistories: new Map(),
        handleMessage: async (params) => {
          started.push(params.event.message.message_id);
          if (params.event.message.message_id === firstId) await firstTurn;
        },
        resolveDebounceText: () => "hello",
        hasProcessedMessage: async () => false,
        getBotOpenId: () => "ou_bot",
      });
      const event = (id) => ({
        sender: { sender_id: { open_id: "ou_user" }, sender_type: "user" },
        message: { message_id: id, chat_id: "oc_steer_chat", chat_type: "group", message_type: "text", content: JSON.stringify({ text: id }) },
      });
      const first = handler(event(firstId));
      for (let i = 0; i < 50 && started.length === 0; i += 1) await settle(10);
      const second = handler(event(secondId));
      await settle(50);
      const whileBusy = started.map((id) => id.replace(/_\d+$/u, ""));
      releaseFirst();
      await Promise.all([first, second]);
      return whileBusy.join(",");
    };
    const outcomes = {
      default: await scenario({}),
      listed: await scenario({ VLAB_FEISHU_STEER_ENABLED: "1", VLAB_FEISHU_STEER_CHAT_IDS: "oc_other, oc_steer_chat" }),
      wildcard: await scenario({ VLAB_FEISHU_STEER_ENABLED: "1", VLAB_FEISHU_STEER_CHAT_IDS: "*" }),
      unlisted: await scenario({ VLAB_FEISHU_STEER_ENABLED: "1", VLAB_FEISHU_STEER_CHAT_IDS: "oc_other" }),
      switchOff: await scenario({ VLAB_FEISHU_STEER_ENABLED: "0", VLAB_FEISHU_STEER_CHAT_IDS: "*" }),
    };
    delete process.env.VLAB_FEISHU_STEER_ENABLED;
    delete process.env.VLAB_FEISHU_STEER_CHAT_IDS;
    const pass =
      outcomes.default === "om_first" &&
      outcomes.listed === "om_first,om_second" &&
      outcomes.wildcard === "om_first,om_second" &&
      outcomes.unlisted === "om_first" &&
      outcomes.switchOff === "om_first";
    const steerByte = readFileSync(FEISHU_CHUNK, "utf8").includes('deferredToActiveRun !== "steer" && shouldSendNoVisibleReplyFallback');
    return { pass: pass && steerByte, evidence: short({ startedWhileFirstBusy: outcomes, noticeSuppressionBytePresent: steerByte }, 500) };
  },
);

// ---------------------------------------------------------------- E1
await check(
  "E1",
  "installed core: pending-delivery-notice settles Feishu as 'unresolved' and returns before sendRecoveryNotice; delivery-completion owes a notice only for unknown -> unknown; no captured request contains the 'couldn’t confirm' sentence",
  async () => {
    const notice = readFileSync(NOTICE_CHUNK, "utf8");
    const region = notice.slice(notice.indexOf("//#region src/channels/turn/pending-delivery-notice.ts"));
    const guard = region.search(/if \(context\.channel === "feishu"\) \{\s*await settleNotice\("unresolved"\);\s*return;\s*\}/);
    const send = region.indexOf("runtime.sendRecoveryNotice(");
    const completion = readFileSync(COMPLETION_CHUNK, "utf8");
    const owedNew = completion.includes('settled === "unknown" && current === "unknown" &&');
    const owedOld = /settled === "unknown" && \(current === "queued" \|\| current === "unknown"\)/.test(completion);
    const sentence = /couldn[’']t confirm whether my previous reply/i;
    const leaked = wire.filter((c) => sentence.test(JSON.stringify(c.body ?? ""))).length;
    const pass = guard >= 0 && send > guard && owedNew && !owedOld && leaked === 0;
    return {
      pass,
      evidence: short({ noticeChunk: NOTICE_CHUNK.split("/").pop(), feishuGuardBeforeSend: guard >= 0 && send > guard, completionChunk: COMPLETION_CHUNK.split("/").pop(), owedOnlyUnknownToUnknown: owedNew, oldQueuedCondition: owedOld, requestsWithSentence: leaked, requestsScanned: wire.length }, 500),
    };
  },
);

// ---------------------------------------------------------------- report
const passed = results.filter((r) => r.pass).length;
process.stdout.write(
  `${JSON.stringify({
    feishuChunk: FEISHU_CHUNK,
    coreRoot: OPENCLAW_PKG,
    node: process.version,
    sandbox,
    results,
    passed,
    total: results.length,
    escapedRequests,
    unhandledRejections: unhandled,
  })}\n`,
);
process.exit(escapedRequests.length > 0 ? 2 : 0);
