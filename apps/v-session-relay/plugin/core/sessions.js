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

/**
 * Agent that owns a Feishu group: a peer binding if there is one, else the configured
 * default agent, else the agent of the conversation relaying (`fallbackAgentId`).
 */
export function agentForFeishuGroup(cfg, chatId, fallbackAgentId) {
  for (const binding of Array.isArray(cfg?.bindings) ? cfg.bindings : []) {
    const match = binding?.match ?? {};
    const peer = match.peer ?? {};
    if ((match.channel ?? "feishu") === "feishu" && peer.id === chatId && typeof binding.agentId === "string") {
      return binding.agentId;
    }
  }
  return defaultAgentId(cfg) ?? fallbackAgentId ?? "main";
}

/** agents.list (array) or agents.entries (array, or object keyed by agent id). */
export function defaultAgentId(cfg) {
  const agents = cfg?.agents ?? {};
  const raw = agents.list ?? agents.entries;
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.entries(raw).map(([id, value]) => ({ ...(value && typeof value === "object" ? value : {}), id: value?.id ?? id }))
      : [];
  return list.find((a) => a?.default === true)?.id ?? (Array.isArray(raw) ? list[0]?.id : undefined) ?? null;
}

/**
 * Turns the model's `target` into a session. Accepts a session key, a Feishu chat id,
 * or a group name (matched against the chats the bot is in).
 * @returns {Promise<{ sessionKey: string, label: string } | { error: string, candidates?: string[] }>}
 */
export async function resolveTarget(target, { cfg, feishu, fromSessionKey }) {
  const fromAgent = parseSessionKey(fromSessionKey)?.agentId;
  const raw = String(target ?? "").trim();
  if (!raw) {
    return { error: "target is empty" };
  }
  if (/^agent:/u.test(raw)) {
    return { sessionKey: raw, label: await labelForSession(raw, { cfg, feishu }) };
  }
  const chatId = raw.replace(/^chat:/u, "");
  if (/^oc_\w+$/u.test(chatId)) {
    const sessionKey = `agent:${agentForFeishuGroup(cfg, chatId, fromAgent)}:feishu:group:${chatId}`;
    return { sessionKey, label: await labelForSession(sessionKey, { cfg, feishu }) };
  }
  if (!feishu) {
    return { error: `Cannot look up a group named 「${raw}」 without Feishu credentials; pass its session key instead.` };
  }
  const chats = await feishu.listChats();
  const norm = (s) => s.toLowerCase().replace(/\s+/gu, "");
  const exact = chats.filter((c) => norm(c.name) === norm(raw));
  const partial = exact.length ? exact : chats.filter((c) => c.name && norm(c.name).includes(norm(raw)));
  if (partial.length === 1) {
    const { chatId: id, name } = partial[0];
    return { sessionKey: `agent:${agentForFeishuGroup(cfg, id, fromAgent)}:feishu:group:${id}`, label: name };
  }
  if (partial.length > 1) {
    return { error: `More than one group matches 「${raw}」; ask the user which one or pass the exact name.`, candidates: partial.slice(0, 10).map((c) => c.name) };
  }
  return { error: `V is not in a group named 「${raw}」.` };
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
