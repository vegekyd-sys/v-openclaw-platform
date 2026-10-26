// Where a session is and how to reach it (design §2.a resolveRoute, §3.10 routes.js):
// read the session entry's delivery context, pick the transport (the channel's inbound bridge
// when one is registered, else the agent transport), and work out who is in the chat and which
// identity a synthetic turn carries there (chain-root rule).

import { normalizeAccountId, syntheticSenderIdFor } from "./contracts.js";
import { bridgeChannelOf, ownerIdsFor, parseSessionKey, sameChannel, sessionLabel } from "./labels.js";

const ENTRY_CACHE_MS = 30_000;

/** Delivery context of a session entry (`entry.delivery.kind === "external"` → `.context`). */
export function deliveryOf(entry) {
  const d = entry?.delivery;
  if (d?.kind === "external" && d.context && typeof d.context === "object") return d.context;
  return undefined;
}

function humansWithoutBridge(channel, chatType, peer, ownerIds) {
  if (chatType === "group") return channel === "feishu" ? "unknown" : "shared";
  if ((channel === "feishu" || channel === "telegram") && peer && ownerIds.includes(peer)) return "owner_only";
  return "single_peer";
}

/**
 * Route of a chat without asking its bridge: the stored `to`, else (Feishu, Telegram) the id in
 * the session key. DingTalk and WeCom keys are lower-cased and cannot be read back (§2.a).
 * `route.channel` is the bridge channel (CHANNELS); a delivery channel id that differs from it
 * ("dingtalk-connector") is kept as `deliveryChannel` for the agent transport's outbound adapter.
 */
export function deriveRoute({ sessionKey, delivery, channel, accountId, ownerIds = [] }) {
  const p = parseSessionKey(sessionKey);
  const raw = channel ?? delivery?.channel ?? p.channel;
  const ch = bridgeChannelOf(raw);
  const viaDelivery = raw && raw !== ch ? { deliveryChannel: raw } : {};
  const account = normalizeAccountId(delivery?.accountId ?? accountId);
  if (delivery?.to) {
    const to = String(delivery.to);
    const chatId = to.replace(/^(chat|user|group|channel):/u, "");
    const chatType = p.chatType ?? (/^user:/u.test(to) ? "direct" : "group");
    return {
      ok: true,
      route: {
        channel: ch, ...viaDelivery, accountId: account, to, chatId, chatType,
        ...(chatType === "direct" ? { peerId: chatId } : {}),
        humans: humansWithoutBridge(ch, chatType, chatId, ownerIds),
      },
    };
  }
  if (p.kind !== "channel" || bridgeChannelOf(p.channel) !== ch) return { ok: false, code: "NO_ROUTE", reason: "no delivery address" };
  if (ch === "feishu") {
    const ok = p.chatType === "group" ? /^oc_[0-9a-f]+$/u.test(p.peer) : /^ou_[0-9a-f]+$/u.test(p.peer);
    if (!ok) return { ok: false, code: "NO_ROUTE", reason: "key does not carry a Feishu id" };
    const to = p.chatType === "group" ? `chat:${p.peer}` : `user:${p.peer}`;
    return {
      ok: true,
      route: {
        channel: ch, accountId: account, to, chatId: p.peer, chatType: p.chatType,
        ...(p.chatType === "direct" ? { peerId: p.peer } : {}),
        humans: humansWithoutBridge(ch, p.chatType, p.peer, ownerIds),
      },
    };
  }
  if (ch === "telegram") {
    return {
      ok: true,
      route: {
        channel: ch, accountId: account, to: p.peer, chatId: p.peer, chatType: p.chatType,
        ...(p.chatType === "direct" ? { peerId: p.peer } : {}),
        humans: humansWithoutBridge(ch, p.chatType, p.peer, ownerIds),
      },
    };
  }
  return { ok: false, code: "NO_ROUTE", reason: `${ch} needs a stored delivery address` };
}

/**
 * The identity a synthetic turn carries in the target chat (§2.a, chain-root rule):
 * the owner's id there when the chain's root person is the owner; that person's own id when
 * the chain started on this channel; else a synthetic, never-owner id.
 */
export function senderFor({ route, principal, chainId, fromLabel, cfg }) {
  const channel = route?.channel;
  const ownerIds = ownerIdsFor(cfg, channel);
  const ownerIdHere = ownerIds[0];
  let principalIdHere = principal?.id && sameChannel(principal.channel, channel) ? principal.id : undefined;
  // senderIsOwner null (unknown) or false is a non-owner (review-core-send): an owner's id is
  // presented in the target chat only for a chain whose root is known to be the owner.
  if (principalIdHere && principal?.isOwner !== true && ownerIds.includes(principalIdHere)) principalIdHere = undefined;
  let sender;
  if (principal?.isOwner === true && ownerIdHere) sender = { id: ownerIdHere, isOwnerIdentity: true };
  else if (principalIdHere) sender = { id: principalIdHere, isOwnerIdentity: false };
  else sender = { id: syntheticSenderIdFor(chainId), isOwnerIdentity: false };
  sender.name = `「${fromLabel}」的 V（会话协作）`;
  const routePeerId = route?.chatType === "direct" ? route.peerId : (ownerIdHere ?? principalIdHere);
  const askUserAnswererId = principalIdHere ?? ownerIdHere;
  return {
    sender,
    ...(routePeerId ? { routePeerId } : {}),
    ...(askUserAnswererId ? { askUserAnswererId } : {}),
  };
}

/**
 * A group route without a name gets the session entry's subject (review-dingtalk): the bridge
 * passes it as the group subject, so the target session's label is not rewritten to an id by a
 * synthetic turn. Only `subject`: 9.1's `displayName` is buildGroupDisplayName's
 * "<provider>:g-<slug>" (of the subject, or of the chat id when there is none), never a group
 * name, and passed on as the subject the core would store it as one. Direct chats are never
 * named (§7.1).
 */
function withLabel(route, entry) {
  if (!route || route.label || route.chatType !== "group") return route;
  const label = typeof entry?.subject === "string" ? entry.subject.trim() : "";
  return label ? { ...route, label } : route;
}

export function createRoutes({ getSessionEntry, getConfig = () => ({}), bridges, ownerName = "Tianyi", agentNames = {}, logger, now = Date.now }) {
  const cache = new Map();

  function entryOf(sessionKey, agentId, { fresh = false } = {}) {
    const k = `${agentId ?? ""}|${sessionKey}`;
    const hit = cache.get(k);
    if (!fresh && hit && now() - hit.at < ENTRY_CACHE_MS) return hit.entry;
    let entry;
    try {
      entry = typeof getSessionEntry === "function" ? getSessionEntry({ sessionKey, ...(agentId ? { agentId } : {}) }) : undefined;
    } catch (err) {
      logger?.warn?.(`v-session-relay: getSessionEntry(${sessionKey}) failed: ${err?.message ?? err}`);
      entry = undefined;
    }
    cache.set(k, { at: now(), entry });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    return entry;
  }

  /**
   * `{ ok: true, transport, bridgeKey, route, entry }` or `{ ok: false, code, reason }`.
   * `route` is null for a session with no chat (main, webchat): agent transport, nothing visible.
   */
  async function resolve({ sessionKey, agentId, hint, fresh = false, avoidBridge = false }) {
    const p = parseSessionKey(sessionKey);
    const entry = entryOf(sessionKey, agentId, { fresh });
    const stored = deliveryOf(entry);
    const delivery = stored?.to ? stored : (hint?.to ? hint : stored);
    const channel = delivery?.channel ?? p.channel;
    if (!channel) return { ok: true, transport: "agent", bridgeKey: null, route: null, entry };
    const accountId = normalizeAccountId(delivery?.accountId);
    // DingTalk: the session says "dingtalk-connector", the bridge is "dingtalk:<acct>" (V's account
    // "__default__"; the bridge registers "dingtalk:default" too for sessions without an account).
    const bridgeKey = `${bridgeChannelOf(channel)}:${accountId}`;
    const cfg = getConfig() ?? {};
    const ownerIds = ownerIdsFor(cfg, channel);
    const bridge = avoidBridge ? undefined : bridges?.get(bridgeKey);
    if (bridge) {
      let rr;
      try {
        rr = await bridge.resolveRoute({
          sessionKey, agentId,
          ...(delivery ? { delivery: { channel, to: delivery.to, accountId: delivery.accountId, threadId: delivery.threadId } } : {}),
          ownerIds,
        });
      } catch (err) {
        logger?.warn?.(`v-session-relay: ${bridgeKey} resolveRoute failed: ${err?.message ?? err}`);
        rr = { ok: false, code: "NO_ROUTE", reason: String(err?.message ?? err) };
      }
      if (rr?.ok) return { ok: true, transport: "bridge", bridgeKey, route: withLabel(rr.route, entry), entry };
      if (rr?.code === "CHAT_GONE" || rr?.code === "NOT_MEMBER") return { ok: false, code: rr.code, reason: rr.reason ?? rr.code };
      // The bridge cannot place it: try the agent transport with what the entry says.
    }
    const derived = deriveRoute({ sessionKey, delivery, channel, accountId, ownerIds });
    if (derived.ok) return { ok: true, transport: "agent", bridgeKey: bridge ? bridgeKey : null, route: withLabel(derived.route, entry), entry };
    if (p.kind === "channel") return { ok: false, code: "NO_ROUTE", reason: derived.reason };
    return { ok: true, transport: "agent", bridgeKey: null, route: null, entry };
  }

  function label({ sessionKey, agentId, route, viewerAgentId }) {
    const p = parseSessionKey(sessionKey);
    const entry = entryOf(sessionKey, agentId ?? p.agentId);
    const channel = route?.channel ?? p.channel;
    return sessionLabel({
      sessionKey, route, entry, ownerName, agentNames, viewerAgentId,
      ownerIds: ownerIdsFor(getConfig() ?? {}, channel),
    });
  }

  return {
    hasEntries: typeof getSessionEntry === "function",
    entryOf,
    resolve,
    label,
    senderFor: (args) => senderFor({ ...args, cfg: getConfig() ?? {} }),
    ownerIds: (channel) => ownerIdsFor(getConfig() ?? {}, channel),
    invalidate: (sessionKey) => { for (const k of [...cache.keys()]) if (k.endsWith(`|${sessionKey}`)) cache.delete(k); },
  };
}
