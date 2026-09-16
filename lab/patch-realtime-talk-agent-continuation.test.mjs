import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUDIO_BACKLOG_AFTER,
  AUDIO_BACKLOG_BEFORE,
  CONSULT_SETTLE_AFTER,
  CONSULT_SETTLE_BEFORE,
  CONSULT_WAIT_OPTIONS_AFTER,
  CONSULT_WAIT_OPTIONS_BEFORE,
  CONTROL_UI_ASSET_BEFORE,
  CONTROL_UI_ASSET_PATH,
  describeAsset,
  patchControlUiAssetManifest,
  patchRealtimeTalkAgentContinuation,
} from "./patch-realtime-talk-agent-continuation.mjs";

test("saturated microphone uploads shed frames without ending the Talk session", () => {
  const fixture = `${AUDIO_BACKLOG_BEFORE};${CONSULT_WAIT_OPTIONS_BEFORE};${CONSULT_SETTLE_BEFORE}`;
  const patched = patchRealtimeTalkAgentContinuation(fixture);
  assert.match(patched, new RegExp(AUDIO_BACKLOG_AFTER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(patched.includes("Realtime Talk audio input fell behind"), false);
  assert.equal(patched.includes("failAudioAppend"), false);
});

test("agent consult recovers a missed final message by exact run identity", () => {
  const fixture = `${AUDIO_BACKLOG_BEFORE};${CONSULT_WAIT_OPTIONS_BEFORE};${CONSULT_SETTLE_BEFORE}`;
  const patched = patchRealtimeTalkAgentContinuation(fixture);
  assert.equal(patched.includes(CONSULT_WAIT_OPTIONS_AFTER), true);
  assert.equal(patched.includes(CONSULT_SETTLE_AFTER), true);
  assert.match(patched, /chat\.history/);
  assert.match(patched, /__openclaw\?\.runId===e\.runId/);
  assert.equal(patched.includes("OpenClaw finished with no text."), false);
});

test("bundle patch is idempotent and rejects partial input", () => {
  const fixture = `${AUDIO_BACKLOG_BEFORE};${CONSULT_WAIT_OPTIONS_BEFORE};${CONSULT_SETTLE_BEFORE}`;
  const patched = patchRealtimeTalkAgentContinuation(fixture);
  assert.equal(patchRealtimeTalkAgentContinuation(patched), patched);
  assert.throws(
    () => patchRealtimeTalkAgentContinuation(`${AUDIO_BACKLOG_AFTER};${CONSULT_WAIT_OPTIONS_BEFORE}`),
    /history recovery anchor drifted/,
  );
});

test("manifest publishes the new bundle generation", () => {
  const assets = [
    { path: CONTROL_UI_ASSET_PATH, ...CONTROL_UI_ASSET_BEFORE },
    { path: "assets/other.js", size: 1, sha256: "other" },
  ];
  const hash = describeAsset(
    assets.map((entry) => `${entry.path}\0${entry.size}\0${entry.sha256}\n`).join(""),
  ).sha256;
  const source = JSON.stringify({ version: 1, generation: hash, assets });
  const next = { sha256: "next", size: 42 };
  const manifest = JSON.parse(patchControlUiAssetManifest(source, next));
  assert.deepEqual(
    manifest.assets.find((entry) => entry.path === CONTROL_UI_ASSET_PATH),
    { path: CONTROL_UI_ASSET_PATH, ...next },
  );
  assert.notEqual(manifest.generation, hash);
});

test("built consult waiter retries rebuilding history until the exact run is visible", async () => {
  const bundle = readFileSync(
    new URL(
      "./release-files/talk-agent-continuation/control-ui-boot-chat-DWTSrxxk.js",
      import.meta.url,
    ),
    "utf8",
  );
  const start = bundle.indexOf("function rN(");
  const end = bundle.indexOf("function oN(", start);
  assert(start >= 0 && end > start, "consult waiter was not found in the built bundle");
  const buildWaiter = new Function(
    `var fN=1; var window=globalThis; function oN(){} ${bundle.slice(start, end)}; return aN;`,
  );
  const waitForAgent = buildWaiter();
  let listener;
  const requests = [];
  let historyAttempts = 0;
  const client = {
    addEventListener(callback) {
      listener = callback;
      return () => {};
    },
    async request(method, params) {
      requests.push([method, params]);
      if (method === "agent.wait") return { status: "done" };
      if (method === "chat.history") {
        historyAttempts += 1;
        if (historyAttempts <= 2) {
          throw new Error("UNAVAILABLE: session history is rebuilding; retry shortly");
        }
        return {
          messages: [
            ...(historyAttempts === 3
              ? [
                  {
                    role: "assistant",
                    content: [{ type: "text", text: "另一个 run 的旧答案" }],
                    __openclaw: { runId: "run-old" },
                  },
                ]
              : []),
            {
              role: "assistant",
              content:
                historyAttempts >= 4
                  ? [{ type: "text", text: "今天完成了两件事。" }]
                  : [],
              __openclaw: { runId: "run-1" },
            },
          ],
        };
      }
      throw new Error(`unexpected request: ${method}`);
    },
  };
  const result = waitForAgent({
    client,
    runId: "run-1",
    sessionKey: "agent:makaron:main",
    agentId: "makaron",
    timeoutMs: 1_000,
  });
  listener({
    event: "chat",
    payload: { runId: "run-1", state: "final", message: { content: [] } },
  });
  assert.equal(await result, "今天完成了两件事。");
  assert.deepEqual(
    requests.map(([method]) => method),
    ["agent.wait", "chat.history", "chat.history", "chat.history", "chat.history"],
  );
});
