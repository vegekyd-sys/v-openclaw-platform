import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

import { FILE, MARKER, patchSessionsSendReplyOnce } from "../lab/release-files/sessions-send-reply-once/patch.mjs";

// The bytes V runs (captured 2026-10-20, unchanged since 2026-10-04); the patch must be generated from these, never
// from an upstream copy (release-artifact-rebase-trap).
const V_SOURCE = new URL(`../release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist/${FILE}`, import.meta.url);
const GENERATED = new URL(`../lab/release-files/sessions-send-reply-once/generated/${FILE}`, import.meta.url);

test("the committed file is exactly the patch of the bytes V runs", () => {
  const patched = patchSessionsSendReplyOnce(fs.readFileSync(V_SOURCE, "utf8"));
  assert.equal(patched, fs.readFileSync(GENERATED, "utf8"));
  execFileSync(process.execPath, ["--check", GENERATED.pathname]);
});

test("replies come back once, after the target run is terminal, with no ping-pong or announce", () => {
  const patched = fs.readFileSync(GENERATED, "utf8");
  const flow = patched.slice(patched.indexOf("async function runSessionsSendA2AFlow(params) {"), patched.indexOf("//#region src/agents/tools/sessions-send-tool.ts"));
  assert.match(flow, new RegExp(MARKER));
  assert.doesNotMatch(flow, /maxPingPongTurns|buildAgentToAgentReplyContext|buildAgentToAgentAnnounceContext/u, "the invisible ping-pong and the announce step are gone");
  assert.match(flow, /Math\.min\(6e4, deadline - Date\.now\(\)\)/u, "waits in slices until the deadline, not a single 30 s wait");
  assert.match(flow, /const SESSIONS_SEND_REPLY_MAX_WAIT_MS = 6 \* 36e5;/u);
  assert.match(flow, /if \(inline \|\| !params\.requesterSessionKey\) return;/u, "an inline reply was already the tool result");
  assert.match(flow, /idempotencyKey: `sessions-send-result:\$\{runContextId\}`/u, "the requester's turn has a predictable run id");
  assert.match(flow, /Another session returned the result of your earlier sessions_send request\./u);
  assert.match(patched, /const stepIdem = params\.idempotencyKey \?\? crypto\.randomUUID\(\);/u);
});

test("both turns are posted natively in their own chats", () => {
  const patched = fs.readFileSync(GENERATED, "utf8");
  const tool = patched.slice(patched.indexOf("//#region src/agents/tools/sessions-send-tool.ts"));
  const sendParams = tool.slice(tool.indexOf("const sendParams = {"), tool.indexOf("const maxPingPongTurns"));
  assert.match(sendParams, /deliver: true,\n\t+bestEffortDeliver: true,\n\t+sourceReplyDeliveryMode: "automatic",/u, "the target's turn is delivered to its own chat");
  assert.doesNotMatch(sendParams, /INTERNAL_MESSAGE_CHANNEL/u, "the target's turn is no longer pinned to the internal channel");
  const step = patched.slice(patched.indexOf("async function runAgentStep(params) {"), patched.indexOf("async function runSessionsSendA2AFlow(params) {"));
  assert.match(step, /\.\.\.params\.deliver === true \? \{\n\t+deliver: true,\n\t+bestEffortDeliver: true,\n\t+sourceReplyDeliveryMode: "automatic"/u);
  assert.match(step, /\} : \{\n\t+deliver: false,\n\t+sourceReplyDeliveryMode: "message_tool_only",\n\t+channel\n/u, "other agent steps keep the upstream behaviour");
  const flow = patched.slice(patched.indexOf("async function runSessionsSendA2AFlow(params) {"), patched.indexOf("//#region src/agents/tools/sessions-send-tool.ts"));
  assert.equal(flow.match(/deliver: true/gu)?.length, 2, "the wake-up turn and the failure notice are both delivered");
});

test("patching twice or a changed file is refused", () => {
  assert.throws(() => patchSessionsSendReplyOnce(fs.readFileSync(GENERATED, "utf8")), /already patched/u);
  assert.throws(() => patchSessionsSendReplyOnce("async function other() {}"), /expected exactly one anchor/u);
});
