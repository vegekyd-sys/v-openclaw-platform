// vapp channel plugin: V's iOS app (v-voice client/) as a V Experience channel.
// Design: docs/v-app-channel.md. The logic is in core/vapp.js; this file wires
// it to the 9.1 plugin SDK.
//
// v-experience.mjs is copied next to this file when installed, as the other
// channels get it; in the repository that file only re-exports ../v-experience.mjs.
import { createChatChannelPlugin, defineChannelPluginEntry, buildChannelOutboundSessionRoute } from "openclaw/plugin-sdk/channel-core";
import { buildChannelInboundEventContext, resolveChannelInboundRouteEnvelope, toInboundMediaFactsWithMetadata } from "openclaw/plugin-sdk/channel-inbound";
import { callGatewayFromCli } from "openclaw/plugin-sdk/gateway-runtime";
import { saveMediaBuffer } from "openclaw/plugin-sdk/media-store";
import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline";
import { createApns } from "./core/apns.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ACCOUNT_ID, CHANNEL_ID, createVapp, resolveUser, vappConfig } from "./core/vapp.js";
import * as vx from "./v-experience.mjs";

// Turns and connections live in the Gateway. Worker children and CLI processes
// load the channel too (the message tool resolves its target there); their
// sends go to the Gateway through vapp.deliver.
const IN_WORKER = process.env.VLAB_WORKER_CHILD === "1";

let runtime;
let currentConfig;
const getConfig = () => runtime?.config?.current?.() ?? currentConfig ?? {};
const callGateway = (method, params, scopes = ["operator.questions"]) =>
  callGatewayFromCli(method, { config: getConfig() }, params, { scopes, progress: false, timeoutMs: 10_000 });

// Turns start from the channel account's own task (gateway.startAccount), as a
// polling channel's do. Work started from inside a Gateway request outlives
// the request's admission and the Gateway refuses it as draining.
const turns = { queue: [], wake: undefined, running: false };
const startTurn = (job) => {
  if (!turns.running) throw Object.assign(new Error("V App 渠道还没有启动"), { code: "UNAVAILABLE" });
  turns.queue.push(job);
  turns.wake?.();
};
async function runAccount(ctx) {
  ctx.setStatus({ accountId: ctx.accountId, running: true, configured: true, enabled: true, lifecycle: "running" });
  turns.running = true;
  const unobserve = runtime.events.onAgentEvent((event) => vapp.observeAgentEvent(event));
  try {
    while (!ctx.abortSignal.aborted) {
      while (turns.queue.length) void turns.queue.shift()();
      await new Promise((resolve) => {
        turns.wake = resolve;
        ctx.abortSignal.addEventListener("abort", resolve, { once: true });
      });
      turns.wake = undefined;
    }
  } finally {
    unobserve?.();
    turns.running = false;
    ctx.setStatus({ accountId: ctx.accountId, running: false, configured: true, enabled: true, lifecycle: "stopped" });
  }
}

// One append-only JSON-lines file per user. Async, so a write never holds the Gateway.
const logFile = (userId) => path.join(runtime.state.resolveStateDir(), "vapp", `${encodeURIComponent(userId)}.jsonl`);
const fileStore = {
  async load(userId) {
    const raw = await fs.readFile(logFile(userId), "utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; });
    return raw.split("\n").filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  },
  async append(userId, entry) {
    await fs.mkdir(path.dirname(logFile(userId)), { recursive: true, mode: 0o700 });
    await fs.appendFile(logFile(userId), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  },
  async rewrite(userId, entries) {
    const temp = `${logFile(userId)}.tmp`;
    await fs.writeFile(temp, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""), { mode: 0o600 });
    await fs.rename(temp, logFile(userId));
  },
};

const pushFile = () => path.join(runtime.state.resolveStateDir(), "vapp", "push-tokens.json");
const apns = createApns({
  getConfig: () => getConfig()?.channels?.vapp?.apns,
  readFile: (file) => fs.readFile(file, "utf8"),
  loadTokens: () => fs.readFile(pushFile(), "utf8").then(JSON.parse).catch(() => ({})),
  saveTokens: async (tokens) => {
    await fs.mkdir(path.dirname(pushFile()), { recursive: true, mode: 0o700 });
    await fs.writeFile(pushFile(), JSON.stringify(tokens), { mode: 0o600 });
  },
  log: (message) => console.log(`[vapp] ${message}`),
});

const vapp = createVapp({
  vx,
  store: fileStore,
  notify: (userId, note) => { apns.notify(userId, note); },
  startTurn,
  getConfig,
  call: (method, params) => callGateway(method, params),
  inbound: {
    resolveRoute: resolveChannelInboundRouteEnvelope,
    buildContext: buildChannelInboundEventContext,
    dispatch: (params) => runtime.channel.inbound.dispatch(params),
    createPipeline: (params) => createChannelReplyPipeline(params),
    systemEvent: (message, options) => runtime.system.enqueueSystemEvent(message, options),
    saveMedia: saveMediaBuffer,
    toMediaFacts: toInboundMediaFactsWithMetadata,
  },
  log: (message) => console.log(`[vapp] ${message}`),
});

const userSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    owner: { type: "boolean" },
    devices: { type: "array", items: { type: "string" } },
  },
};
const channelSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    defaultUser: { type: "string" },
    users: { type: "object", additionalProperties: userSchema },
    apns: {
      type: "object",
      additionalProperties: false,
      properties: { keyFile: { type: "string" }, keyId: { type: "string" }, teamId: { type: "string" }, bundleId: { type: "string" } },
    },
  },
};

// A picture on a card may be a temp file the sender deletes right after sending.
async function keepCardImage(link) {
  const ref = link?.image?.ref;
  if (!ref?.startsWith("file://")) return link;
  const bytes = await fs.readFile(fileURLToPath(ref));
  const saved = await saveMediaBuffer(bytes, "image/jpeg", "outbound", 10 * 1024 * 1024);
  return { ...link, image: { ...link.image, ref: saved.path } };
}

async function sendOut({ cfg, to, text, mediaUrl, payload }) {
  if (cfg) currentConfig = cfg;
  const media = [...new Set([mediaUrl, payload?.mediaUrl, ...(payload?.mediaUrls ?? [])].filter((m) => typeof m === "string" && m.trim()))].map((source) => ({ source }));
  const body = payload?.text ?? text ?? "";
  const link = payload?.channelData?.vLinkCard ? await keepCardImage(payload.channelData.vLinkCard) : undefined;
  const message = { to, text: link ? undefined : body, media, ...(link ? { card: vx.linkVCard(link) } : {}) };
  const result = IN_WORKER ? await callGateway("vapp.deliver", message, ["operator.write"]) : vapp.deliver(message);
  return { channel: CHANNEL_ID, messageId: result?.id ?? "" };
}

const actions = {
  describeMessageTool: () => ({ actions: ["react"] }),
  supportsAction: ({ action }) => action === "react",
  handleAction: async ({ params, toolContext }) => {
    const reaction = { messageId: params.messageId ?? toolContext?.currentMessageId, emoji: params.emoji, remove: params.remove === true };
    const to = params.to ?? params.target ?? toolContext?.currentChannelId;
    const result = IN_WORKER ? await callGateway("vapp.deliver", { to, reaction }, ["operator.write"]) : vapp.deliver({ to, reaction });
    return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
  },
};

const plugin = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta: { id: CHANNEL_ID, label: "V App", selectionLabel: "V App", docsPath: "/channels/vapp", blurb: "V 的 iOS App" },
    capabilities: { chatTypes: ["direct"], media: true },
    reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
    configSchema: {
      schema: channelSchema,
      runtime: { safeParse: (value) => (value === undefined || (value && typeof value === "object" && !Array.isArray(value)) ? { success: true, data: value } : { success: false, issues: [{ path: [], message: "expected config object" }] }) },
    },
    config: {
      listAccountIds: () => [ACCOUNT_ID],
      resolveAccount: (cfg) => ({ accountId: ACCOUNT_ID, enabled: vappConfig(cfg).enabled, configured: true, config: cfg?.channels?.[CHANNEL_ID] ?? {} }),
      defaultAccountId: () => ACCOUNT_ID,
      isConfigured: () => true,
      resolveAllowFrom: ({ cfg }) => Object.keys(vappConfig(cfg).users),
    },
    messaging: {
      normalizeTarget: (raw) => String(raw ?? "").replace(/^vapp:/u, "").trim() || undefined,
      inferTargetChatType: () => "direct",
      targetResolver: { looksLikeId: (raw) => String(raw ?? "").trim().length > 0, hint: "<V 用户 id>" },
      resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target }) => buildChannelOutboundSessionRoute({
        cfg, agentId, channel: CHANNEL_ID, accountId, recipientSessionExact: true,
        peer: { kind: "direct", id: target }, chatType: "direct", from: `${CHANNEL_ID}:${accountId ?? ACCOUNT_ID}`, to: target,
      }),
    },
    gateway: { startAccount: (ctx) => runAccount(ctx) },
    actions,
  },
  outbound: {
    deliveryMode: "direct",
    // Buttons as V cards; a command button comes back as the tapper's message (vapp.action).
    presentationCapabilities: { supported: true, buttons: true, selects: false, context: true, divider: true },
    renderPresentation: ({ payload, presentation }) => {
      const card = vx.linkCardFromPresentation(presentation, payload.text, { commands: true });
      return card ? { ...payload, text: vx.linkCardText(card), channelData: { ...payload.channelData, vLinkCard: card } } : null;
    },
    sendPayload: (ctx) => sendOut(ctx),
    sendText: (ctx) => sendOut(ctx),
    sendMedia: (ctx) => sendOut(ctx),
  },
});

const method = (fn) => async (opts) => {
  try {
    opts.respond(true, await fn(opts));
  } catch (error) {
    opts.respond(false, undefined, { code: error?.code ?? "UNAVAILABLE", message: String(error?.message ?? error) });
  }
};

export default defineChannelPluginEntry({
  id: CHANNEL_ID,
  name: "V App",
  description: "V's iOS app as a channel: messages in, V cards out, over the Gateway connection the app already has.",
  plugin,
  setRuntime: (value) => { runtime = value; },
  registerFull(api) {
    currentConfig = api.config;
    if (IN_WORKER) return;
    const write = { scope: "operator.write" };
    api.registerGatewayMethod("vapp.hello", method(vapp.hello), write);
    api.registerGatewayMethod("vapp.send", method(vapp.send), write);
    api.registerGatewayMethod("vapp.action", method(vapp.action), write);
    api.registerGatewayMethod("vapp.stop", method(vapp.stop), write);
    api.registerGatewayMethod("vapp.push", method(async ({ params, client }) => {
      const user = resolveUser(getConfig(), client);
      if (!user) throw Object.assign(new Error("这台设备还没有绑定 V 用户"), { code: "UNAVAILABLE" });
      await apns.register(user.id, String(params?.token ?? ""), { sandbox: params?.sandbox === true });
      return { ok: true };
    }), write);
    api.registerGatewayMethod("vapp.history", method(vapp.history), write);
    api.registerGatewayMethod("vapp.react", method(vapp.userReact), write);
    api.registerGatewayMethod("vapp.deliver", method(({ params }) => vapp.deliver(params ?? {})), write);
  },
});
