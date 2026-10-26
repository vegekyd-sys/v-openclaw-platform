// §5.1: every edge and every PolicyCode, the wait-cycle rule and the counters.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_LIMITS, POLICY_CODES } from "../core/contracts.js";
import { forbiddenText } from "../core/copy.js";
import { MIN_ASK_INLINE_MS, chainPath, classify, countSend, pairKey, reaches, waitEdges } from "../core/policy.js";

const NOW = 1_760_000_000_000;
const A = "agent:makaron:feishu:direct:ou_a";
const X = "agent:makaron:feishu:group:oc_x";
const RA = "agent:makaron:feishu:group:oc_ra";
const RB = "agent:makaron:feishu:group:oc_rb";
const NEW = "agent:makaron:feishu:group:oc_new";

function chain(over = {}) {
  return {
    chainId: "c_test", createdAt: NOW - 1000, lastActivityAt: NOW - 1000,
    idleExpiresAt: NOW + DEFAULT_LIMITS.chainIdleTtlMs, hardExpiresAt: NOW + DEFAULT_LIMITS.chainHardTtlMs,
    root: { sessionKey: A, label: "Tianyi 私聊" },
    members: {
      [A]: { depth: 0, parent: null, label: "Tianyi 私聊" },
      [X]: { depth: 1, parent: A, label: "X" },
      [RA]: { depth: 2, parent: X, label: "房间 a" },
      [RB]: { depth: 2, parent: X, label: "房间 b" },
    },
    counters: { sends: 3, pairs: {}, recent: [] },
    ...over,
  };
}
const sAX = { sendId: "s_ax", requester: { sessionKey: A, label: "Tianyi 私聊" }, target: { sessionKey: X } };
const sXA = { sendId: "s_xa", requester: { sessionKey: X, label: "X" }, target: { sessionKey: RA } };
const base = (over) => ({ limits: DEFAULT_LIMITS, now: NOW, mode: "async", inlineTimeoutMs: 0, ...over });

test("policy: a root run delegates to a new session (depth 1)", () => {
  const r = classify(base({ requester: { sessionKey: A, label: "Tianyi 私聊" }, run: null, servesSend: null, chain: null, target: { sessionKey: X, label: "X" } }));
  assert.deepEqual(r, { ok: true, edge: "delegate", kind: "request", depth: 1, leaf: false, newMember: true });
});

test("policy: LEAF — an ask turn cannot send", () => {
  const r = classify(base({ requester: { sessionKey: X }, run: { role: "ask", leaf: true, depth: 1 }, servesSend: { requester: { label: "房间 a" } }, chain: chain(), target: { sessionKey: RB, label: "房间 b" } }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "LEAF");
  assert.equal(r.text, forbiddenText("LEAF", { asker: "房间 a" }));
});

test("policy: WAIT_CYCLE — the target is inline-waiting on the requester (also through a chain)", () => {
  const sends = [
    { mode: "inline", inline: { until: NOW + 60_000 }, phase: "running", requester: { sessionKey: RA }, target: { sessionKey: RB } },
  ];
  const edges = waitEdges(sends, NOW);
  assert(reaches(edges, RA, RB));
  const r = classify(base({ requester: { sessionKey: RB }, run: { role: "request", depth: 2 }, servesSend: sXA, chain: chain(), target: { sessionKey: RA, label: "房间 a" }, edges, mode: "inline", inlineTimeoutMs: 120_000 }));
  assert.equal(r.code, "WAIT_CYCLE");
  // RA waits on X, X waits on RB: RB → RA closes the cycle.
  const longer = waitEdges([
    { mode: "inline", inline: { until: NOW + 1 }, phase: "queued", requester: { sessionKey: RA }, target: { sessionKey: X } },
    { mode: "inline", inline: { until: NOW + 1 }, phase: "queued", requester: { sessionKey: X }, target: { sessionKey: RB } },
  ], NOW);
  assert.equal(classify(base({ requester: { sessionKey: RB }, run: { role: "request", depth: 2 }, servesSend: sXA, chain: chain(), target: { sessionKey: RA }, edges: longer })).code, "WAIT_CYCLE");
  // Expired, claimed or settled inline sends are not waits.
  for (const s of [
    { mode: "inline", inline: { until: NOW - 1 }, phase: "running" },
    { mode: "inline", inline: { until: NOW + 1, expiredAt: NOW }, phase: "running" },
    { mode: "inline", inline: { until: NOW + 1, claimedAt: NOW }, phase: "delivered_inline" },
    { mode: "inline", inline: { until: NOW + 1 }, phase: "result_ready" },
    { mode: "async", inline: { until: 0 }, phase: "running" },
  ]) assert.equal(waitEdges([{ ...s, requester: { sessionKey: RA }, target: { sessionKey: RB } }], NOW).size, 0);
});

test("policy: REPLY_TO_REQUESTER for async (and too-short inline) to the session that gave the task; inline ask allowed", () => {
  const args = { requester: { sessionKey: X }, run: { role: "request", depth: 1 }, servesSend: sAX, chain: chain(), target: { sessionKey: A, label: "Tianyi 私聊" } };
  assert.equal(classify(base({ ...args })).code, "REPLY_TO_REQUESTER");
  assert.equal(classify(base({ ...args, mode: "inline", inlineTimeoutMs: MIN_ASK_INLINE_MS - 1 })).code, "REPLY_TO_REQUESTER");
  const ok = classify(base({ ...args, mode: "inline", inlineTimeoutMs: 120_000 }));
  assert.deepEqual(ok, { ok: true, edge: "ask", kind: "ask", depth: 0, leaf: true, newMember: false });
  // A wake turn serving the same send is bound the same way.
  assert.equal(classify(base({ ...args, run: { role: "wake", depth: 1 } })).code, "REPLY_TO_REQUESTER");
});

test("policy: ask to a sibling / ancestor (async or inline), followup to an own child", () => {
  const sib = classify(base({ requester: { sessionKey: RA }, run: { role: "request", depth: 2 }, servesSend: sXA, chain: chain(), target: { sessionKey: RB } }));
  assert.deepEqual(sib, { ok: true, edge: "ask", kind: "ask", depth: 2, leaf: true, newMember: false });
  const anc = classify(base({ requester: { sessionKey: RA }, run: { role: "request", depth: 2 }, servesSend: sXA, chain: chain(), target: { sessionKey: A }, mode: "inline", inlineTimeoutMs: 120_000 }));
  assert.equal(anc.edge, "ask");
  const follow = classify(base({ requester: { sessionKey: X }, run: { role: "wake", depth: 1 }, servesSend: sAX, chain: chain(), target: { sessionKey: RA } }));
  assert.deepEqual(follow, { ok: true, edge: "followup", kind: "request", depth: 2, leaf: false, newMember: false });
});

test("policy: DEPTH, FANOUT and MEMBERS on delegate edges", () => {
  const depth = classify(base({ requester: { sessionKey: RA, label: "房间 a" }, run: { role: "request", depth: 2 }, servesSend: sXA, chain: chain(), target: { sessionKey: NEW } }));
  assert.equal(depth.code, "DEPTH");
  assert.equal(depth.text, forbiddenText("DEPTH", { d: 2, path: chainPath(chain(), RA).join(" → ") }));
  assert.match(depth.text, /Tianyi 私聊 → X → 房间 a/u);
  const fan = classify(base({ requester: { sessionKey: X }, run: { role: "request", depth: 1 }, servesSend: sAX, chain: chain(), target: { sessionKey: NEW }, delegatesThisRun: 5 }));
  assert.equal(fan.code, "FANOUT");
  assert.equal(fan.text, forbiddenText("FANOUT", { n: 5 }));
  const members = {};
  for (let i = 0; i < 8; i += 1) members[`k${i}`] = { depth: 1, parent: A };
  const mem = classify(base({ requester: { sessionKey: X }, run: { role: "request", depth: 1 }, servesSend: sAX, chain: chain({ members: { ...members, [X]: { depth: 1, parent: A } } }), target: { sessionKey: NEW } }));
  assert.equal(mem.code, "MEMBERS");
});

test("policy: CHAIN_BUDGET, PAIR_BUDGET, RATE, CHAIN_EXPIRED and QUEUE_FULL", () => {
  const args = { requester: { sessionKey: X }, run: { role: "request", depth: 1 }, servesSend: sAX, target: { sessionKey: RA, label: "房间 a" } };
  assert.equal(classify(base({ ...args, chain: chain({ counters: { sends: 24, pairs: {}, recent: [] } }) })).code, "CHAIN_BUDGET");
  const pair = classify(base({ ...args, chain: chain({ counters: { sends: 3, pairs: { [pairKey(X, RA)]: 6 }, recent: [] } }) }));
  assert.equal(pair.code, "PAIR_BUDGET");
  assert.equal(pair.text, forbiddenText("PAIR_BUDGET", { to: "房间 a", n: 6 }));
  const rate = classify(base({ ...args, chain: chain({ counters: { sends: 3, pairs: {}, recent: Array.from({ length: 8 }, (_, i) => NOW - i * 1000) } }) }));
  assert.equal(rate.code, "RATE");
  // Old timestamps fall out of the window.
  assert.equal(classify(base({ ...args, chain: chain({ counters: { sends: 3, pairs: {}, recent: Array.from({ length: 8 }, () => NOW - 61_000) } }) })).ok, true);
  assert.equal(classify(base({ ...args, chain: chain({ idleExpiresAt: NOW - 1 }) })).code, "CHAIN_EXPIRED");
  assert.equal(classify(base({ ...args, chain: chain({ hardExpiresAt: NOW - 1, createdAt: NOW - 25 * 3600_000 }) })).text, forbiddenText("CHAIN_EXPIRED", { h: 25 }));
  const full = classify(base({ ...args, chain: chain(), requestQueueLength: 10 }));
  assert.equal(full.code, "QUEUE_FULL");
  assert.equal(full.text, forbiddenText("QUEUE_FULL", { to: "房间 a", n: 10 }));
  // asks are not held back by a full request queue
  assert.equal(classify(base({ requester: { sessionKey: RA }, run: { role: "request", depth: 2 }, servesSend: sXA, chain: chain(), target: { sessionKey: RB }, requestQueueLength: 10 })).ok, true);
});

test("policy: every PolicyCode is reachable and §5.2's fan-out fits the budget", () => {
  // The A → X → 3 rooms story with two asks each stays under 24 sends and 6 per pair.
  let c = { counters: { sends: 0, pairs: {}, recent: [] } };
  const add = (a, b, t) => { c = { counters: countSend(c, { requesterKey: a, targetKey: b, now: t }) }; };
  add(A, X, NOW);
  for (const r of [RA, RB, "r3"]) add(X, r, NOW + 1);
  for (const r of [RA, RB, "r3"]) { add(r, X, NOW + 10); add(r, X, NOW + 70_000); }
  add(RA, RB, NOW + 80_000); add(RB, RA, NOW + 90_000);
  assert(c.counters.sends <= 24);
  assert(Math.max(...Object.values(c.counters.pairs)) <= 6);
  assert.deepEqual([...POLICY_CODES].sort(), ["CHAIN_BUDGET", "CHAIN_EXPIRED", "DEPTH", "FANOUT", "LEAF", "MEMBERS", "PAIR_BUDGET", "QUEUE_FULL", "RATE", "REPLY_TO_REQUESTER", "WAIT_CYCLE"]);
});
