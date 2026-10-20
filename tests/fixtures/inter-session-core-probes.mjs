// V's own core code that decides what an inter-session turn's context fields do, evaluated from the
// captured bytes V runs (release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist), so a
// channel-bridge test proves the effect on V instead of on a re-implementation:
//
//   vAppendChannelPromptContext()  prompt prelude (get-reply :3113 → history-image-prune :506):
//                                  ctx.ChannelPromptContext → the model's "Context:" block. 9.1
//                                  takes string[]; anything else is dropped without a trace.
//   vElevatedSenderCheck()         reply-elevated isApprovedElevatedSender (get-reply) with
//                                  sender-identity shouldUseFromAsSenderFallback (command-auth): in a
//                                  direct chat ctx.From is a sender identity next to ctx.SenderId,
//                                  so whoever From names lends their tools.elevated.allowFrom match.
//
// Only string helpers that live in other (uncaptured) chunks are stubbed, with their 9.1 behaviour.
import assert from "node:assert/strict";
import fs from "node:fs";

const CORE = new URL("../../release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist/", import.meta.url);
const readCore = (file) => fs.readFileSync(new URL(file, CORE), "utf8");

function region(source, start, end) {
  const i = source.indexOf(start);
  assert(i >= 0, `V's core has ${JSON.stringify(start.slice(0, 80))}`);
  const j = source.indexOf(end, i + start.length);
  assert(j > i, `V's core has ${JSON.stringify(end.slice(0, 80))} after it`);
  return source.slice(i, j);
}

/** V's appendChannelPromptContext(base, channelPromptContext). */
export function vAppendChannelPromptContext() {
  const getReply = readCore("get-reply-CqW1y05D.js");
  assert(getReply.includes("appendChannelPromptContext(prependEvents(rawPrefixedBody), params.sessionCtx.ChannelPromptContext)"), "V's get-reply appends sessionCtx.ChannelPromptContext");
  const chunk = readCore("history-image-prune-Dg0CDQ4a.js");
  const fn = /^function appendChannelPromptContext\(base, channelPromptContext\) \{\n[\s\S]*?\n\}\n/mu.exec(chunk)?.[0];
  assert(fn, "appendChannelPromptContext in V's core");
  return new Function("normalizeInboundTextNewlines", "markInboundContextLabel", `"use strict";\n${fn}return appendChannelPromptContext;`)((s) => String(s), (label) => label);
}

// 9.1's bundled chat channel ids (src/config/bundled-channel-config-metadata.generated.ts); the
// matcher strips these as sender prefixes ("feishu:ou_x" → "ou_x").
const CHAT_CHANNEL_ORDER = Object.freeze(["a2a", "buzz", "clickclack", "discord", "feishu", "googlechat", "imessage", "irc", "line", "matrix", "mattermost", "msteams", "nextcloud-talk", "nostr", "qa-channel", "raft", "reef", "signal", "slack", "sms", "synology-chat", "telegram", "tlon", "twitch", "whatsapp", "zalo", "zalouser"]);
const normalizeOptionalString = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const normalizeOptionalLowercaseString = (value) => normalizeOptionalString(value)?.toLowerCase();
const normalizeLowercaseStringOrEmpty = (value) => normalizeOptionalLowercaseString(value) ?? "";
const normalizeStringEntries = (list) => (Array.isArray(list) ? list.map((entry) => String(entry).trim()).filter(Boolean) : []);
const normalizeAtHashSlug = (value) => normalizeLowercaseStringOrEmpty(value).replace(/^[@#]+/u, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/gu, "");

/**
 * V's elevated sender check. approved({ provider, allowFrom, ctx }) is isApprovedElevatedSender with
 * a lowercasing allowFrom formatter (Feishu's formatAllowFromLowercase); fromIsSender(ctx) is whether
 * V reads ctx.From as a sender identity for that ctx.
 */
export function vElevatedSenderCheck() {
  const matcher = region(readCore("get-reply-CqW1y05D.js"), "//#region src/auto-reply/reply/elevated-allowlist-matcher.ts", "/** Resolves whether elevated tools are enabled and allowed for the inbound sender. */");
  assert.match(matcher, /if \(senderFrom && shouldUseFromAsSenderFallback\(\{\n\t\tfrom: senderFrom,\n\t\tchatType: params\.ctx\.ChatType\n\t\}\)\) addFormattedTokens\(/u, "V's elevated check adds ctx.From to the sender tokens");
  const identity = region(readCore("command-auth-DmNN2m2f.js"), "//#region src/auto-reply/sender-identity.ts", "//#endregion");
  const { isApprovedElevatedSender, shouldUseFromAsSenderFallback } = new Function(
    "CHAT_CHANNEL_ORDER", "normalizeOptionalString", "normalizeOptionalLowercaseString", "normalizeLowercaseStringOrEmpty", "normalizeStringEntries", "normalizeAtHashSlug",
    `"use strict";\n${identity}\n${matcher}\nreturn { isApprovedElevatedSender, shouldUseFromAsSenderFallback };`,
  )(CHAT_CHANNEL_ORDER, normalizeOptionalString, normalizeOptionalLowercaseString, normalizeLowercaseStringOrEmpty, normalizeStringEntries, normalizeAtHashSlug);
  const formatAllowFrom = (values) => values.map((value) => String(value).trim().toLowerCase()).filter(Boolean);
  return {
    approved: ({ provider, allowFrom, ctx }) => isApprovedElevatedSender({ provider, allowFrom: { [provider]: allowFrom }, ctx, formatAllowFrom }),
    fromIsSender: (ctx) => shouldUseFromAsSenderFallback({ from: ctx.From, chatType: ctx.ChatType }),
  };
}
