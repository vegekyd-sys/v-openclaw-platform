import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  patchFeishuPendingDeliveryNoticePresentation,
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

test("all Feishu chats keep terminal ambiguity internal while other channels retain the notice", () => {
  const fixture = `
async function deliverPendingDeliveryNotice(entry, notice, context) {
\tconst idempotencyKey = noticeId(notice.intentId);
\tlet delivered;
  delivered = await sendRecoveryNotice({ text: "implementation detail" });
  return { delivered, idempotencyKey };
}`;
  const patched = patchFeishuPendingDeliveryNoticePresentation(fixture);
  assert.equal(patched.changed, true);
  assert.match(patched.source, /context\.channel === "feishu"/);
  assert.doesNotMatch(patched.source, /context\.to\.startsWith\("user:"\)/);
  assert.match(patched.source, /state: "unresolved"/);
  assert.match(patched.source, /sendRecoveryNotice/);
  const second = patchFeishuPendingDeliveryNoticePresentation(patched.source);
  assert.equal(second.changed, false);

  const v1Source = patched.source
    .replace(
      "\t// Feishu users in direct messages and groups must not receive an\n" +
        "\t// implementation-level delivery-uncertainty sentence. Preserve the\n" +
        "\t// ambiguity in session state for diagnostics, but settle the one-shot debt\n" +
        "\t// without external delivery.",
      "\t// Feishu direct-message users must not receive an implementation-level\n" +
        "\t// delivery-uncertainty sentence. Preserve the ambiguity in session state\n" +
        "\t// for diagnostics, but settle the one-shot debt without external delivery.",
    )
    .replace(
      'if (context.channel === "feishu")',
      'if (context.channel === "feishu" && context.to.startsWith("user:"))',
    );
  const upgraded = patchFeishuPendingDeliveryNoticePresentation(v1Source);
  assert.equal(upgraded.changed, true);
  assert.equal(upgraded.source, patched.source);
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

test("generated lifecycle keeps all Feishu uncertainty internal without changing other channels", () => {
  const source = fs.readFileSync(
    path.join(root, "lab/release-files/dm-delivery-notice-lifecycle-YRwzpo9_.js"),
    "utf8",
  );
  assert.equal(source.split('context.channel === "feishu"').length - 1, 1);
  assert.equal(source.split('context.to.startsWith("user:")').length - 1, 0);
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

test("generated handler hides Feishu DM and group ambiguity but preserves other channels", async () => {
  const source = fs.readFileSync(
    path.join(root, "lab/release-files/dm-delivery-notice-lifecycle-YRwzpo9_.js"),
    "utf8",
  );
  const start = source.indexOf("async function deliverPendingDeliveryNotice(");
  const end = source.indexOf("//#endregion", start);
  assert.ok(start >= 0 && end > start);
  const functionSource = source.slice(start, end);
  async function runCase(channel, to) {
    let entry = {
      sessionId: "session-1",
      pendingDeliveryNotice: {
        intentId: "intent-1",
        state: "owed",
        context: { channel, to },
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
      `const PENDING_DELIVERY_NOTICE = "implementation detail"; ${functionSource}; return deliverPendingDeliveryNotice;`,
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
    await deliver(`agent:makaron:${channel}:${to}`, "/unused");
    return { entry, sendCalls, transcriptCalls };
  }

  for (const to of ["user:user-1", "chat:oc_group-1"]) {
    const result = await runCase("feishu", to);
    assert.equal(result.sendCalls, 0, `unexpected Feishu send for ${to}`);
    assert.equal(result.transcriptCalls, 0, `unexpected Feishu transcript append for ${to}`);
    assert.equal(result.entry.pendingDeliveryNotice.state, "unresolved");
  }

  const other = await runCase("discord", "channel:channel-1");
  assert.equal(other.sendCalls, 1);
  assert.equal(other.transcriptCalls, 1);
  assert.equal(other.entry.pendingDeliveryNotice.state, "acknowledged");
});
