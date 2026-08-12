import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createActiveRunAwareQueue,
  patchPackage,
  patchFeishuActiveRunSteeringBundle,
  restorePackage,
} from "../scripts/patch-feishu-active-run-steering.mjs";

const officialFixture = `
function createSequentialQueue(options = {}) {
\tconst queues = /* @__PURE__ */ new Map();
\tconst taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
\tconst onTaskTimeout = options.onTaskTimeout;
\treturn (key, task) => {
\t\tconst previous = queues.get(key) ?? Promise.resolve();
\t\tconst wrapped = () => boundedRun(key, task, taskTimeoutMs, onTaskTimeout);
\t\tconst next = previous.then(wrapped, wrapped);
\t\tqueues.set(key, next);
\t\tconst cleanup = () => {
\t\t\tif (queues.get(key) === next) queues.delete(key);
\t\t};
\t\tnext.then(cleanup, cleanup);
\t\treturn next;
\t};
}
async function dispatchFeishuMessage() {
		const sequentialKey = resolveSequentialKey();
		const task = () => handleMessage({
			cfg,
			processingClaimHeld: true,
			messageDedupeKey
		});
\t\tawait enqueue(sequentialKey, task);
}
function createFeishuReplyDispatcher() {
\treturn {
\t\treplyOptions: {
\t\t\t...replyOptions,
\t\t\tonModelSelected: prefixContext.onModelSelected,
\t\t}
\t};
}
async function handleFeishuMessage(params) {
\t\t\tif (shouldSendNoVisibleReplyFallback({
\t\t\t\t...dispatchResult,
\t\t\t\tfailedCounts: dispatcher.getFailedCounts?.() ?? {
\t\t\t\t\ttool: 0,
\t\t\t\t\tblock: 0,
\t\t\t\t\tfinal: 0
\t\t\t\t}
\t\t\t})) await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply");
}
`;

test("patch exposes busy state and routes a later message to the active-run lane", () => {
  const result = patchFeishuActiveRunSteeringBundle(officialFixture);
  assert.equal(result.changed, true);
  assert.match(result.source, /enqueue\.isBusy = \(key\) => queues\.has\(key\)/);
  assert.match(result.source, /\? `\$\{sequentialKey\}:active-run`/);
  assert.match(result.source, /const activeRunDispatch = .*enqueue\.isBusy/);
  assert.match(result.source, /VLAB_FEISHU_STEER_ENABLED/);
  assert.match(result.source, /VLAB_FEISHU_STEER_CHAT_IDS/);
  assert.match(result.source, /workerSteerChatIds\.has\("\*"\)/);
  assert.match(result.source, /messageDedupeKey,\n\t\t\tactiveRunDispatch/);
  assert.match(
    result.source,
    /queuedFollowupLifecycle: replyOptions\.queuedFollowupLifecycle \?\? \{\}/,
  );
  assert.match(
    result.source,
    /if \(!params\.activeRunDispatch && shouldSendNoVisibleReplyFallback/,
  );
  assert.equal(
    patchFeishuActiveRunSteeringBundle(result.source).changed,
    false,
  );
});

test("patch upgrades the ingress-only VLab draft with Reply Operation admission", () => {
  const ingressOnly = officialFixture
    .replace(
      /\treturn \(key, task\) => \{[\s\S]*?\n\t\};\n\}/,
      `${patchFeishuActiveRunSteeringBundle(officialFixture).source.match(
        /\tconst enqueue = \(key, task\) => \{[\s\S]*?\n\treturn enqueue;\n\}/,
      )[0]}`,
    )
    .replace(
      "\t\tawait enqueue(sequentialKey, task);",
      "\t\tconst dispatchKey = enqueue.isBusy(sequentialKey) ? `${sequentialKey}:active-run` : sequentialKey;\n\t\tawait enqueue(dispatchKey, task);",
    );
  const upgraded = patchFeishuActiveRunSteeringBundle(ingressOnly);
  assert.equal(upgraded.changed, true);
  assert.match(upgraded.source, /queuedFollowupLifecycle:/);
});

test("the second same-chat dispatch enters before the first completes", async () => {
  const queue = createActiveRunAwareQueue();
  const events = [];
  let releaseFirst;
  let releaseSecond;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const secondGate = new Promise((resolve) => {
    releaseSecond = resolve;
  });

  const first = queue.dispatch("chat", async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
  });
  await Promise.resolve();
  const second = queue.dispatch("chat", async () => {
    events.push("second:start");
    await secondGate;
    events.push("second:end");
  });
  const third = queue.dispatch("chat", async () => {
    events.push("third:start");
  });
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(events, ["first:start", "second:start"]);
  releaseSecond();
  await second;
  await third;
  assert.deepEqual(events, [
    "first:start",
    "second:start",
    "second:end",
    "third:start",
  ]);
  releaseFirst();
  await first;
});

test("the package patch is reversible for the monolithic OpenClaw package", async () => {
  for (const packageName of ["openclaw", "@openclaw/feishu"]) {
    const packageRoot = await mkdtemp(
      path.join(os.tmpdir(), "openclaw-feishu-steer-test-"),
    );
    try {
      await mkdir(path.join(packageRoot, "dist"));
      await writeFile(
        path.join(packageRoot, "package.json"),
        JSON.stringify({ name: packageName, version: "2026.7.1" }),
      );
      const bundlePath = path.join(
        packageRoot,
        "dist",
        "monitor.account-test.js",
      );
      await writeFile(bundlePath, officialFixture);

      assert.equal((await patchPackage(packageRoot)).changed, true);
      assert.match(
        await readFile(bundlePath, "utf8"),
        /VLAB_FEISHU_STEER_ENABLED/,
      );
      assert.equal((await patchPackage(packageRoot)).changed, false);
      assert.equal((await restorePackage(packageRoot)).changed, true);
      assert.equal(await readFile(bundlePath, "utf8"), officialFixture);
      assert.equal((await restorePackage(packageRoot)).changed, false);
    } finally {
      await rm(packageRoot, { recursive: true, force: true });
    }
  }
});
