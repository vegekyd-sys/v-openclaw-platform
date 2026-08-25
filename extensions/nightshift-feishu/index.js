import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { SILENT_REPLY_TOKEN } from "openclaw/plugin-sdk/reply-runtime";
import { buildReviewOutcomeCard, parseReviewArgs, replaceReviewCard } from "./review-command.js";

export default definePluginEntry({
  id: "nightshift-feishu",
  name: "Night Shift Feishu",
  description: "Routes authorized Feishu review-card commands directly to Night Shift.",
  register(api) {
    const baseUrl = readBaseUrl(api.pluginConfig?.baseUrl);
    api.registerCommand({
      name: "nightshift-review",
      description: "Apply an authorized Night Shift review decision from a Feishu notification.",
      acceptsArgs: true,
      requireAuth: false,
      handler: async (ctx) => {
        try {
          const { action, token } = parseReviewArgs(ctx.args);
          if (!ctx.senderId) throw new Error("Feishu reviewer identity is unavailable");
          const response = await fetch(new URL("/api/notifications/review", baseUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, actorOpenId: ctx.senderId, token }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error ?? `Night Shift returned HTTP ${response.status}`);
          await replaceReviewCard({
            accountId: ctx.accountId,
            card: buildReviewOutcomeCard(body),
            config: ctx.config,
            messageId: body.messageId,
          });
          return { text: SILENT_REPLY_TOKEN };
        } catch (error) {
          api.logger.warn?.(`nightshift-review rejected: ${error.message}`);
          return { isError: true, text: `无法处理这次审核：${error.message}` };
        }
      },
    });
  },
});

function readBaseUrl(value) {
  const url = new URL(typeof value === "string" && value.trim() ? value : "http://127.0.0.1:24879");
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("nightshift-feishu baseUrl must use http or https");
  return url;
}
