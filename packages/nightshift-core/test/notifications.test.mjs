import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  compileWorkflow,
  loadWorkflow,
  NightShiftNotificationCoordinator,
  NightShiftStore,
  OpenClawFeishuNotificationSender,
} from "../src/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "../../../examples/workflows/xingqing-content-delivery.workflow.md");

test("notifies the creating Feishu conversation once and authorizes only the assigned reviewer", async () => {
  const source = await readFile(fixture, "utf8");
  const release = compileWorkflow(await loadWorkflow(fixture));
  const store = new NightShiftStore();
  store.saveRelease(release, source);
  store.createInstance({
    id: "NS-NOTIFY-1",
    name: "Notification test",
    workflowSha256: release.metadata.workflowSha256,
    collaboration: {
      createdByOpenId: "ou_creator",
      sourceChatId: "oc_source",
      reviewers: ["ou_reviewer"],
    },
  });
  const sent = [];
  const now = new Date();
  const coordinator = new NightShiftNotificationCoordinator({
    baseUrl: "https://nightshift.example.test",
    now: () => now,
    sender: { send: async (delivery) => { sent.push(delivery); return { messageId: `om_${sent.length}` }; } },
    store,
  });
  const ready = card("ready");
  const bootstrapped = await coordinator.reconcile({ cards: [ready], instances: store.listInstances(), releases: store.listReleases() });
  assert.equal(bootstrapped.bootstrapped, true);
  assert.equal(sent.length, 0);

  const review = card("review");
  const first = await coordinator.reconcile({ cards: [review], instances: store.listInstances(), releases: store.listReleases() });
  assert.equal(first.queued.length, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].targetChatId, "oc_source");
  assert.deepEqual(sent[0].allowedOpenIds, ["ou_reviewer"]);
  const buttons = sent[0].presentation.blocks.find((block) => block.type === "buttons").buttons;
  assert.deepEqual(buttons.map((button) => button.label), ["通过", "拒绝", "打开 Night Shift"]);
  const command = buttons[0].action.command;
  const token = command.split(" ").at(-1);
  assert.throws(() => store.authorizeNotificationDecision(token, "ou_creator"), /not an assigned reviewer/);
  assert.equal(store.authorizeNotificationDecision(token, "ou_reviewer").cardId, "card-review-1");
  store.completeNotificationDecision(token, { message: "done", ok: true });
  assert.equal(store.authorizeNotificationDecision(token, "ou_reviewer").alreadyUsed, true);

  await coordinator.reconcile({ cards: [review], instances: store.listInstances(), releases: store.listReleases() });
  assert.equal(sent.length, 1);
  store.close();
});

test("sends one completion summary after an instance becomes done", async () => {
  const source = await readFile(fixture, "utf8");
  const release = compileWorkflow(await loadWorkflow(fixture));
  const store = new NightShiftStore();
  store.saveRelease(release, source);
  store.createInstance({
    id: "NS-NOTIFY-DONE",
    name: "Completion test",
    workflowSha256: release.metadata.workflowSha256,
    collaboration: { createdByOpenId: "ou_creator", sourceChatId: "oc_source" },
  });
  const sent = [];
  const coordinator = new NightShiftNotificationCoordinator({
    baseUrl: "https://nightshift.example.test",
    sender: { send: async (delivery) => { sent.push(delivery); return { messageId: "om_done" }; } },
    store,
  });
  await coordinator.reconcile({ cards: [card("ready", "NS-NOTIFY-DONE")], instances: store.listInstances(), releases: store.listReleases() });
  store.updateInstanceStatus("NS-NOTIFY-DONE", "done");
  await coordinator.reconcile({ cards: [card("done", "NS-NOTIFY-DONE")], instances: store.listInstances(), releases: store.listReleases() });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, "instance-completed");
  assert.equal(sent[0].presentation.tone, "success");
  await coordinator.reconcile({ cards: [card("done", "NS-NOTIFY-DONE")], instances: store.listInstances(), releases: store.listReleases() });
  assert.equal(sent.length, 1);
  store.close();
});

test("renders a portable OpenClaw Feishu presentation command", async () => {
  let invocation;
  const sender = new OpenClawFeishuNotificationSender({
    accountId: "lab",
    command: "node",
    configPath: "/tmp/openclaw.json",
    entry: "/opt/openclaw/index.js",
    runner: async (command, args, env) => {
      invocation = { args, command, env };
      return JSON.stringify({ messageId: "om_test" });
    },
  });
  const result = await sender.send({
    fallbackText: "fallback",
    presentation: { blocks: [], title: "test", tone: "warning" },
    targetChatId: "oc_source",
  });
  assert.equal(result.messageId, "om_test");
  assert.deepEqual(invocation.args.slice(0, 5), ["/opt/openclaw/index.js", "message", "send", "--channel", "feishu"]);
  assert.ok(invocation.args.includes("--presentation"));
  assert.equal(invocation.env.OPENCLAW_CONFIG_PATH, "/tmp/openclaw.json");
});

function card(status, instanceId = "NS-NOTIFY-1") {
  return {
    id: "card-review-1",
    labels: [`instance:${instanceId}`, "stage:review", "content-item:item-1"],
    metadata: { automation: { instanceId, stageId: "review" } },
    status,
    title: "Video 1 review",
  };
}
