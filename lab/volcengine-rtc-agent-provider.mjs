import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

export const VOLC_RTC_AGENT_PROVIDER_ID = "volcengine-rtc-agent";
export const VOLC_RTC_API_VERSION = "2025-06-01";
export const VOLC_RTC_CONSOLE_API_VERSION = "2025-08-01";
export const VOLC_RTC_ENDPOINT = "https://rtc.volcengineapi.com";
export const VOLC_RTC_REGION = "cn-north-1";
export const VOLC_RTC_SERVICE = "rtc";
export const VOLC_RTC_SDK_VERSION = "4.68.1";

const TOKEN_VERSION = "001";
const TOKEN_TTL_SECONDS = 60 * 60;
const PRIV_PUBLISH_STREAM = 0;
const PRIV_PUBLISH_AUDIO = 1;
const PRIV_PUBLISH_VIDEO = 2;
const PRIV_PUBLISH_DATA = 3;
const PRIV_SUBSCRIBE_STREAM = 4;

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value, name) {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function encodeUint16(value) {
  const output = Buffer.allocUnsafe(2);
  output.writeUInt16LE(value);
  return output;
}

function encodeUint32(value) {
  const output = Buffer.allocUnsafe(4);
  output.writeUInt32LE(value >>> 0);
  return output;
}

function encodeBytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (bytes.length > 0xffff) throw new Error("RTC token field is too large");
  return Buffer.concat([encodeUint16(bytes.length), bytes]);
}

function encodePrivileges(privileges) {
  const entries = Object.entries(privileges);
  return Buffer.concat([
    encodeUint16(entries.length),
    ...entries.flatMap(([key, value]) => [encodeUint16(Number(key)), encodeUint32(value)]),
  ]);
}

/**
 * Generates the short-lived RTC room token consumed by the browser SDK.
 * Layout follows VolcEngine's public AccessToken reference implementation.
 */
export function createVolcRtcToken({ appId, appKey, roomId, userId, now = Date.now() }) {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
  const nonce = randomBytes(4).readUInt32LE();
  const privileges = {
    [PRIV_PUBLISH_STREAM]: 0,
    [PRIV_PUBLISH_AUDIO]: 0,
    [PRIV_PUBLISH_VIDEO]: 0,
    [PRIV_PUBLISH_DATA]: 0,
    [PRIV_SUBSCRIBE_STREAM]: 0,
  };
  const message = Buffer.concat([
    encodeUint32(nonce),
    encodeUint32(issuedAt),
    encodeUint32(expiresAt),
    encodeBytes(roomId),
    encodeBytes(userId),
    encodePrivileges(privileges),
  ]);
  const signature = createHmac("sha256", appKey).update(message).digest();
  const content = Buffer.concat([encodeBytes(message), encodeBytes(signature)]).toString("base64");
  return {
    token: `${TOKEN_VERSION}${appId}${content}`,
    expiresAt: expiresAt * 1000,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function encodeQuery(value) {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Sign one VolcEngine OpenAPI request using the documented HMAC-SHA256 v4 flow. */
export function signVolcOpenApiRequest({
  accessKeyId,
  secretAccessKey,
  body,
  action,
  endpoint = VOLC_RTC_ENDPOINT,
  region = VOLC_RTC_REGION,
  service = VOLC_RTC_SERVICE,
  version = VOLC_RTC_API_VERSION,
  now = new Date(),
}) {
  const url = new URL(endpoint);
  url.searchParams.set("Action", action);
  url.searchParams.set("Version", version);
  const date = now.toISOString().replace(/[:-]|\.\d{3}/gu, "");
  const shortDate = date.slice(0, 8);
  const payload = JSON.stringify(body);
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${encodeQuery(key)}=${encodeQuery(value)}`)
    .join("&");
  // Keep this byte-for-byte compatible with @volcengine/openapi's Signer:
  // content-type is intentionally not signed, while the JSON body digest is
  // projected into X-Content-Sha256 and signed with Host and X-Date.
  const payloadHash = sha256(payload);
  const canonicalHeaders = `host:${url.host}\nx-content-sha256:${payloadHash}\nx-date:${date}\n`;
  const signedHeaders = "host;x-content-sha256;x-date";
  const canonicalRequest = [
    "POST",
    url.pathname || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ["HMAC-SHA256", date, credentialScope, sha256(canonicalRequest)].join("\n");
  const dateKey = hmac(secretAccessKey, shortDate);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "request");
  const signature = hmac(signingKey, stringToSign, "hex");
  return {
    url: `${url.origin}${url.pathname}?${canonicalQuery}`,
    body: payload,
    headers: {
      "content-type": "application/json",
      host: url.host,
      "x-content-sha256": payloadHash,
      "x-date": date,
      authorization:
        `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function resolveProviderConfig(providerConfig = {}, env = process.env) {
  const voiceChat = clone(providerConfig.voiceChat);
  return {
    appId: optionalString(providerConfig.appId) ?? optionalString(env.RTC_APP_ID),
    appKey: optionalString(providerConfig.appKey) ?? optionalString(env.RTC_APP_KEY),
    accessKeyId:
      optionalString(providerConfig.accessKeyId) ?? optionalString(env.VOLCENGINE_ACCESS_KEY_ID),
    secretAccessKey:
      optionalString(providerConfig.secretAccessKey) ??
      optionalString(env.VOLCENGINE_SECRET_ACCESS_KEY),
    businessId: optionalString(providerConfig.businessId) ?? optionalString(env.RTC_BUSINESS_ID),
    botId: optionalString(providerConfig.botId) ?? optionalString(env.RTC_BOT_ID),
    botName: optionalString(providerConfig.botName) ?? optionalString(env.RTC_BOT_NAME),
    agentUserId:
      optionalString(providerConfig.agentUserId) ?? optionalString(env.RTC_AGENT_USER_ID),
    voiceChat,
  };
}

function validateVoiceChat(voiceChat) {
  if (!voiceChat || typeof voiceChat !== "object" || Array.isArray(voiceChat)) {
    throw new Error("volcengine-rtc-agent voiceChat config is required");
  }
  if (!voiceChat.Config || typeof voiceChat.Config !== "object") {
    throw new Error("volcengine-rtc-agent voiceChat.Config is required");
  }
  if (!voiceChat.AgentConfig || typeof voiceChat.AgentConfig !== "object") {
    throw new Error("volcengine-rtc-agent voiceChat.AgentConfig is required");
  }
  requiredString(voiceChat.AgentConfig.UserId, "voiceChat.AgentConfig.UserId");
}

export function buildVolcRtcStartRequest({
  config,
  roomId,
  taskId,
  userId,
  instructions,
  tools = [],
}) {
  validateVoiceChat(config.voiceChat);
  const voiceChat = clone(config.voiceChat);
  const llm = voiceChat.Config.LLMConfig ?? {};
  // OpenClaw owns the realtime persona. The console bot remains the source of
  // its RTC/ASR/TTS/LLM wiring, but keeping both system prompts made policy
  // conflicts nondeterministic (for example, which turns should consult V).
  // Fall back to the console prompt only for callers that provide no explicit
  // OpenClaw instructions.
  const systemMessages = optionalString(instructions)
    ? [instructions.trim()]
    : Array.isArray(llm.SystemMessages)
      ? llm.SystemMessages
      : [];
  const rtcTools = tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  voiceChat.Config.LLMConfig = {
    ...llm,
    ...(systemMessages.length ? { SystemMessages: systemMessages } : {}),
    ...(rtcTools.length
      ? { Tools: rtcTools, EnableToolCallHistory: true, EnableParallelToolCalls: false }
      : {}),
  };
  return {
    ...voiceChat,
    AppId: config.appId,
    ...(config.businessId ? { BusinessId: config.businessId } : {}),
    RoomId: roomId,
    TaskId: taskId,
    AgentConfig: {
      ...voiceChat.AgentConfig,
      TargetUserId: [userId],
      EnableConversationStateCallback: true,
    },
  };
}

function buildRoomUrl({ appId, roomId, userId, agentUserId, taskId, businessId }) {
  const url = new URL("vertc://managed-room/join");
  url.searchParams.set("appId", appId);
  url.searchParams.set("roomId", roomId);
  url.searchParams.set("userId", userId);
  url.searchParams.set("agentUserId", agentUserId);
  url.searchParams.set("taskId", taskId);
  if (businessId) url.searchParams.set("businessId", businessId);
  return url.toString();
}

export function parseVolcRtcRoomUrl(roomUrl) {
  const url = new URL(roomUrl);
  if (url.protocol !== "vertc:" || url.hostname !== "managed-room" || url.pathname !== "/join") {
    throw new Error("Invalid VolcEngine managed-room URL");
  }
  return {
    appId: requiredString(url.searchParams.get("appId"), "room appId"),
    roomId: requiredString(url.searchParams.get("roomId"), "roomId"),
    userId: requiredString(url.searchParams.get("userId"), "room userId"),
    agentUserId: requiredString(url.searchParams.get("agentUserId"), "agentUserId"),
    taskId: requiredString(url.searchParams.get("taskId"), "taskId"),
    businessId: optionalString(url.searchParams.get("businessId")),
  };
}

function responseError(response, action) {
  const error = response?.ResponseMetadata?.Error;
  if (!error) return;
  const code = optionalString(error.Code) ?? "unknown";
  const message = optionalString(error.Message) ?? "unknown error";
  throw new Error(`${action} failed (${code}): ${message}`);
}

export function buildVolcengineRtcAgentProvider(options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  const createId = options.randomUUID ?? randomUUID;

  async function invoke(config, action, body, version = VOLC_RTC_API_VERSION) {
    const request = signVolcOpenApiRequest({
      accessKeyId: requiredString(config.accessKeyId, "VOLCENGINE_ACCESS_KEY_ID"),
      secretAccessKey: requiredString(config.secretAccessKey, "VOLCENGINE_SECRET_ACCESS_KEY"),
      body,
      action,
      version,
      now: new Date(now()),
    });
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });
    if (!response.ok) throw new Error(`${action} HTTP ${response.status}`);
    const payload = await response.json();
    responseError(payload, action);
    return payload;
  }

  async function resolveVoiceChat(config) {
    if (config.voiceChat) {
      validateVoiceChat(config.voiceChat);
      return config.voiceChat;
    }
    if (!config.botId && !config.botName) {
      throw new Error("volcengine-rtc-agent requires voiceChat, botId, or botName");
    }
    const payload = await invoke(
      config,
      "AibotxQuery",
      { PageNum: 1, Limit: 200, Iterator: "" },
      VOLC_RTC_CONSOLE_API_VERSION,
    );
    const bots = Array.isArray(payload?.Result?.Bots) ? payload.Result.Bots : [];
    const matches = bots.filter((bot) => {
      if (config.botId) return optionalString(bot?.Id) === config.botId;
      return optionalString(bot?.Name) === config.botName;
    });
    if (matches.length !== 1) {
      const selector = config.botId ? `botId=${config.botId}` : `botName=${config.botName}`;
      throw new Error(
        `VolcEngine RTC bot selection ${selector} matched ${matches.length} bots; use one exact botId`,
      );
    }
    const bot = matches[0];
    const agentConfig = clone(bot.AgentConfig) ?? {};
    if (!optionalString(agentConfig.UserId) && config.agentUserId) {
      agentConfig.UserId = config.agentUserId;
    }
    const voiceChat = { Config: clone(bot.Config), AgentConfig: agentConfig };
    validateVoiceChat(voiceChat);
    return voiceChat;
  }

  return {
    id: VOLC_RTC_AGENT_PROVIDER_ID,
    label: "VolcEngine RTC Agent",
    aliases: ["volc-rtc", "rtc-agent"],
    defaultModel: "xiaohe-agent",
    models: ["xiaohe-agent"],
    voices: ["xiaohe"],
    autoSelectOrder: 40,
    capabilities: {
      transports: ["managed-room"],
      inputAudioFormats: [],
      outputAudioFormats: [],
      supportsBrowserSession: true,
      supportsBargeIn: true,
      handlesInputAudioBargeIn: true,
      supportsToolCalls: true,
      supportsVideoFrames: false,
      supportsSessionResumption: false,
      // The provider owns a cloud task that must be stopped when the logical
      // browser voice session closes. The 9.1 Talk owner already provides the
      // correct disconnect/close lifecycle once plugin cancellation is wired.
      handlesAgentConsult: true,
    },
    resolveConfig: ({ rawConfig }) => ({ ...rawConfig }),
    isConfigured: ({ providerConfig }) => {
      const config = resolveProviderConfig(providerConfig, options.env);
      return Boolean(
        config.appId &&
          config.appKey &&
          config.accessKeyId &&
          config.secretAccessKey &&
          ((config.voiceChat?.Config && config.voiceChat?.AgentConfig?.UserId) ||
            config.botId ||
            config.botName),
      );
    },
    createBridge() {
      throw new Error("VolcEngine RTC Agent only supports browser managed-room sessions");
    },
    async createBrowserSession(request) {
      const config = resolveProviderConfig(request.providerConfig, options.env);
      config.appId = requiredString(config.appId, "RTC_APP_ID");
      config.appKey = requiredString(config.appKey, "RTC_APP_KEY");
      config.voiceChat = await resolveVoiceChat(config);
      const roomId = `v-${createId()}`;
      const userId = `user-${createId()}`;
      const taskId = createId();
      const agentUserId = config.voiceChat.AgentConfig.UserId.trim();
      const startBody = buildVolcRtcStartRequest({
        config,
        roomId,
        taskId,
        userId,
        instructions: request.instructions,
        tools: request.tools,
      });
      const { token, expiresAt } = createVolcRtcToken({
        appId: config.appId,
        appKey: config.appKey,
        roomId,
        userId,
        now: now(),
      });
      await invoke(config, "StartVoiceChat", startBody);
      return {
        provider: VOLC_RTC_AGENT_PROVIDER_ID,
        transport: "managed-room",
        roomUrl: buildRoomUrl({
          appId: config.appId,
          roomId,
          userId,
          agentUserId,
          taskId,
          businessId: config.businessId,
        }),
        token,
        model: request.model ?? "xiaohe-agent",
        voice: request.voice ?? "xiaohe",
        expiresAt,
      };
    },
    async cancelBrowserSession(request, session) {
      if (session?.transport !== "managed-room") return;
      const config = resolveProviderConfig(request.providerConfig, options.env);
      const room = parseVolcRtcRoomUrl(session.roomUrl);
      await invoke(config, "StopVoiceChat", {
        AppId: room.appId,
        RoomId: room.roomId,
        TaskId: room.taskId,
      });
    },
  };
}
