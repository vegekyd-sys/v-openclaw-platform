export function resolveTrustedActor(context = {}, config = {}) {
  const session = typeof context.sessionKey === "string" ? context.sessionKey.trim() : "";
  if (!session) throw new Error("Project Sandbox denied: no trusted OpenClaw Session identity is available");

  if (context.oneShotCliRun === true && typeof config.cliActorUserId === "string" && config.cliActorUserId.trim()) {
    return { owner: `cli:${config.cliActorUserId.trim()}`, session };
  }

  const agentId = typeof context.agentId === "string" ? context.agentId.trim() : "";
  if (agentId) return { owner: `agent:${agentId}`, session };

  const sender = typeof context.requesterSenderId === "string" ? context.requesterSenderId.trim() : "";
  const channel = typeof context.messageChannel === "string" && context.messageChannel.trim()
    ? context.messageChannel.trim()
    : "channel";
  if (sender) return { owner: `${channel}:${sender}`, session };
  throw new Error("Project Sandbox denied: no trusted sender or Agent identity is available");
}
