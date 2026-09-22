import assert from "node:assert/strict";
import test from "node:test";
import {
  VOLC_RTC_AGENT_PROVIDER_ID,
  buildVolcRtcStartRequest,
  buildVolcengineRtcAgentProvider,
  parseVolcRtcRoomUrl,
  signVolcOpenApiRequest,
} from "./volcengine-rtc-agent-provider.mjs";

const PROVIDER_CONFIG = {
  appId: "rtc-app",
  appKey: "rtc-app-key",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  businessId: "openclaw-v",
  voiceChat: {
    Config: {
      ASRConfig: { Provider: "volcengine" },
      TTSConfig: { Provider: "volcengine" },
      LLMConfig: { SystemMessages: ["你是小何。"] },
    },
    AgentConfig: { UserId: "xiaohe-agent" },
  },
};

test("OpenAPI signing matches the official VolcEngine signer vector", () => {
  const request = signVolcOpenApiRequest({
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "SECRETEXAMPLE",
    body: { AppId: "app-test", RoomId: "room-test", TaskId: "task-test" },
    action: "StartVoiceChat",
    now: new Date("2026-09-21T00:00:00.000Z"),
  });
  assert.equal(request.headers["x-date"], "20260921T000000Z");
  assert.equal(
    request.headers["x-content-sha256"],
    "021c3e7508d3c9b96a9e1a0f3b86100251eb4d296367bceec01bc41159e46ef9",
  );
  assert.equal(
    request.headers.authorization,
    "HMAC-SHA256 Credential=AKIDEXAMPLE/20260921/cn-north-1/rtc/request, " +
      "SignedHeaders=host;x-content-sha256;x-date, " +
      "Signature=1b39992038e45aef1d58abefaf5d12a574acf116c06f3ae5e65f30c8ca6d0608",
  );
});

test("StartVoiceChat request preserves Xiaohe config and injects OpenClaw tools", () => {
  const request = buildVolcRtcStartRequest({
    config: PROVIDER_CONFIG,
    roomId: "room-1",
    taskId: "task-1",
    userId: "user-1",
    instructions: "需要外部信息时调用 V。",
    tools: [
      {
        type: "function",
        name: "openclaw_agent_consult",
        description: "Delegate to V",
        parameters: { type: "object", properties: { question: { type: "string" } } },
      },
      {
        type: "function",
        name: "openclaw_agent_control",
        description: "Update the active V task",
        parameters: { type: "object", properties: { mode: { type: "string" } } },
      },
    ],
  });
  assert.equal(request.AppId, "rtc-app");
  assert.equal(request.RoomId, "room-1");
  assert.deepEqual(request.AgentConfig.TargetUserId, ["user-1"]);
  assert.equal(request.AgentConfig.UserId, "xiaohe-agent");
  assert.deepEqual(request.Config.LLMConfig.SystemMessages, ['需要外部信息时调用 V。']);
  assert.deepEqual(
    request.Config.LLMConfig.Tools.map((tool) => tool.function.name),
    ["openclaw_agent_consult", "openclaw_agent_control"],
  );
  assert.equal(request.Config.LLMConfig.EnableToolCallHistory, true);
  assert.equal(request.Config.LLMConfig.EnableParallelToolCalls, false);
  assert.equal(PROVIDER_CONFIG.voiceChat.Config.LLMConfig.Tools, undefined, "input config must stay immutable");
});

test("StartVoiceChat keeps the console persona only when OpenClaw has no instructions", () => {
  const request = buildVolcRtcStartRequest({
    config: PROVIDER_CONFIG,
    roomId: "room-1",
    taskId: "task-1",
    userId: "user-1",
    tools: [],
  });
  assert.deepEqual(request.Config.LLMConfig.SystemMessages, ['你是小何。']);
});

test("provider starts and stops one managed RTC room without exposing server credentials", async () => {
  const calls = [];
  const ids = ["room-id", "user-id", "task-id"];
  const provider = buildVolcengineRtcAgentProvider({
    now: () => Date.parse("2026-09-21T00:00:00.000Z"),
    randomUUID: () => ids.shift(),
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ ResponseMetadata: {} }) };
    },
  });
  assert.equal(provider.id, VOLC_RTC_AGENT_PROVIDER_ID);
  assert.equal(provider.label, "volcenine-rtc");
  assert.deepEqual(provider.capabilities.transports, ["managed-room"]);
  assert.equal(provider.isConfigured({ providerConfig: PROVIDER_CONFIG }), true);

  const session = await provider.createBrowserSession({
    providerConfig: PROVIDER_CONFIG,
    model: "xiaohe-agent",
    voice: "xiaohe",
    instructions: "需要时调用 V。",
    tools: [],
  });
  assert.equal(session.transport, "managed-room");
  assert.match(session.token, /^001rtc-app/u);
  assert.equal(session.roomUrl.includes("secret-key"), false);
  assert.equal(session.roomUrl.includes("rtc-app-key"), false);
  assert.deepEqual(parseVolcRtcRoomUrl(session.roomUrl), {
    appId: "rtc-app",
    roomId: "v-room-id",
    userId: "user-user-id",
    agentUserId: "xiaohe-agent",
    taskId: "task-id",
    businessId: "openclaw-v",
  });
  assert.match(calls[0].url, /Action=StartVoiceChat/u);
  assert.equal(calls[0].body.TaskId, "task-id");

  await provider.cancelBrowserSession({ providerConfig: PROVIDER_CONFIG }, session);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /Action=StopVoiceChat/u);
  assert.deepEqual(calls[1].body, {
    AppId: "rtc-app",
    RoomId: "v-room-id",
    TaskId: "task-id",
  });
});

test("provider rejects incomplete Xiaohe or OpenAPI configuration before network I/O", async () => {
  const provider = buildVolcengineRtcAgentProvider({ env: {}, fetch: () => assert.fail("no fetch") });
  assert.equal(provider.isConfigured({ providerConfig: {} }), false);
  await assert.rejects(
    provider.createBrowserSession({ providerConfig: {}, tools: [] }),
    /RTC_APP_ID is required/u,
  );
});

test("provider requires the server AppKey and resolves the named console bot", async () => {
  const calls = [];
  const ids = ["room", "user", "task"];
  const provider = buildVolcengineRtcAgentProvider({
    env: {},
    now: () => Date.parse("2026-09-21T00:00:00.000Z"),
    randomUUID: () => ids.shift(),
    fetch: async (url, init) => {
      const action = new URL(url).searchParams.get("Action");
      calls.push({ action, url, body: JSON.parse(init.body) });
      const Result =
        action === "AibotxQuery"
          ? {
              Bots: [
                {
                  Id: "bot-xiaohe",
                  Name: "小何",
                  Config: { LLMConfig: { SystemMessages: ["你是小何。"] } },
                  AgentConfig: { UserId: "xiaohe-console-agent" },
                },
              ],
            }
          : {};
      return { ok: true, status: 200, json: async () => ({ ResponseMetadata: {}, Result }) };
    },
  });
  const providerConfig = {
    appId: "rtc-app",
    appKey: "console-app-key",
    accessKeyId: "access-key",
    secretAccessKey: "secret-key",
    botName: "小何",
  };
  assert.equal(provider.isConfigured({ providerConfig }), true);
  const session = await provider.createBrowserSession({
    providerConfig,
    instructions: "工具请求交给 V。",
    tools: [],
  });
  assert.deepEqual(calls.map((call) => call.action), ["AibotxQuery", "StartVoiceChat"]);
  assert.match(calls[0].url, /Version=2025-08-01/u);
  assert.equal(calls[1].body.AgentConfig.UserId, "xiaohe-console-agent");
  assert.deepEqual(calls[1].body.Config.LLMConfig.SystemMessages, ['工具请求交给 V。']);
  assert.equal(parseVolcRtcRoomUrl(session.roomUrl).agentUserId, "xiaohe-console-agent");
});

test("named console bot selection fails closed when the name is ambiguous", async () => {
  const provider = buildVolcengineRtcAgentProvider({
    env: {},
    fetch: async (url) => {
      const Result = { Bots: [{ Name: "小何" }, { Name: "小何" }] };
      return { ok: true, status: 200, json: async () => ({ ResponseMetadata: {}, Result }) };
    },
  });
  await assert.rejects(
    provider.createBrowserSession({
      providerConfig: {
        appId: "app",
        appKey: "app-key",
        accessKeyId: "ak",
        secretAccessKey: "sk",
        botName: "小何",
      },
      tools: [],
    }),
    /matched 2 bots/u,
  );
});

test("provider never attempts network AppKey discovery", async () => {
  const provider = buildVolcengineRtcAgentProvider({
    env: {},
    fetch: () => assert.fail("no fetch"),
  });
  const providerConfig = {
    appId: "app",
    accessKeyId: "ak",
    secretAccessKey: "sk",
    botId: "bot-xiaohe",
  };
  assert.equal(provider.isConfigured({ providerConfig }), false);
  await assert.rejects(
    provider.createBrowserSession({ providerConfig, tools: [] }),
    /RTC_APP_KEY is required/u,
  );
});
