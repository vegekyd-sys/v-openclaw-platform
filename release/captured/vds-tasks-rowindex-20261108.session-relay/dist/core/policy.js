// Loop prevention (design §5): the only place it is enforced is vrelay.send in the Gateway.
// Pure functions over ledger snapshots: classify an edge, apply budgets, detect wait cycles.

import { DEFAULT_LIMITS } from "./contracts.js";
import { forbiddenText } from "./copy.js";

/** Inline sends to the session that gave the current task must wait at least this long (§5.1). */
export const MIN_ASK_INLINE_MS = 30_000;
export const RATE_WINDOW_MS = 60_000;

export const pairKey = (a, b) => [a, b].sort().join("|");

/**
 * Wait graph edges from in-flight inline sends: requester session → target session while the
 * requester's tool is still waiting (inline, not expired, not claimed, not settled).
 */
export function waitEdges(sends, now) {
  const edges = new Map();
  for (const rec of sends) {
    if (rec.mode !== "inline") continue;
    if (rec.inline?.expiredAt || rec.inline?.claimedAt) continue;
    if ((rec.inline?.until ?? 0) <= now) continue;
    if (["result_ready", "failure_ready", "handed_back", "delivered_inline", "skipped", "cancelled"].includes(rec.phase)) continue;
    const from = rec.requester?.sessionKey;
    const to = rec.target?.sessionKey;
    if (!from || !to) continue;
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from).add(to);
  }
  return edges;
}

/** True when following "is inline-waiting on" edges from `start` reaches `goal`. */
export function reaches(edges, start, goal) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === goal) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of edges.get(cur) ?? []) stack.push(next);
  }
  return false;
}

/** Labels from the chain root down to `sessionKey`, via `members[*].parent`. */
export function chainPath(chain, sessionKey) {
  const out = [];
  const seen = new Set();
  let cur = sessionKey;
  while (cur && chain?.members?.[cur] && !seen.has(cur)) {
    seen.add(cur);
    out.unshift(chain.members[cur].label ?? cur);
    cur = chain.members[cur].parent;
  }
  return out;
}

function forbid(code, vars) {
  return { ok: false, code, text: forbiddenText(code, vars) };
}

/**
 * Classify one send (§5.1). Inputs:
 *   requester: { sessionKey }          run: { role, leaf, depth, runId } (null → root, depth 0)
 *   servesSend: the SendRecord the requesting run serves (its asker / requester), or null
 *   chain: ChainRecord or null (a root run starting a new chain)
 *   target: { sessionKey, label }      mode, inlineTimeoutMs
 *   edges: waitEdges(...)              delegatesThisRun: delegate sends already made by this run
 *   requestQueueLength: queued request turns of the target
 * Returns { ok: true, edge, kind, depth, leaf, newMember } or { ok: false, code, text }.
 */
export function classify({ requester, run, servesSend, chain, target, mode, inlineTimeoutMs = 0, edges = new Map(), delegatesThisRun = 0, requestQueueLength = 0, limits = DEFAULT_LIMITS, now = Date.now() }) {
  const reqKey = requester.sessionKey;
  const tgtKey = target.sessionKey;
  const d = run?.depth ?? 0;
  const to = target.label ?? tgtKey;

  if (run?.leaf) return forbid("LEAF", { asker: servesSend?.requester?.label ?? "对方" });
  if (reaches(edges, tgtKey, reqKey)) return forbid("WAIT_CYCLE", { to });

  let result;
  const member = chain?.members?.[tgtKey];
  if (servesSend && tgtKey === servesSend.requester?.sessionKey) {
    if (mode !== "inline" || inlineTimeoutMs < MIN_ASK_INLINE_MS) return forbid("REPLY_TO_REQUESTER", { to });
    result = { edge: "ask", kind: "ask", depth: member?.depth ?? Math.max(0, d - 1), leaf: true, newMember: false };
  } else if (member) {
    result = member.parent === reqKey
      ? { edge: "followup", kind: "request", depth: member.depth, leaf: false, newMember: false }
      : { edge: "ask", kind: "ask", depth: member.depth, leaf: true, newMember: false };
  } else {
    const depth = d + 1;
    if (depth > limits.maxDepth) return forbid("DEPTH", { d, path: chainPath(chain, reqKey).join(" → ") || (requester.label ?? reqKey) });
    if (delegatesThisRun + 1 > limits.maxFanoutPerRun) return forbid("FANOUT", { n: delegatesThisRun });
    const members = Object.keys(chain?.members ?? {}).length || 1;
    if (members + 1 > limits.maxChainMembers) return forbid("MEMBERS", { n: members });
    result = { edge: "delegate", kind: "request", depth, leaf: false, newMember: true };
  }

  if (chain) {
    if (now > (chain.hardExpiresAt ?? Infinity) || now > (chain.idleExpiresAt ?? Infinity)) {
      return forbid("CHAIN_EXPIRED", { h: Math.max(1, Math.round((now - (chain.createdAt ?? now)) / 3600_000)) });
    }
    const sends = chain.counters?.sends ?? 0;
    if (sends + 1 > limits.maxSendsPerChain) return forbid("CHAIN_BUDGET", { n: sends });
    const pair = chain.counters?.pairs?.[pairKey(reqKey, tgtKey)] ?? 0;
    if (pair + 1 > limits.maxPerPair) return forbid("PAIR_BUDGET", { to, n: pair });
    const recent = (chain.counters?.recent ?? []).filter((at) => now - at < RATE_WINDOW_MS).length;
    if (recent + 1 > limits.maxSendsPerMinute) return forbid("RATE", { n: recent });
  }
  if (result.kind === "request" && requestQueueLength >= limits.maxQueuePerTarget) {
    return forbid("QUEUE_FULL", { to, n: requestQueueLength });
  }
  return { ok: true, ...result };
}

/** Chain counters after one accepted send. */
export function countSend(chain, { requesterKey, targetKey, now }) {
  const counters = chain.counters ?? { sends: 0, pairs: {}, recent: [] };
  const key = pairKey(requesterKey, targetKey);
  return {
    sends: (counters.sends ?? 0) + 1,
    pairs: { ...(counters.pairs ?? {}), [key]: (counters.pairs?.[key] ?? 0) + 1 },
    recent: [...(counters.recent ?? []).filter((at) => now - at < RATE_WINDOW_MS), now],
  };
}
