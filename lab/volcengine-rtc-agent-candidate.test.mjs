import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "VLAB_CANDIDATE_RUNTIME is required");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("candidate runs on the pinned Node 22 runtime", () => {
  assert.equal(process.versions.node.split(".")[0], "22");
});

test("candidate contains a coherent managed-room browser asset graph", async () => {
  const controlUi = join(runtime, "openclaw/dist/control-ui");
  const manifest = JSON.parse(await readFile(join(controlUi, "asset-manifest.json"), "utf8"));
  for (const name of [
    "assets/control-ui-boot-chat-DWTSrxxk.js",
    "assets/volcengine-rtc-managed-room-client.js",
    "assets/volcengine-rtc-4.68.1.esm.js",
  ]) {
    const entry = manifest.assets.find((item) => item.path === name);
    assert(entry, `${name} missing from manifest`);
    const content = await readFile(join(controlUi, name));
    assert.equal(content.length, entry.size);
    assert.equal(sha256(content), entry.sha256);
  }
  const ui = await readFile(join(controlUi, "assets/control-ui-boot-chat-DWTSrxxk.js"), "utf8");
  assert.match(ui, /VolcRtcManagedRoomTransport/u);
  assert.match(ui, /volcengine-rtc-managed-room-client\.js/u);
});

test("candidate server runtime registers and closes the managed-room provider", async () => {
  const providerPath = join(runtime, "production-worker/volcengine-rtc-agent-provider.mjs");
  const { buildVolcengineRtcAgentProvider, parseVolcRtcRoomUrl } = await import(
    pathToFileURL(providerPath)
  );
  const requests = [];
  const ids = ["room", "user", "task"];
  const provider = buildVolcengineRtcAgentProvider({
    now: () => Date.parse("2026-09-21T00:00:00Z"),
    randomUUID: () => ids.shift(),
    fetch: async (url, init) => {
      const action = new URL(url).searchParams.get("Action");
      requests.push({ action, url, body: JSON.parse(init.body) });
      const Result =
        action === "DescribeAppKeys"
          ? { AppKey: "app-key" }
          : action === "AibotxQuery"
            ? {
                Bots: [
                  {
                    Id: "bot-xiaohe",
                    Name: "小何",
                    Config: { LLMConfig: {} },
                    AgentConfig: { UserId: "xiaohe" },
                  },
                ],
              }
            : {};
      return { ok: true, status: 200, json: async () => ({ ResponseMetadata: {}, Result }) };
    },
  });
  const providerConfig = {
    appId: "app",
    accessKeyId: "access",
    secretAccessKey: "secret",
    botName: "小何",
  };
  const session = await provider.createBrowserSession({
    providerConfig,
    instructions: "Use V for tools",
    tools: [
      {
        name: "openclaw_agent_consult",
        description: "Delegate to V",
        parameters: { type: "object" },
      },
    ],
  });
  assert.equal(session.transport, "managed-room");
  assert.equal(parseVolcRtcRoomUrl(session.roomUrl).agentUserId, "xiaohe");
  assert.equal(requests[2].body.Config.LLMConfig.Tools[0].function.name, "openclaw_agent_consult");
  await provider.cancelBrowserSession({ providerConfig }, session);
  assert.match(requests[3].url, /Action=StopVoiceChat/u);

  const worker = await readFile(join(runtime, "production-worker/index.mjs"), "utf8");
  const talk = await readFile(join(runtime, "openclaw/dist/talk-DkFuKRod.js"), "utf8");
  const harness = await readFile(
    join(runtime, "openclaw/dist/realtime-session-harness-CEO5kVAJ.js"),
    "utf8",
  );
  assert.match(worker, /buildVolcengineRtcAgentProvider/u);
  assert.match(talk, /session\.transport === "managed-room"/u);
  assert.match(harness, /params\.provider\.cancelBrowserSession/u);
});

test("candidate browser control protocol stays importable without opening audio", async () => {
  const clientPath = join(
    runtime,
    "openclaw/dist/control-ui/assets/volcengine-rtc-managed-room-client.js",
  );
  const { encodeRtcTlv, decodeRtcTlv } = await import(pathToFileURL(clientPath));
  assert.deepEqual(decodeRtcTlv(encodeRtcTlv("func", "ok")), { type: "func", value: "ok" });
});
