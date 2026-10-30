// show_widget on Feishu. A current_channel presenter makes the tool available on Feishu
// turns (src/canvas/widget-tool.ts): the wrapped document goes to the host service, the chat
// gets a card that opens it inside the Feishu client. The Gateway method is the way back:
// a page button becomes a synthetic inbound message from the person who pressed it, through
// the Feishu channel's own message path, so their permissions and the chat's queue apply.
import fs from "node:fs";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { widgetCard } from "./core/card.js";
import { FeishuApi, feishuCredentials, feishuTarget } from "./core/feishu.js";
import { captureWidget } from "./core/snapshot.js";

const DEFAULT_MAX_BYTES = 256 * 1024;
const SYNTHETIC_INBOUND = Symbol.for("v.feishu.synthetic-inbound");

const failure = (message, code = "presentation_error") => ({ ok: false, error: { code, message } });

export function resolveRoute(context) {
  if (context.messageChannel !== "feishu") return null;
  const target = feishuTarget(context.currentChannelId) ?? feishuTarget(context.deliveryContext?.to) ?? feishuTarget(context.currentMessagingTarget) ?? feishuTarget(context.nativeChannelId);
  if (!target || !context.sessionKey) return null;
  return { target, sessionKey: context.sessionKey, accountId: context.accountId ?? context.deliveryContext?.accountId ?? null };
}

export default definePluginEntry({
  id: "v-feishu-widgets",
  name: "V Feishu Widgets",
  description: "Runs show_widget HTML inside the Feishu client and sends its buttons back to the session.",
  register(api) {
    const pluginConfig = api.pluginConfig ?? {};
    const adminUrl = pluginConfig.adminUrl ?? "http://127.0.0.1:23971";
    const apis = new Map();
    const feishuFor = (creds) => {
      if (!apis.has(creds.appId)) apis.set(creds.appId, new FeishuApi(creds));
      return apis.get(creds.appId);
    };
    const admin = async (method, route, body) => {
      const token = fs.readFileSync(pluginConfig.adminTokenFile, "utf8").trim();
      const res = await fetch(`${adminUrl}${route}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`widget host ${route}: ${res.status} ${data.error ?? ""}`.trim());
      return data;
    };

    api.registerWidgetPresenter({
      target: "current_channel",
      description: "Post a card in the current Feishu chat that opens the widget inside the Feishu client",
      capabilities: { sourceKinds: ["html"], maxSourceBytes: pluginConfig.maxSourceBytes ?? DEFAULT_MAX_BYTES },
      match: (context) => resolveRoute(context) !== null,
      async availability(context) {
        return resolveRoute(context) ? { ok: true, value: { available: true } } : failure("Feishu widgets are unavailable for this conversation.", "unavailable");
      },
      async present({ context, document, title }) {
        const route = resolveRoute(context);
        const creds = route && feishuCredentials(api.config, route.accountId ?? undefined);
        if (!route || !creds) return failure("Feishu widgets are unavailable for this conversation.", "unavailable");
        const widget = await admin("POST", "/v1/widgets", {
          html: document.html,
          title,
          chat: route.target.receiveId,
          chatType: route.target.chatType,
          sessionKey: route.sessionKey,
          appId: creds.appId,
          accountId: route.accountId,
        });
        const feishu = feishuFor(creds);
        const view = { title, url: widget.url, version: widget.version };
        let messageId = widget.messageId;
        if (messageId) {
          await feishu.patchCard(messageId, widgetCard(view));
        } else {
          messageId = await feishu.sendCard(route.target, widgetCard(view));
          await admin("POST", `/v1/widgets/${widget.id}/message`, { messageId });
        }
        // The picture must not hold up the turn; the card is patched when it is ready.
        void (async () => {
          const bytes = await captureWidget({ chromePath: pluginConfig.chromePath, url: `${pluginConfig.publicLoopbackUrl ?? "http://127.0.0.1:23970/v-widgets"}${widget.localFrameUrl}` });
          if (!bytes) { api.logger?.warn?.("v-feishu-widgets snapshot: no picture"); return; }
          const imageKey = await feishu.uploadImage(bytes);
          await feishu.patchCard(messageId, widgetCard({ ...view, imageKey }));
        })().catch((error) => api.logger?.warn?.(`v-feishu-widgets snapshot: ${error.message}`));
        return { ok: true, value: { kind: "message", receipt: { primaryPlatformMessageId: messageId, platformMessageIds: [messageId], parts: [{ platformMessageId: messageId, kind: "card", index: 0 }], sentAt: Date.now() } } };
      },
    });

    api.registerGatewayMethod("vwidgets.inbound", async ({ params, respond }) => {
      try {
        const { accountId, chat, chatType, cardMessageId, title, openId, name, text } = params ?? {};
        const inbound = globalThis[SYNTHETIC_INBOUND]?.get(accountId ?? "default");
        if (typeof inbound !== "function") throw new Error("Feishu account is not running here");
        if (!/^ou_/u.test(openId ?? "") || !feishuTarget(chat)) throw new Error("bad target");
        const creds = feishuCredentials(api.config, accountId ?? undefined);
        const target = feishuTarget(chat);
        // Bots cannot post as a person, so the chat sees who pressed what from this line.
        const echoId = await feishuFor(creds).sendEcho({ ...target, cardMessageId, text: `🧩 ${name} 在「${title}」里：${text}` });
        // A turn can run for minutes; the page only needs to know it was accepted.
        void Promise.resolve(inbound({ openId, chatId: chat, chatType: chatType === "p2p" ? "p2p" : "group", text: `[来自组件「${title}」的操作] ${text}`, replyToMessageId: echoId }))
          .catch((error) => api.logger?.error?.(`v-feishu-widgets inbound: ${String(error?.message ?? error)}`));
        respond(true, { ok: true, messageId: echoId });
      } catch (error) {
        respond(false, undefined, { code: "UNAVAILABLE", message: String(error?.message ?? error) });
      }
    }, { scope: "operator.write" });
  },
});
