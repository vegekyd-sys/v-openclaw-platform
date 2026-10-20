// Session keys <-> Feishu chats. A Feishu conversation's session key encodes its
// chat: agent:<agent>:feishu:group:oc_x (group) or agent:<agent>:feishu:direct:ou_x (DM).

export function parseSessionKey(sessionKey) {
  const m = String(sessionKey ?? "").match(/^agent:([^:]+):([^:]+):(group|channel|direct|dm):([^:]+)(?::.*)?$/iu);
  if (!m) {
    return null;
  }
  const [, agentId, channel, kind, peerId] = m;
  const direct = /^(direct|dm)$/iu.test(kind);
  return { agentId, channel: channel.toLowerCase(), kind: direct ? "direct" : "group", peerId };
}

/** Where to post a card for this session, or null for non-Feishu sessions. */
export function feishuReceiverForSession(sessionKey) {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed || parsed.channel !== "feishu") {
    return null;
  }
  if (parsed.kind === "group" && /^oc_/u.test(parsed.peerId)) {
    return { receiveIdType: "chat_id", receiveId: parsed.peerId };
  }
  if (parsed.kind === "direct" && /^ou_/u.test(parsed.peerId)) {
    return { receiveIdType: "open_id", receiveId: parsed.peerId };
  }
  return null;
}

/** Human label of a conversation: the Feishu group name, or 「<owner> 的私聊」. */
export async function labelForSession(sessionKey, { cfg, feishu, ownerName = "Tianyi", owners = [] } = {}) {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed) {
    return sessionKey;
  }
  if (parsed.kind === "direct") {
    const isOwner = owners.some((id) => id.toLowerCase() === `${parsed.channel}:${parsed.peerId}`.toLowerCase());
    return isOwner || owners.length === 0 ? `${ownerName} 的私聊` : "私聊";
  }
  if (parsed.channel === "feishu" && feishu) {
    try {
      const name = await feishu.chatName(parsed.peerId);
      if (name) {
        return name;
      }
    } catch {
      /* fall through */
    }
  }
  return `${parsed.channel}:${parsed.peerId}`;
}
