// Session keys and the labels people see for them (design §7.1).
//
//   agent:<agentId>:<channel>:<direct|dm|group|channel>:<peer>[:…]   a chat on a channel
//   agent:<agentId>:main                                             V 主会话
//   agent:<agentId>:cron:…                                           定时任务
//   agent:<agentId>:webchat:… / :ios:… / :app:…                      V App
//   agent:<agentId>:subagent:… / …:run:… / hook:…                    not handled by the plugin

import { CHANNEL_ALIASES, bridgeChannelOf } from "./contracts.js";
import { clip } from "./visible.js";

export { bridgeChannelOf };

/** True when two delivery channel ids name the same channel ("dingtalk-connector" = "dingtalk"). */
export function sameChannel(a, b) {
  return Boolean(a) && Boolean(b) && bridgeChannelOf(a) === bridgeChannelOf(b);
}

export const LABEL_MAX = 24;

/** Parse a session key; never throws. */
export function parseSessionKey(sessionKey) {
  const key = String(sessionKey ?? "");
  const parts = key.split(":");
  if (parts[0] !== "agent" || !parts[1]) {
    return { key, agentId: null, kind: key.startsWith("hook:") ? "hook" : "other" };
  }
  const agentId = parts[1];
  const rest = parts.slice(2);
  if (rest.includes("subagent")) return { key, agentId, kind: "subagent" };
  if (rest.includes("run")) return { key, agentId, kind: "run" };
  if (rest[0] === "hook") return { key, agentId, kind: "hook" };
  if (rest.length === 1 && rest[0] === "main") return { key, agentId, kind: "main" };
  if (rest[0] === "cron") return { key, agentId, kind: "cron" };
  if (["webchat", "ios", "app", "android", "macos"].includes(rest[0])) return { key, agentId, kind: "app" };
  if (rest.length >= 3 && /^(direct|dm|group|channel)$/iu.test(rest[1])) {
    const direct = /^(direct|dm)$/iu.test(rest[1]);
    return { key, agentId, kind: "channel", channel: rest[0].toLowerCase(), chatType: direct ? "direct" : "group", peer: rest[2] };
  }
  return { key, agentId, kind: "other" };
}

/** Requester sessions the plugin leaves to the core's v2 path (§6.2). */
export function isUnsupportedRequester(sessionKey) {
  const p = parseSessionKey(sessionKey);
  return p.kind === "subagent" || p.kind === "run" || p.kind === "hook" || p.kind === "cron";
}
/** Targets the plugin leaves to the core (sub-agents, run-scoped and hook sessions). */
export function isUnsupportedTarget(sessionKey) {
  const p = parseSessionKey(sessionKey);
  return p.kind === "subagent" || p.kind === "run" || p.kind === "hook" || p.agentId === null;
}

/**
 * `commands.ownerAllowFrom` ids of one channel, without the "feishu:" prefix. A channel's aliases
 * count too: DingTalk owners are listed as "dingtalk-connector:<staffId>" (review-dingtalk).
 */
export function ownerIdsFor(cfg, channel) {
  const list = cfg?.commands?.ownerAllowFrom;
  if (!Array.isArray(list) || !channel) return [];
  const canonical = bridgeChannelOf(channel);
  const prefixes = [canonical, ...Object.keys(CHANNEL_ALIASES).filter((alias) => CHANNEL_ALIASES[alias] === canonical)].map((c) => `${c}:`);
  const ids = [];
  for (const e of list) {
    if (typeof e !== "string") continue;
    const prefix = prefixes.find((p) => e.toLowerCase().startsWith(p));
    const id = prefix ? e.slice(prefix.length).trim() : "";
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function agentName(agentId, agentNames) {
  return (agentNames && typeof agentNames[agentId] === "string" && agentNames[agentId]) || agentId;
}

/**
 * The label of a session as a person in `viewerAgentId`'s chats would read it:
 *   1. the group name (route.label from getChatInfo) or the entry's subject;
 *   2. the owner's direct chat: 「{ownerName} 私聊」;
 *   3. anyone else's direct chat: 「一个私聊」 (never who);
 *   4. main 「V 主会话」, cron 「定时任务」, webchat/iOS 「V App」.
 * Another agent's session gets 「{agentName} · 」 in front. ≤ 24 characters.
 */
export function sessionLabel({ sessionKey, route, entry, ownerName = "Tianyi", ownerIds = [], viewerAgentId, agentNames } = {}) {
  const p = parseSessionKey(sessionKey);
  let base;
  if (p.kind === "channel" || route) {
    const chatType = route?.chatType ?? p.chatType;
    if (chatType === "direct") {
      const peer = route?.peerId ?? p.peer;
      const owner = route?.humans === "owner_only" || (peer && ownerIds.includes(peer));
      base = owner ? `${ownerName} 私聊` : "一个私聊";
    } else {
      base = route?.label || entry?.subject || entry?.displayName || entry?.label || "一个群聊";
    }
  } else if (p.kind === "main") base = "V 主会话";
  else if (p.kind === "cron") base = "定时任务";
  else if (p.kind === "app") base = "V App";
  else base = entry?.subject || entry?.displayName || entry?.label || "一个会话";
  const prefix = viewerAgentId && p.agentId && p.agentId !== viewerAgentId ? `${agentName(p.agentId, agentNames)} · ` : "";
  return clip(`${prefix}${String(base).replace(/\s+/gu, " ").trim()}`, LABEL_MAX);
}
