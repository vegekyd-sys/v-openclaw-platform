// When a relay may start. Who may ask is not limited here: any conversation's V may
// hand work to any other, and the receiving V decides under its redlines whether to
// do it. What is limited is runaway chains: a conversation executing a relayed
// request may not relay further (no A -> B -> C on its own), and one thread may hold
// at most maxChain relays (no endless A <-> B).

/** Same rules the desktop-handoff plugin uses: identity only from the Gateway context. */
export function resolveTrustedActor(context = {}, config = {}) {
  const senderId = typeof context.requesterSenderId === "string" ? context.requesterSenderId.trim() : "";
  if (senderId) {
    const channel = typeof context.messageChannel === "string" && context.messageChannel.trim() ? context.messageChannel.trim() : "channel";
    return `${channel}:${senderId}`;
  }
  const owner = resolveOwnerActor(context);
  if (owner) {
    return owner;
  }
  // Test-only: CLI runs carry no sender; derive it from a direct-chat session key.
  if (config.sessionKeyActorFallback === true && typeof context.sessionKey === "string") {
    const m = context.sessionKey.match(/^agent:[^:]+:([^:]+):(?:direct|dm):([^:]+)$/iu);
    if (m) {
      return `${m[1]}:${m[2]}`;
    }
  }
  return null;
}

/** Harness runtimes (claude-cli / Codex loopback) give `senderIsOwner` but no sender id. */
export function resolveOwnerActor(context = {}) {
  if (context.senderIsOwner !== true) {
    return null;
  }
  const channel = typeof context.messageChannel === "string" && context.messageChannel.trim() ? context.messageChannel.trim() : null;
  if (!channel) {
    return null;
  }
  const cfg = context.config && typeof context.config === "object" ? context.config : context.runtimeConfig;
  const owners = ownerList({}, cfg).filter((id) => id.toLowerCase().startsWith(`${channel.toLowerCase()}:`));
  const to = typeof context.deliveryContext?.to === "string" ? context.deliveryContext.to.trim() : "";
  const peer = to.replace(/^user:/iu, "");
  if (peer && !/^chat:/iu.test(to)) {
    const match = owners.find((id) => id.toLowerCase() === `${channel.toLowerCase()}:${peer.toLowerCase()}`);
    if (match) {
      return match;
    }
  }
  return owners.length === 1 ? owners[0] : null;
}

/** Owners: plugin config `owners`, else the Gateway's `commands.ownerAllowFrom`. */
export function ownerList(config = {}, cfg = {}) {
  const raw = Array.isArray(config.owners) && config.owners.length ? config.owners : cfg?.commands?.ownerAllowFrom;
  return (Array.isArray(raw) ? raw : []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
}

/** What this conversation is doing because of a relay, from the ledger. */
export function activeRelay(records, sessionKey) {
  const executing = records.find((r) => r.to?.sessionKey === sessionKey && (r.status === "queued" || r.status === "delivering" || r.status === "running"));
  if (executing) {
    return { kind: "request", record: executing };
  }
  const answering = records.filter((r) => r.from?.sessionKey === sessionKey && r.status === "replying").at(-1);
  if (answering) {
    return { kind: "reply", record: answering };
  }
  return null;
}

/**
 * @returns {{ allow: true, chainId: string|null, via: "person"|"agent"|"reply" } | { allow: false, reason: string }}
 * chainId null means "start a new chain".
 */
export function decideSend({ records, sessionKey, targetSessionKey, actor, maxChain = 8 }) {
  if (!sessionKey) {
    return { allow: false, reason: "Session relay needs a conversation to relay from." };
  }
  if (targetSessionKey === sessionKey) {
    return { allow: false, reason: "That is this conversation; do the work here instead of relaying it to yourself." };
  }
  const active = activeRelay(records, sessionKey);
  if (active?.kind === "request") {
    return {
      allow: false,
      reason: `This conversation is working on a request relayed from 「${active.record.from?.label ?? "another conversation"}」. Finish it and reply here; your reply goes back automatically. Relaying further is not allowed from a relayed turn.`,
    };
  }
  if (active?.kind === "reply") {
    const chainId = active.record.chainId;
    const used = records.filter((r) => r.chainId === chainId).length;
    if (used >= maxChain) {
      return { allow: false, reason: `This task has already been relayed ${used} times. Stop relaying, report what you have to the people here and ask how to continue.` };
    }
    return { allow: true, chainId, via: "reply" };
  }
  return { allow: true, chainId: null, via: actor ? "person" : "agent" };
}
