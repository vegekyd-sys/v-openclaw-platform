import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const runtimeRoot = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtimeRoot, "VLAB_CANDIDATE_RUNTIME is required");

const bundlePath = join(
  runtimeRoot,
  "openclaw/dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk.js",
);
const manifestPath = join(runtimeRoot, "openclaw/dist/control-ui/asset-manifest.json");
const serverPath = join(runtimeRoot, "openclaw/dist/control-ui-DhD7PO_6.js");
const seeduplexProviderPath = join(
  runtimeRoot,
  "production-worker/seeduplex-realtime-provider.mjs",
);
const bundle = readFileSync(bundlePath, "utf8");
const manifestText = readFileSync(manifestPath, "utf8");
const server = readFileSync(serverPath, "utf8");
const seeduplexProvider = readFileSync(seeduplexProviderPath, "utf8");
const { buildSeeduplexRealtimeVoiceProvider } = await import(
  pathToFileURL(seeduplexProviderPath)
);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("candidate runtime contains the exact reviewed Talk artifacts", () => {
  assert.equal(
    sha256(bundle),
    "c6e94ad555ae847a81cfbc4152345794a0f21bd19052dfc2ae568c676aae2548",
  );
  assert.equal(
    sha256(manifestText),
    "ba7f4b9bc240afbdf4bd96c12aedaf8de2824f95a7e0b9f6c626c062f7a05c15",
  );
  assert.equal(
    sha256(server),
    "6803a28ff37719fe28afd4865cb4c308a0cae9dcefd06ac14a00670b1581b598",
  );
  assert.equal(
    sha256(seeduplexProvider),
    "04637dad756cb2f4e85fa0c0e211b01eda088fd2c460e3b770d7e87c10e031e7",
  );
});

test("Gateway-owned Seeduplex consults run once, stay server-owned and serialize", async () => {
  class FakeSocket extends EventEmitter {
    readyState = 0;
    sent = [];
    send(value) {
      this.sent.push(JSON.parse(value));
    }
    open() {
      this.readyState = 1;
      this.emit("open");
    }
    message(value) {
      this.emit("message", Buffer.from(JSON.stringify(value)), false);
    }
    close() {
      this.readyState = 3;
    }
  }
  const socket = new FakeSocket();
  const browserCalls = [];
  const pending = [];
  let active = 0;
  let maxActive = 0;
  const provider = buildSeeduplexRealtimeVoiceProvider({
    env: { VOLCENGINE_REALTIME_API_KEY: "candidate-secret" },
    createWebSocket: async () => socket,
  });
  const bridge = provider.createBridge({
    providerConfig: {},
    tools: [
      {
        name: "openclaw_agent_consult",
        description: "Delegate to OpenClaw",
        parameters: { type: "object", properties: {} },
      },
    ],
    runAgentConsult: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return await new Promise((resolve) => {
        pending.push((text) => {
          active -= 1;
          resolve({ text });
        });
      });
    },
    onAudio() {},
    onClearAudio() {},
    onToolCall: (call) => browserCalls.push(call),
    onError(error) {
      assert.fail(error.message);
    },
    onClose() {},
  });
  const connecting = bridge.connect();
  await new Promise((resolve) => setImmediate(resolve));
  socket.open();
  socket.message({ type: "session.created" });
  await connecting;
  socket.message({
    type: "response.function_call_arguments.done",
    items: [
      {
        call_id: "call-1",
        name: "openclaw_agent_consult",
        arguments: JSON.stringify({ question: "第一问" }),
      },
      {
        call_id: "call-2",
        name: "openclaw_agent_consult",
        arguments: JSON.stringify({ question: "跟进问题" }),
      },
    ],
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(browserCalls.length, 0);
  assert.equal(pending.length, 1);
  assert.equal(maxActive, 1);
  const working = socket.sent.filter((event) => event.type === "conversation.item.create");
  assert.equal(working.length, 1);
  assert.deepEqual(
    working[0].items.map((item) => item.call_id),
    ["call-1", "call-2"],
  );
  pending[0]("第一问完成");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 2);
  assert.equal(maxActive, 1);
  pending[1]("跟进完成");
  await new Promise((resolve) => setImmediate(resolve));
  socket.message({ type: "response.output_audio.done", response_id: "working" });
  const finalSpeech = socket.sent.filter(
    (event) => event.type === "speech_text_buffer.commit",
  );
  assert.deepEqual(finalSpeech.map((event) => event.text), ["第一问完成\n跟进完成"]);
  bridge.close();
});

test("saturated microphone input sheds a frame without closing Talk", () => {
  assert.match(bundle, /vN=32,yN=8e3/);
  assert.match(bundle, /if\(this\.pendingAudioAppends\.size>=vN\)return;/);
  assert.equal(bundle.includes("Realtime Talk audio input fell behind"), false);
  assert.equal(
    bundle.includes(
      "if(this.pendingAudioAppends.size>=vN){this.failAudioAppend(`Realtime Talk audio input fell behind`);return}",
    ),
    false,
  );
});

test("blank live final retries rebuilding history and recovers the exact agent run", async () => {
  assert.equal(bundle.includes("OpenClaw finished with no text."), false);
  assert.match(bundle, /chat\.history/);
  assert.match(bundle, /__openclaw\?\.runId===e\.runId/);

  const start = bundle.indexOf("function rN(");
  const end = bundle.indexOf("function oN(", start);
  assert(start >= 0 && end > start, "consult waiter was not found in candidate runtime");
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
            {
              role: "assistant",
              content: [{ type: "text", text: "旧答案" }],
              __openclaw: { runId: "run-old" },
            },
            ...(historyAttempts >= 4
              ? [
                  {
                    role: "assistant",
                    content: [{ type: "text", text: "今天完成了两件事。" }],
                    __openclaw: { runId: "run-voice-1" },
                  },
                ]
              : []),
          ],
        };
      }
      throw new Error(`unexpected request: ${method}`);
    },
  };

  const result = waitForAgent({
    client,
    runId: "run-voice-1",
    sessionKey: "agent:makaron:main",
    agentId: "makaron",
    timeoutMs: 1_000,
  });
  listener({
    event: "chat",
    payload: { runId: "run-voice-1", state: "final", message: { content: [] } },
  });

  assert.equal(await result, "今天完成了两件事。");
  assert.deepEqual(
    requests.map(([method]) => method),
    ["agent.wait", "chat.history", "chat.history", "chat.history", "chat.history"],
  );
});

test("manifest publishes the candidate bundle and has a valid generation", () => {
  const manifest = JSON.parse(manifestText);
  const entry = manifest.assets.find(
    (asset) => asset.path === "assets/control-ui-boot-chat-DWTSrxxk.js",
  );
  assert.deepEqual(entry, {
    path: "assets/control-ui-boot-chat-DWTSrxxk.js",
    sha256: "c6e94ad555ae847a81cfbc4152345794a0f21bd19052dfc2ae568c676aae2548",
    size: 786098,
  });
  const generation = createHash("sha256");
  for (const asset of manifest.assets) {
    generation.update(`${asset.path}\0${asset.size}\0${asset.sha256}\n`);
  }
  assert.equal(manifest.generation, generation.digest("hex"));
});

test("candidate server bypasses stale compression only for the Talk bundle", () => {
  assert.match(
    server,
    /const usePrecompressed = precompressed && CONTROL_UI_COMPRESSIBLE_EXTENSIONS\.has\(extension\) && !params\.contentPath\.endsWith\("assets\/control-ui-boot-chat-DWTSrxxk\.js"\);/,
  );
  assert.match(server, /resolveControlUiContentEncodings\(req, usePrecompressed\)/);
});
