// Runs the real media completion functions from V's captured 2026.9.1 bundle in a
// VM. The Worker has no session delivery runtime, so its local durable enqueue
// always reports session_queued; only the Gateway can schedule and drain it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createWorkerGatewayEventRouter as createFixedRouter } from "../experiments/agent-worker-isolation-v1/worker-gateway-events.mjs";
import { createWorkerGatewayEventRouter as createV0211Router } from "../release/captured/v2026.9.1-db91.6-feishu-model-20260924.worker/dist/worker-gateway-events.mjs";
import { patchOpenClawMediaCompletionBundle } from "../scripts/patch-openclaw-media-completion-relay.mjs";

const V_BUNDLE = new URL(
  "../release/captured/v2026.9.1-db91.6-feishu-model-20260924/dist/openclaw-tools-BODVdJQD.js",
  import.meta.url,
);
const V_BUNDLE_SHA256 = "b20468a24be539da4f7618ac1d82cc4c6708ba0dcee3f1e178f2a719c00e3527";
const BRIDGE = Symbol.for("versa.vlab-worker.gateway-event-bridge-v1");
const original = fs.readFileSync(V_BUNDLE, "utf8");

function segment(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `segment ${start}`);
  return source.slice(a, b);
}

function mediaCompletionModule(source) {
  return [
    segment(source, "const MEDIA_GENERATION_COMPLETION_HANDOFF_RETRY_DELAYS_MS", "/** Returns whether"),
    segment(source, "function waitForMediaGenerationCompletionHandoffRetry(delayMs)", "function touchMediaGenerationTaskRunContext(handle)"),
    segment(source, "function scheduleMediaGenerationTaskCompletion(params)", "async function wakeMediaGenerationTaskCompletion(params)"),
    segment(source, "async function wakeMediaGenerationTaskCompletion(params)", "function createMediaGenerationTaskLifecycle(params)"),
  ].join("\n");
}

// A Gateway whose durable queue drains the entry a few seconds after enqueue.
function simulatedGateway({ drainAfterMs = 3_000, clock }) {
  const calls = [];
  let enqueuedAt;
  return {
    calls,
    async deliverMediaCompletion(payload) {
      calls.push(payload);
      enqueuedAt ??= clock.now;
      return clock.now - enqueuedAt >= drainAfterMs
        ? { delivered: true, path: "queued", disposition: "delivered" }
        : { delivered: false, path: "queued", disposition: "session_queued" };
    },
  };
}

async function runSuccessfulGeneration({ source, bridge, localDelivery }) {
  const clock = { now: 1_790_330_000_000 };
  const failures = [];
  const completed = [];
  let work;
  const context = vm.createContext({
    Date: { now: () => clock.now },
    setTimeout(fn, ms) {
      clock.now += ms;
      queueMicrotask(fn);
      return { unref() {} };
    },
    withMediaGenerationTaskKeepalive: async ({ run }) => await run(),
    formatErrorMessage: (error) => error.message,
    MEDIA_GENERATION_DELIVERING_COMPLETION_PROGRESS: "delivering",
    resolveRequiredCompletionDeliveryFailureTerminalResult: (reason) => ({ terminalOutcome: "failed", reason }),
    runWithoutOwnedSessionTranscriptWrites: async (fn) => await fn(),
    mediaUrlsFromGeneratedAttachments: (attachments) => (attachments ?? []).map((a) => a.url),
    formatAgentInternalEventsForPrompt: () => "internal completion event",
    buildMediaGenerationReplyInstruction: () => "reply instruction",
    INTERNAL_MESSAGE_CHANNEL: "internal",
    log$5: { warn() {}, error() {} },
    deliverSubagentAnnouncement: localDelivery,
  });
  if (bridge) context[BRIDGE] = bridge(clock);
  vm.runInContext(mediaCompletionModule(source), context);
  const handle = {
    taskId: "task-jc",
    runId: "tool:image_generate:run-jc",
    requesterSessionKey: "agent:makaron:feishu:direct:ou_fixture",
    requesterAgentId: "makaron",
    requesterOrigin: { channel: "feishu", to: "user:ou_fixture", accountId: "default" },
    taskLabel: "edit the photo",
  };
  const wake = (params) =>
    context.wakeMediaGenerationTaskCompletion({
      ...params,
      eventSource: "image_generation",
      announceType: "image generation task",
      toolName: "image_generate",
      completionLabel: "image",
    });
  context.scheduleMediaGenerationTaskCompletion({
    handle,
    toolName: "image_generate",
    progressSummary: "Generating image",
    scheduleBackgroundWork: (fn) => { work = fn; },
    onWakeFailure: (message, meta) => failures.push({ message, error: meta?.error?.message }),
    run: async () => ({
      provider: "fixture",
      model: "fixture-image",
      count: 1,
      wakeResult: "Generated 1 image.",
      attachments: [{ type: "image", url: "https://example.invalid/generated.png" }],
    }),
    lifecycle: {
      wakeTaskCompletion: wake,
      recordTaskProgress() {},
      completeTaskRun: (params) => completed.push(params.terminalResult),
      failTaskRun: () => assert.fail("generation must not fail"),
    },
  });
  const startedAt = clock.now;
  await work();
  return { failures, completed, elapsedMs: clock.now - startedAt };
}

const workerLocalQueue = () => ({ delivered: false, path: "queued", disposition: "session_queued" });

test("the pinned V bundle is the production file", () => {
  assert.equal(createHash("sha256").update(original).digest("hex"), V_BUNDLE_SHA256);
});

test("unpatched V bundle reproduces the production wake failure after 120 s", async () => {
  const result = await runSuccessfulGeneration({ source: original, localDelivery: workerLocalQueue });
  assert.deepEqual(result.failures.map((f) => f.message), [
    "image_generate completion wake failed after successful generation",
  ]);
  assert.match(result.failures[0].error, /handoff deadline/);
  assert(result.elapsedMs >= 120_000, `gave up after ${result.elapsedMs} ms`);
  assert.equal(result.completed[0]?.terminalOutcome, "failed");
});

test("patched bundle with the fixed router delivers through the Gateway queue", async () => {
  const patched = patchOpenClawMediaCompletionBundle(original).source;
  let gateway;
  const lifecycle = [];
  const result = await runSuccessfulGeneration({
    source: patched,
    localDelivery: () => assert.fail("Worker must not deliver locally"),
    bridge: (clock) => {
      gateway = simulatedGateway({ clock });
      const route = createFixedRouter({ deliverMediaCompletion: gateway.deliverMediaCompletion });
      return async (event) => {
        lifecycle.push(event.eventKind);
        return await route(event);
      };
    },
  });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.completed, [undefined]);
  assert(result.elapsedMs < 10_000, `delivered after ${result.elapsedMs} ms`);
  assert(gateway.calls.length >= 2);
  assert.equal(new Set(gateway.calls.map((c) => c.directIdempotencyKey)).size, 1);
  assert.equal(gateway.calls[0].requesterAgentId, "makaron");
  assert.equal(gateway.calls[0].requesterOrigin.channel, "feishu");
  assert.deepEqual(gateway.calls[0].internalEvents[0].attachments, [
    { type: "image", url: "https://example.invalid/generated.png" },
  ]);
  assert.equal(lifecycle[0], "detached_task_started");
  assert.equal(lifecycle.at(-1), "detached_task_settled");
});

test("patched bundle with V's 0.2.11 router cannot confirm the queued delivery", async () => {
  // 0.2.11 caches the first pending result forever and drops its disposition,
  // so the Worker side must ship with the fixed router.
  const patched = patchOpenClawMediaCompletionBundle(original).source;
  const result = await runSuccessfulGeneration({
    source: patched,
    localDelivery: () => assert.fail("Worker must not deliver locally"),
    bridge: (clock) => createV0211Router({ deliverMediaCompletion: simulatedGateway({ clock }).deliverMediaCompletion }),
  });
  assert.deepEqual(result.failures.map((f) => f.message), [
    "image_generate completion delivery was not confirmed after successful generation",
  ]);
});

test("a real Gateway delivery failure is still reported, not swallowed", async () => {
  const patched = patchOpenClawMediaCompletionBundle(original).source;
  const result = await runSuccessfulGeneration({
    source: patched,
    localDelivery: () => assert.fail("Worker must not deliver locally"),
    bridge: () => createFixedRouter({
      async deliverMediaCompletion() {
        return {
          delivered: false,
          path: "queued",
          reason: "completion_handoff_unavailable",
          error: "generated media session handoff was already dead-lettered",
          disposition: "permanent_failure",
        };
      },
    }),
  });
  assert.deepEqual(result.failures.map((f) => f.message), [
    "image_generate completion delivery was not confirmed after successful generation",
  ]);
  assert.equal(result.completed[0]?.terminalOutcome, "failed");
});

test("an unreachable Gateway fails visibly instead of delivering from the Worker", async () => {
  const patched = patchOpenClawMediaCompletionBundle(original).source;
  const result = await runSuccessfulGeneration({
    source: patched,
    localDelivery: () => assert.fail("Worker must not deliver locally"),
    bridge: () => async (event) => {
      if (event.eventKind === "media_generation_completion") throw new Error("IPC channel closed");
      return { handled: true };
    },
  });
  assert.deepEqual(result.failures.map((f) => f.message), [
    "image_generate completion wake failed after successful generation",
  ]);
  assert.match(result.failures[0].error, /IPC channel closed/);
});

test("without a Worker bridge the Gateway keeps native local delivery", async () => {
  const patched = patchOpenClawMediaCompletionBundle(original).source;
  let calls = 0;
  const result = await runSuccessfulGeneration({
    source: patched,
    localDelivery: async () => (++calls === 1
      ? { delivered: false, path: "queued", disposition: "session_queued" }
      : { delivered: true, path: "queued", disposition: "delivered" }),
  });
  assert.deepEqual(result.failures, []);
  assert.equal(calls, 2);
});

test("patch is idempotent and leaves the rest of the V bundle byte-identical", () => {
  const first = patchOpenClawMediaCompletionBundle(original);
  assert.equal(first.changed, true);
  assert.equal(patchOpenClawMediaCompletionBundle(first.source).changed, false);
  const head = original.indexOf("function scheduleMediaGenerationTaskCompletion(params)");
  const tail = original.indexOf("function createMediaGenerationTaskLifecycle(params)");
  const patchedTail = first.source.indexOf("function createMediaGenerationTaskLifecycle(params)");
  assert.equal(first.source.slice(0, head), original.slice(0, head));
  assert.equal(first.source.slice(patchedTail), original.slice(tail));
});

test("CLI patches a 2026.9.1 package, refuses a stale backup, and restores exact bytes", async () => {
  const { spawnSync } = await import("node:child_process");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-relay-91-"));
  try {
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.9.1" }));
    const bundle = path.join(root, "dist", "openclaw-tools-BODVdJQD.js");
    fs.writeFileSync(bundle, original);
    const cli = new URL("../scripts/patch-openclaw-media-completion-relay.mjs", import.meta.url).pathname;
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    const sha = (text) => createHash("sha256").update(text).digest("hex");

    const applied = run(root);
    assert.equal(applied.status, 0, applied.stderr);
    const report = JSON.parse(applied.stdout);
    assert.equal(report.status, "patched");
    assert.equal(report.beforeSha256, V_BUNDLE_SHA256);
    assert.equal(sha(fs.readFileSync(report.backupPath, "utf8")), V_BUNDLE_SHA256);
    assert.equal(report.afterSha256, sha(fs.readFileSync(bundle, "utf8")));
    assert.equal(JSON.parse(run(root).stdout).status, "already-patched");

    const restored = run("--restore", root);
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(sha(fs.readFileSync(bundle, "utf8")), V_BUNDLE_SHA256);

    fs.writeFileSync(bundle, original.replace("Schedules media generation work", "Schedules media work"));
    const stale = run(root);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /does not match the unpatched bundle/);
    assert.equal(fs.readFileSync(bundle, "utf8").includes("versa-worker-media-completion-relay"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
