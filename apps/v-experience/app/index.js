// vapp channel plugin: V's iOS app (v-voice client/) as a V Experience channel.
// Design: docs/v-app-channel.md. The logic is in core/vapp.js; this file wires
// it to the 9.1 plugin SDK.
//
// v-experience.mjs is installed next to this file (as the other channels get
// it); in the repository it is one directory up.
import { createChatChannelPlugin, defineChannelPluginEntry, buildChannelOutboundSessionRoute } from "openclaw/plugin-sdk/channel-core";
import { buildChannelInboundEventContext, resolveChannelInboundRouteEnvelope, toInboundMediaFactsWithMetadata } from "openclaw/plugin-sdk/channel-inbound";
import { callGatewayFromCli } from "openclaw/plugin-sdk/gateway-runtime";
import { saveMediaBuffer } from "openclaw/plugin-sdk/media-store";

import { ACCOUNT_ID, CHANNEL_ID, createVapp, vappConfig } from "./core/vapp.js";

const vx = await import("./v-experience.mjs").catch(() => import("../v-experience.mjs"));

// Turns and connections live in the Gateway. Worker children and CLI processes
// load the channel too (the message tool resolves its target there); their
// sends go to the Gateway through vapp.deliver.
const IN_WORKER = process.env.VLAB_WORKER_CHILD === "1";

let runtime;
let currentConfig;
const getConfig = () => runtime?.config?.current?.() ?? currentConfig ?? {};
const callGateway = (method, params, scopes = ["operator.questions"]) =>
  callGatewayFromCli(method, { config: getConfig() }, params, { scopes, progress: false, timeoutMs: 10_000 });

const vapp = createVapp({
  vx,
  getConfig,
  call: (method, params) => callGateway(method, params),
  inbound: {
    resolveRoute: resolveChannelInboundRouteEnvelope,
    buildContext: buildChannelInboundEventContext,
    dispatch: (params) => runtime.channel.inbound.dispatch(params),
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
  },
};

async function sendOut({ cfg, to, text, mediaUrl, payload }) {
  if (cfg) currentConfig = cfg;
  const media = [...new Set([mediaUrl, payload?.mediaUrl, ...(payload?.mediaUrls ?? [])].filter((m) => typeof m === "string" && m.trim()))].map((source) => ({ source }));
  const body = payload?.text ?? text ?? "";
  const presentation = payload?.presentation ?? payload?.channelData?.presentation;
  const link = presentation ? vx.linkCardFromPresentation(presentation, body, { commands: true }) : undefined;
  const message = { to, text: link ? undefined : body, media, ...(link ? { card: vx.linkVCard(link) } : {}) };
  const result = IN_WORKER ? await callGateway("vapp.deliver", message, ["operator.write"]) : vapp.deliver(message);
  return { channel: CHANNEL_ID, messageId: result?.id ?? "" };
}

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
  },
  outbound: {
    deliveryMode: "direct",
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
    api.registerGatewayMethod("vapp.deliver", method(({ params }) => vapp.deliver(params ?? {})), write);
  },
});
