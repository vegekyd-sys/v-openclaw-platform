import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { patchProductionWorkerForVolcengineRtcAgent } from "./patch-volcengine-rtc-agent-provider.mjs";
import {
  patchVolcengineRtcManagedRoomHarness,
  patchVolcengineRtcManagedRoomTalk,
} from "./patch-volcengine-rtc-managed-room-core.mjs";
import { patchVolcengineRtcManagedRoomUi } from "./patch-volcengine-rtc-managed-room-ui.mjs";

async function fixture(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("9.1 Control UI gains the managed-room adapter exactly once", async () => {
  const source = await fixture("./release-files/talk-input-stall/control-ui-boot-chat-DWTSrxxk.js");
  const patched = patchVolcengineRtcManagedRoomUi(source);
  assert.notEqual(patched, source);
  assert.match(patched, /volcengine-rtc-managed-room-client\.js/u);
  assert.match(patched, /openclaw_agent_consult/u);
  assert.doesNotMatch(patched, /Managed-room realtime Talk sessions are not available/u);
  assert.equal(patchVolcengineRtcManagedRoomUi(patched), patched);
});

test("9.1 Talk server accepts managed-room and plugin cancellation", async () => {
  const talk = await fixture("./release-files/talk-consult-model/talk-DkFuKRod.js");
  const patchedTalk = patchVolcengineRtcManagedRoomTalk(talk);
  assert.notEqual(patchedTalk, talk);
  assert.match(patchedTalk, /session\.transport === "managed-room"/u);
  assert.equal(patchVolcengineRtcManagedRoomTalk(patchedTalk), patchedTalk);

  const harness = await fixture(
    "./release-files/talk-session-model-inheritance/realtime-session-harness-CEO5kVAJ.js",
  );
  const patchedHarness = patchVolcengineRtcManagedRoomHarness(harness);
  assert.notEqual(patchedHarness, harness);
  assert.match(patchedHarness, /params\.provider\.cancelBrowserSession/u);
  assert.equal(patchVolcengineRtcManagedRoomHarness(patchedHarness), patchedHarness);
});

test("9.1 production worker registers the RTC Agent provider exactly once", async () => {
  const worker = await fixture("./release-files/seeduplex-voice-provider/production-worker-index.mjs");
  const patched = patchProductionWorkerForVolcengineRtcAgent(worker);
  assert.notEqual(patched, worker);
  assert.match(patched, /buildVolcengineRtcAgentProvider/u);
  assert.equal(patchProductionWorkerForVolcengineRtcAgent(patched), patched);
});

test("all patchers refuse unknown release drift", () => {
  assert.throws(() => patchVolcengineRtcManagedRoomUi("unknown"), /drifted/u);
  assert.throws(() => patchVolcengineRtcManagedRoomTalk("unknown"), /drifted/u);
  assert.throws(() => patchVolcengineRtcManagedRoomHarness("unknown"), /drifted/u);
  assert.throws(() => patchProductionWorkerForVolcengineRtcAgent("unknown"), /drift/u);
});
