import assert from "node:assert/strict";
import { test } from "node:test";
import { decideToolCall } from "../core/policy.js";
import { isControlAnywhereActor, isTrustedDirectSession, resolveTrustedActor } from "../core/identity.js";
import { deliverPrivately } from "../core/deliver.js";
import { HandoffAdminClient } from "../core/admin-client.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("policy: nothing is blocked while nobody controls the desktop", () => {
  assert.equal(decideToolCall({ toolName: "browser", params: { action: "act" }, controlActive: false }), undefined);
  assert.equal(decideToolCall({ toolName: "exec", params: {}, controlActive: true }), undefined);
});

test("policy: while a human controls, browser writes are blocked and reads allowed", () => {
  for (const action of ["act", "open", "navigate", "close", "focus", "stop", "upload", undefined]) {
    const decision = decideToolCall({ toolName: "browser", params: { action }, controlActive: true });
    assert.equal(decision?.block, true, `${action} must be blocked`);
    assert.match(decision.blockReason, /handoff/u);
  }
  for (const action of ["status", "tabs", "snapshot", "screenshot"]) {
    assert.equal(decideToolCall({ toolName: "browser", params: { action }, controlActive: true }), undefined, `${action} stays allowed`);
  }
  assert.equal(decideToolCall({ toolName: "computer", params: { action: "left_click" }, controlActive: true }).block, true);
  assert.equal(decideToolCall({ toolName: "computer", params: { action: "screenshot" }, controlActive: true }), undefined);
});

test("identity: channel sender wins, CLI falls back to the configured actor, direct detection", () => {
  assert.equal(resolveTrustedActor({ requesterSenderId: "ou_1", messageChannel: "feishu" }), "feishu:ou_1");
  assert.equal(resolveTrustedActor({ requesterSenderId: "ou_1", messageChannel: "feishu" }, { principalAliases: { "feishu:ou_1": "tianyi" } }), "tianyi");
  assert.equal(resolveTrustedActor({ oneShotCliRun: true }), null);
  assert.equal(resolveTrustedActor({ oneShotCliRun: true }, { cliActorUserId: "cli:tianyi" }), "cli:tianyi");
  assert.equal(isTrustedDirectSession({ sessionKey: "agent:makaron:feishu:direct:ou_1" }), true);
  assert.equal(isTrustedDirectSession({ sessionKey: "agent:makaron:feishu:group:oc_1" }), false);
  assert.equal(isTrustedDirectSession({ oneShotCliRun: true, sessionKey: "agent:makaron:feishu:direct:x" }), false);
  assert.equal(isTrustedDirectSession({ oneShotCliRun: true }, { trustCliAsDirect: true }), true);
});

test("admin client: bearer from file, state cached for 2 s, errors surface", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-plugin-"));
  const tokenFile = path.join(dir, "token");
  fs.writeFileSync(tokenFile, "abc\n");
  const calls = [];
  let now = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization, method: init.method });
    if (url.endsWith("/v1/state")) {
      return { ok: true, status: 200, json: async () => ({ controlActive: true }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
  };
  const client = new HandoffAdminClient({ baseUrl: "http://h/", adminTokenFile: tokenFile, fetchImpl, now: () => now });
  assert.equal((await client.state()).controlActive, true);
  await client.state();
  assert.equal(calls.length, 1, "second read within 2 s served from cache");
  now = 3_000;
  await client.state();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer abc");
  assert.equal(calls[0].url, "http://h/v1/state");
  await assert.rejects(client.status("h_x"), /404: not_found/u);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("owner list: only listed canonical actors may control from a group", () => {
  const config = { controlAnywhereActors: ["feishu:ou_owner"] };
  assert.equal(isControlAnywhereActor("feishu:ou_owner", config), true);
  assert.equal(isControlAnywhereActor("feishu:ou_other", config), false);
  assert.equal(isControlAnywhereActor("feishu:ou_owner", {}), false);
  assert.equal(isControlAnywhereActor(resolveTrustedActor({ requesterSenderId: "ou_owner", messageChannel: "feishu" }), config), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-owners-"));
  const file = path.join(dir, "owners");
  assert.equal(isControlAnywhereActor("feishu:ou_late", { controlAnywhereActorsFile: file }), false, "missing file adds nobody");
  fs.writeFileSync(file, "# owners\nfeishu:ou_late   # added without restart\n\n");
  assert.equal(isControlAnywhereActor("feishu:ou_late", { controlAnywhereActorsFile: file }), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("private delivery goes through `openclaw message send` to the requester, never without a target", async () => {
  const calls = [];
  const runner = async (command, args) => { calls.push({ command, args }); return "{\"messageId\":\"m1\"}"; };
  await deliverPrivately({ channel: "feishu", target: "ou_owner", text: "link", command: "openclaw", runner });
  assert.equal(calls[0].command, "openclaw");
  assert.deepEqual(calls[0].args.slice(0, 6), ["message", "send", "--channel", "feishu", "--target", "ou_owner"]);
  await assert.rejects(deliverPrivately({ channel: "feishu", target: "", text: "x", runner }), /requester id/u);
  await deliverPrivately({ channel: "feishu", target: "ou_owner", text: "link", entry: "/rt/dist/index.js", runner });
  assert.equal(calls[1].command, process.execPath);
  assert.equal(calls[1].args[0], "/rt/dist/index.js");
});
