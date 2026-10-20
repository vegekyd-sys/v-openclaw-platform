// Guards on the native sessions_send. Who may ask is not limited here: any
// conversation's V may hand work to any other, and the receiving V decides under its
// redlines whether to do it. What is limited is runaway chains: the turn that executes
// a relayed request may not relay further (no A -> B -> C on its own), and one thread
// may hold at most maxChain sends (no endless A <-> B).
import { targetRunIdOf } from "./native.js";

/** Owners: plugin config `owners`, else the Gateway's `commands.ownerAllowFrom`. */
export function ownerList(config = {}, cfg = {}) {
  const raw = Array.isArray(config.owners) && config.owners.length ? config.owners : cfg?.commands?.ownerAllowFrom;
  return (Array.isArray(raw) ? raw : []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
}

/** Who asked, for the receiving V: the owner's name, a channel sender id, or null (V itself). */
export function describeRequester(requester, { ownerName = "Tianyi" } = {}) {
  if (!requester || typeof requester !== "object") {
    return null;
  }
  if (requester.senderIsOwner === true) {
    return ownerName;
  }
  if (typeof requester.senderId === "string" && requester.senderId) {
    return `${requester.channel ?? "channel"}:${requester.senderId}`;
  }
  return null;
}

/**
 * @param requestTurn the marker of this run when it answers another conversation's
 *   sessions_send (see turns.js), else null.
 * @returns {undefined | { block: true, blockReason: string }} a before_tool_call result.
 */
export function guardSend({ records, runId, requestTurn, maxChain = 8 }) {
  if (requestTurn) {
    return {
      block: true,
      blockReason: "This turn is answering a message from another conversation. Do not send anything with sessions_send from this turn, not even back: just write your reply, it goes back to that conversation automatically. If it needs someone else, say so in your reply and let that conversation decide.",
    };
  }
  const answering = targetRunIdOf(runId);
  if (answering) {
    const record = records.find((r) => r.runId === answering);
    if (record) {
      const used = records.filter((r) => r.chainId === record.chainId).length;
      if (used >= maxChain) {
        return { block: true, blockReason: `This exchange already has ${used} messages. Stop sending, tell the people here what you have and ask how to continue.` };
      }
    }
  }
  return undefined;
}
