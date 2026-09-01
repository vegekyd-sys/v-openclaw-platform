import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewOutcomeCard, parseReviewArgs, replaceReviewCard } from "./review-command.js";

test("parses an exact one-time Night Shift review command", () => {
  assert.deepEqual(parseReviewArgs("approve abcdefghijklmnopqrstuvwxyz012345"), {
    action: "approve",
    token: "abcdefghijklmnopqrstuvwxyz012345",
  });
});

test("rejects unknown actions, short tokens, and trailing arguments", () => {
  assert.throws(() => parseReviewArgs("approve short"));
  assert.throws(() => parseReviewArgs("delete abcdefghijklmnopqrstuvwxyz012345"));
  assert.throws(() => parseReviewArgs("approve abcdefghijklmnopqrstuvwxyz012345 extra"));
});

test("builds terminal review cards without any repeatable actions", () => {
  for (const action of ["approve", "reject", "changes"]) {
    const card = buildReviewOutcomeCard({
      action,
      cardTitle: "Video 1 review",
      instanceId: "NS-1",
      instanceName: "Night Shift test",
    });
    assert.equal(card.schema, "2.0");
    assert.equal(card.header.template, action === "approve" ? "green" : action === "reject" ? "red" : "yellow");
    assert.equal(JSON.stringify(card).includes('"tag":"button"'), false);
  }
});

test("replaces the original Feishu card with Gateway account credentials", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ options, url: String(url) });
    if (calls.length === 1) return response({ code: 0, tenant_access_token: "tenant-token" });
    return response({ code: 0 });
  };
  const card = buildReviewOutcomeCard({ action: "approve", cardTitle: "Review", instanceId: "NS-1", instanceName: "Test" });
  await replaceReviewCard({
    accountId: "lab",
    card,
    config: { channels: { feishu: { accounts: { lab: { appId: "id", appSecret: "secret" } } } } },
    fetchImpl,
    messageId: "om_original",
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal");
  assert.equal(calls[1].url, "https://open.feishu.cn/open-apis/im/v1/messages/om_original");
  assert.equal(calls[1].options.method, "PATCH");
  assert.equal(calls[1].options.headers.Authorization, "Bearer tenant-token");
  assert.deepEqual(JSON.parse(calls[1].options.body), { content: JSON.stringify(card) });
});

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
