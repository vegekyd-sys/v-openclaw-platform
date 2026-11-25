import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { coreVersion, loadCore, PLUGIN_DIR } from "../core-loader.js";
import { Manager } from "../core/manager.js";
import { Store } from "../core/store.js";

// Hot reload (2026-11-25, Tianyi: fixes to the meeting bridge should not need a Gateway restart).
const MID = "7712088935581732076";
const GROUP = { channel: "feishu", to: "oc_test_group", accountId: "default" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3_000) => {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error("condition not reached"); await sleep(5); }
};
let seq = 0;
const speech = (text) => ({
  event_id: `r${++seq}`, event_type: "transcript_received", event_time: new Date().toISOString(),
  payload: { transcript_received_items: [{ text, speaker: { id: "ou_user", user_name: "Tianyi" }, start_time_ms: new Date(Date.now() - 2_000).toISOString(), end_time_ms: new Date().toISOString() }] },
});

function world({ turnDelayMs = 0 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vmb-reload-"));
  const w = {
    tmp, queue: [], sent: [], group: [], turns: [], tokens: [],
    lark: {
      async join() { return { meetingId: MID }; },
      async events(_mid, token) { w.tokens.push(token); const batch = w.queue.splice(0); return { events: batch, pageToken: batch.length ? `p${seq}` : token }; },
      async sendText(_mid, text) { w.sent.push(text); return { messageId: `s${w.sent.length}` }; },
      async react() {}, async leave() {},
    },
    async runTurn({ message }) {
      w.turns.push(message);
      if (turnDelayMs) await sleep(turnDelayMs);
      return { status: "ok", text: `答：${/Tianyi：(.*)$/mu.exec(message)?.[1] ?? "?"}` };
    },
    async postGroup(_d, text) { w.group.push(text); },
  };
  return w;
}
const manager = (w, mod = { Manager, Store }) => new mod.Manager({
  store: new mod.Store(path.join(w.tmp, "store")), lark: w.lark, runTurn: (p) => w.runTurn(p), postGroup: (d, t) => w.postGroup(d, t), timing: { pollMs: 10, progressReactMs: 0, stillWorkingMs: 0 },
});

test("handoff waits for the running turn, then another core resumes the meeting where it stopped", async () => {
  const w = world({ turnDelayMs: 150 });
  await new Store(path.join(w.tmp, "store")).init();
  const a = manager(w);
  await a.start({ meetingNumber: "396976582", sessionKey: "sk", delivery: GROUP, workspaceDir: w.tmp });
  w.queue.push(speech("第一句"));
  await until(() => w.turns.length === 1);
  const handed = await a.handoff();
  assert.equal(handed, 1);
  assert.equal(w.sent.length, 1, "the turn that was running finished and was sent before the handover");
  assert.equal(a.list().length, 0);
  const turnsBefore = w.turns.length;
  const pollsBefore = w.tokens.length;
  await sleep(60);
  assert.equal(w.tokens.length, pollsBefore, "the old core stopped polling");

  const b = manager(w);
  assert.equal(await b.recover(), 1);
  w.queue.push(speech("第二句"));
  await until(() => w.sent.length === 2);
  assert.equal(w.turns.length, turnsBefore + 1, "no turn ran twice");
  assert.match(w.turns.at(-1), /第二句/u);
  assert.doesNotMatch(w.turns.at(-1), /第一句/u);
  await b.shutdown();
});

test("handoff gives up after its timeout and the current core keeps listening", async () => {
  const w = world({ turnDelayMs: 300 });
  await new Store(path.join(w.tmp, "store")).init();
  const a = manager(w);
  await a.start({ meetingNumber: "396976582", sessionKey: "sk", delivery: GROUP, workspaceDir: w.tmp });
  w.queue.push(speech("慢的一轮"));
  await until(() => w.turns.length === 1);
  await assert.rejects(a.handoff({ timeoutMs: 50 }), /not idle within/u);
  assert.equal(a.list().length, 1);
  await until(() => w.sent.length === 1);
  w.queue.push(speech("之后的一句"));
  await until(() => w.sent.length === 2);
  assert.match(w.turns.at(-1), /之后的一句/u);
  await a.shutdown();
});

test("handoff refuses while a meeting is writing its brief", async () => {
  const w = world({ turnDelayMs: 200 });
  await new Store(path.join(w.tmp, "store")).init();
  const a = manager(w);
  await a.start({ meetingNumber: "396976582", sessionKey: "sk", delivery: GROUP, workspaceDir: w.tmp });
  w.queue.push(speech("最后一句"));
  await until(() => w.turns.length === 1);
  a.stop({ sessionKey: "sk" });
  await assert.rejects(a.handoff(), /wrapping up/u);
  await a.shutdown();
});

test("loadCore: same files load once; changed files get a new version with fresh module instances", async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "vmb-core-"));
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "vmb-src-"));
  for (const f of fs.readdirSync(path.join(PLUGIN_DIR, "core"))) fs.copyFileSync(path.join(PLUGIN_DIR, "core", f), path.join(src, f));
  const one = await loadCore(state, { srcDir: src });
  const again = await loadCore(state, { srcDir: src });
  assert.equal(again.version, one.version);
  assert.equal(again.manager.Manager, one.manager.Manager, "unchanged core is not imported twice");
  assert.equal(typeof one.store.Store, "function");
  assert.equal(one.bridge.DEFAULT_TIMING.pollMs, 2_000);

  fs.appendFileSync(path.join(src, "bridge.js"), "\nexport const RELOAD_MARK = 2;\n");
  const two = await loadCore(state, { srcDir: src });
  assert.notEqual(two.version, one.version);
  assert.equal(two.bridge.RELOAD_MARK, 2);
  assert.notEqual(two.manager.Manager, one.manager.Manager, "the new manager comes with its own bridge.js");
  assert.equal((await coreVersion(src)).version, two.version);

  // The loaded copy of the real core runs a meeting end to end.
  const w = world();
  await new two.store.Store(path.join(w.tmp, "store")).init();
  const m = manager(w, { Manager: two.manager.Manager, Store: two.store.Store });
  await m.start({ meetingNumber: "396976582", sessionKey: "sk", delivery: GROUP, workspaceDir: w.tmp });
  w.queue.push(speech("新代码"));
  await until(() => w.sent.length === 1);
  await m.shutdown();
});
