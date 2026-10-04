// Candidate test for lab/release-files/loopback-requester-sender: the MCP loopback
// (claude-cli) tool surface must carry the channel sender as requesterSenderId, so the
// shared-Cron principal is formed exactly as on the embedded/worker and Codex paths.
// Observable without a model turn: for a non-owner sender, the `automations` tool is
// only exposed when that principal exists (agent-tools sharedCronManagementToolAvailable).
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const chunk = fs.readdirSync(dist).find((f) => /^tool-resolution-[\w-]+\.js$/u.test(f));
assert(chunk, "tool-resolution chunk not found");
const patched = fs.readFileSync(path.join(dist, chunk), "utf8").includes("v-loopback-requester-sender-v1");

const policyDir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-shared-"));
const policyFile = path.join(policyDir, "policy.json");
fs.writeFileSync(policyFile, JSON.stringify({ version: 1, agents: { makaron: { mode: "shared", enabled: true } } }));
process.env.OPENCLAW_CRON_SHARED_POLICY = policyFile;

const { t: resolveGatewayScopedTools } = await import(path.join(dist, chunk));

const cfg = { agents: { list: [{ id: "makaron", default: true }, { id: "short-v" }] } };
function names(overrides) {
  const r = resolveGatewayScopedTools({
    cfg,
    surface: "loopback",
    sessionKey: "agent:makaron:feishu:group:oc_candidate_scope",
    agentId: "makaron",
    messageProvider: "feishu",
    accountId: "default",
    senderIsOwner: false,
    ...overrides,
  });
  return (r.toolSchema ?? r.tools).map((t) => t.name);
}

test(`patched chunk present: ${patched}`, () => {
  assert.equal(patched, process.env.LOOPBACK_SENDER_EXPECT !== "absent", "patch state does not match the expectation");
});

test("non-owner Feishu sender on the loopback: shared Cron tool follows the sender principal", () => {
  const withSender = names({ channelContext: { sender: { id: "ou_candidate_sender" }, chat: { id: "oc_candidate_scope" } } });
  assert.equal(withSender.includes("automations"), patched, `automations visible=${withSender.includes("automations")} tools=${withSender.length}`);
});

test("no sender id: no principal, shared Cron tool stays hidden (never guessed)", () => {
  const noSender = names({ channelContext: { chat: { id: "oc_candidate_scope" } } });
  assert.equal(noSender.includes("automations"), false);
});

test("CLI-originated loopback turns never get a shared Cron principal", () => {
  const cli = names({ messageProvider: "cli", channelContext: { sender: { id: "ou_candidate_sender" } } });
  assert.equal(cli.includes("automations"), false);
});

test("agent outside the shared Cron policy: non-owner still gets no automations", () => {
  const other = names({
    sessionKey: "agent:short-v:feishu:group:oc_candidate_scope",
    agentId: "short-v",
    channelContext: { sender: { id: "ou_candidate_sender" } },
  });
  assert.equal(other.includes("automations"), false);
});

test("owner surface unchanged", () => {
  const owner = names({ senderIsOwner: true, channelContext: { sender: { id: "ou_candidate_owner" } } });
  assert.equal(owner.includes("automations"), true);
});

test("other owner-only tools stay denied for non-owners", () => {
  const withSender = names({ channelContext: { sender: { id: "ou_candidate_sender" } } });
  for (const name of ["gateway", "sessions"]) assert.equal(withSender.includes(name), false, name);
});

