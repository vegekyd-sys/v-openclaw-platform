// The postback is a Gateway method registered by the v-feishu-widgets plugin. OpenClaw's
// CLI transport finds the Gateway from OPENCLAW_STATE_DIR / OPENCLAW_CONFIG_PATH, so this
// service keeps no Gateway credential of its own.
import path from "node:path";
import { pathToFileURL } from "node:url";

let loaded;
export async function callInbound(openclawDist, { widget, openId, name, text }) {
  loaded ??= import(pathToFileURL(path.join(openclawDist, "plugin-sdk/gateway-runtime.js")).href);
  const { callGatewayFromCli } = await loaded;
  return callGatewayFromCli("vwidgets.inbound", { json: true, timeout: "20000" }, {
    accountId: widget.accountId,
    chat: widget.chat,
    chatType: widget.chatType,
    cardMessageId: widget.messageId ?? null,
    title: widget.title,
    openId,
    name,
    text,
  }, { scopes: ["operator.write"], progress: false });
}
