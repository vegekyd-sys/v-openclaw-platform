import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  patchFeishuDmPendingDeliveryNoticePresentation,
  patchPendingDeliveryNoticeRace,
} from "../scripts/patch-dm-delivery-notice-race.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const beforePredicate =
  'const owedNotice = settled === "unknown" && (current === "queued" || current === "unknown") && pending.context';
const afterPredicate =
  'const owedNotice = settled === "unknown" && current === "unknown" && pending.context';

test("pre-dispatch queued to unknown does not create user-visible notice debt", () => {
  const fixture = `
function owesNotice(current, settled, pending) {
  ${beforePredicate} && pending.intentId;
  return Boolean(owedNotice);
}`;
  const patched = patchPendingDeliveryNoticeRace(fixture);
  assert.equal(patched.changed, true);
  assert.doesNotMatch(patched.source, /current === "queued" \|\|/);
  const runtime = new Function(`${patched.source}; return { owesNotice };`)();
  const pending = { context: { channel: "feishu" }, intentId: "intent-1" };
  assert.equal(runtime.owesNotice("queued", "unknown", pending), false);
  assert.equal(runtime.owesNotice("unknown", "unknown", pending), true);
  assert.equal(runtime.owesNotice("queued", "delivered", pending), false);
});

test("patch is exact and idempotent", () => {
  const fixture = `prefix; ${beforePredicate}; suffix;`;
  const first = patchPendingDeliveryNoticeRace(fixture);
  assert.equal(first.changed, true);
  assert.match(first.source, new RegExp(afterPredicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const second = patchPendingDeliveryNoticeRace(first.source);
  assert.equal(second.changed, false);
  assert.equal(second.source, first.source);
  assert.throws(
    () => patchPendingDeliveryNoticeRace("unrelated source"),
    /expected exactly one pending-delivery notice predicate/,
  );
});

test("Feishu DM keeps terminal ambiguity internal while other routes retain the notice", () => {
  const fixture = `
async function deliverPendingDeliveryNotice(entry, notice, context) {
\tconst idempotencyKey = noticeId(notice.intentId);
\tlet delivered;
  delivered = await sendRecoveryNotice({ text: "implementation detail" });
  return { delivered, idempotencyKey };
}`;
  const patched = patchFeishuDmPendingDeliveryNoticePresentation(fixture);
  assert.equal(patched.changed, true);
  assert.match(patched.source, /context\.channel === "feishu"/);
  assert.match(patched.source, /context\.to\.startsWith\("user:"\)/);
  assert.match(patched.source, /state: "unresolved"/);
  assert.match(patched.source, /sendRecoveryNotice/);
  const second = patchFeishuDmPendingDeliveryNoticePresentation(patched.source);
  assert.equal(second.changed, false);
});

test("generated release file contains only the terminal-ambiguity predicate", () => {
  const source = fs.readFileSync(
    path.join(root, "lab/release-files/dm-delivery-notice-delivery-completion-Do3nBV6b.js"),
    "utf8",
  );
  assert.equal(source.split(afterPredicate).length - 1, 1);
  assert.equal(source.split(beforePredicate).length - 1, 0);
  assert.match(source, /current === "unknown" && state === "unknown" \? current : state/);
});

test("generated lifecycle keeps Feishu DM uncertainty internal without changing other routes", () => {
  const source = fs.readFileSync(
    path.join(root, "lab/release-files/dm-delivery-notice-lifecycle-YRwzpo9_.js"),
    "utf8",
  );
  assert.equal(source.split('context.channel === "feishu"').length - 1, 1);
  assert.equal(source.split('context.to.startsWith("user:")').length - 1, 1);
  assert.match(source, /state: "unresolved"/);
  assert.equal(source.split("runtime.sendRecoveryNotice").length - 1, 1);
});

test("generated delivery state machine reproduces and closes the live overlap", async () => {
  const source = fs.readFileSync(
    path.join(root, "lab/release-files/dm-delivery-notice-delivery-completion-Do3nBV6b.js"),
    "utf8",
  );
  const start = source.indexOf("async function settlePendingFinalDelivery(");
  const end = source.indexOf("function readPlatformMessageId(", start);
  assert.ok(start >= 0 && end > start);
  const functionSource = source.slice(start, end);
  let entry;
  const updateSessionEntry = async (_identity, mutate) => {
    const patch = mutate(entry);
    if (patch) {
      entry = { ...entry, ...patch };
    }
  };
  const settle = new Function(
    "updateSessionEntry",
    `${functionSource}; return settlePendingFinalDelivery;`,
  )(updateSessionEntry);
  const completion = {
    sessionId: "session-1",
    sessionKey: "agent:makaron:feishu:direct:user-1",
    storePath: "/unused",
    intentId: "intent-1",
    deliveryId: "delivery-1",
  };
  const freshEntry = () => ({
    sessionId: completion.sessionId,
    status: "done",
    pendingFinalDelivery: {
      intentId: completion.intentId,
      createdAt: 100,
      context: { channel: "feishu", to: "user:user-1" },
      deliveries: [{ id: completion.deliveryId, state: "queued" }],
    },
  });

  entry = freshEntry();
  await settle(completion, "unknown", ["prepared", "queued"]);
  assert.equal(entry.pendingFinalDelivery.deliveries[0].state, "unknown");
  assert.equal(entry.pendingDeliveryNotice, undefined);
  await settle(completion, "delivered");
  assert.equal(entry.pendingFinalDelivery.deliveries[0].state, "delivered");
  assert.equal(entry.pendingDeliveryNotice, undefined);

  entry = freshEntry();
  await settle(completion, "unknown", ["prepared", "queued"]);
  await settle(completion, "unknown", ["unknown"]);
  assert.equal(entry.pendingDeliveryNotice.state, "owed");
});

test("generated Feishu-DM handler records a real ambiguity without sending it", async () => {
  const source = fs.readFileSync(
    path.join(root, "lab/release-files/dm-delivery-notice-lifecycle-YRwzpo9_.js"),
    "utf8",
  );
  const start = source.indexOf("async function deliverPendingDeliveryNotice(");
  const end = source.indexOf("//#endregion", start);
  assert.ok(start >= 0 && end > start);
  const functionSource = source.slice(start, end);
  let entry = {
    sessionId: "session-1",
    pendingDeliveryNotice: {
      intentId: "intent-1",
      state: "owed",
      context: { channel: "feishu", to: "user:user-1" },
    },
  };
  let sendCalls = 0;
  let transcriptCalls = 0;
  const runtime = {
    sendRecoveryNotice: async () => {
      sendCalls += 1;
      return { suppressed: false };
    },
  };
  const updateSessionEntry = async (_identity, mutate) => {
    const patch = mutate(entry);
    if (patch) {
      entry = { ...entry, ...patch };
    }
  };
  const deliver = new Function(
    "loadSessionEntryReadOnly",
    "normalizeDeliveryContext",
    "getGatewayRecoveryRuntime",
    "deliveryContextKey",
    "deliveryContextFromSession",
    "updateSessionEntry",
    "appendAssistantMessageToSessionTranscript",
    "findDeliveryIntentOwner",
    "noticeId",
    `${functionSource}; return deliverPendingDeliveryNotice;`,
  )(
    () => entry,
    (value) => value,
    () => runtime,
    (value) => `${value.channel}|${value.to}`,
    () => entry.pendingDeliveryNotice.context,
    updateSessionEntry,
    async () => {
      transcriptCalls += 1;
      return { ok: true };
    },
    () => null,
    (intentId) => `notice:${intentId}`,
  );
  await deliver("agent:makaron:feishu:direct:user-1", "/unused");
  assert.equal(sendCalls, 0);
  assert.equal(transcriptCalls, 0);
  assert.equal(entry.pendingDeliveryNotice.state, "unresolved");
});
