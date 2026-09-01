import assert from "node:assert/strict";
import test from "node:test";

import { migrateOpenClaw2026081Config } from "../scripts/migrate-openclaw-2026.8.1-config.mjs";

test("migrates renamed 2026.7.1 fields without copying secrets or runtime state", () => {
  const input = {
    env: { MOONSHOT_API_KEY: "secret-value", shellEnv: { enabled: false } },
    meta: { lastTouchedVersion: "2026.7.1", lastTouchedAt: "now" },
    diagnostics: { memoryPressureSnapshot: true },
    browser: {
      remoteCdpTimeoutMs: 60_000,
      remoteCdpHandshakeTimeoutMs: 60_000,
      tabCleanup: { enabled: true, idleMinutes: 30, maxTabsPerSession: 4, sweepMinutes: 5 },
      profiles: { "vbrowser-01": { driver: "extension", color: "#fff" } },
    },
    agents: {
      defaults: {
        models: {
          "deepseek/deepseek-v4-pro": { agentRuntime: { id: "custom-worker" } },
          "openai/gpt-5.6-sol": { alias: "vcodex", agentRuntime: { id: "codex" } },
        },
        contextTokens: 1_000_000,
        contextLimits: { toolResultMaxChars: 32_000 },
        contextPruning: {
          mode: "cache-ttl",
          ttl: "5m",
          keepLastAssistants: 3,
          softTrimRatio: 0.3,
          hardClearRatio: 0.5,
          minPrunableToolChars: 12_000,
        },
        compaction: {
          mode: "safeguard",
          reserveTokens: 32_000,
          keepRecentTokens: 8_000,
          reserveTokensFloor: 24_000,
          maxHistoryShare: 0.35,
          recentTurnsPreserve: 6,
          truncateAfterCompaction: true,
        },
        heartbeat: { every: "0m", skipWhenBusy: true, includeSystemPromptSection: false },
        imageGenerationModel: { primary: "makaron-image/gpt-image-2" },
        memorySearch: {
          provider: "gemini",
          store: { vector: { extensionPath: "/old/openclaw/node_modules/sqlite-vec-linux-x64/vec0.so" } },
        },
      },
      list: [
        { id: "makaron", contextLimits: { toolResultMaxChars: 32_000 } },
        { id: "v-codex" },
        { id: "dealclaw", memorySearch: { provider: "gemini", model: "embedding" } },
      ],
    },
    channels: {
      slack: { enabled: false, socketMode: true },
      ddingtalk: { enabled: false },
      wecom: { enabled: true },
      feishu: {
        enabled: true,
        streaming: true,
        blockStreaming: false,
        tools: { chat: false, bitable: false, base: false },
      },
    },
    messages: {
      queue: { mode: "steer", debounceMs: 1_000, cap: 20 },
      tts: { provider: "tts-local-cli", auto: "off" },
    },
    tools: {
      media: {
        audio: { models: [{ provider: "deepgram", model: "nova" }] },
        video: { models: [{ provider: "google", model: "gemini" }] },
      },
    },
    hooks: { enabled: true, maxBodyBytes: 10_000 },
    commands: { ownerDisplay: "raw" },
    plugins: {
      allow: ["custom-worker"],
      load: {
        paths: [
          "/opt/vlab/experiments/agent-worker-isolation-v1/releases/old-release",
          "/srv/state/npm/projects/feishu/node_modules/@openclaw/feishu",
        ],
      },
      entries: {
        browser: { enabled: true },
        codex: { enabled: true },
        "project-sandbox": {
          enabled: true,
          hooks: { allowPromptInjection: true },
        },
        "codex-supervisor": { enabled: true },
        "openclaw-plugin-yuanbao": { enabled: false },
        ddingtalk: { enabled: false },
      },
    },
    gateway: {
      controlUi: { allowInsecureAuth: false, dangerouslyDisableDeviceAuth: false },
      tailscale: { mode: "off", resetOnExit: false },
    },
  };

  const { config, changes } = migrateOpenClaw2026081Config(input, {
    openClawRoot: "/opt/vlab/releases/2026.8.1",
    systemAgentId: "makaron",
    workerPluginPath:
      "/opt/vlab/experiments/agent-worker-isolation-v1/releases/new-release",
  });

  assert.equal(config.meta.lastTouchedAt, undefined);
  assert.deepEqual(config.env, {
    vars: { MOONSHOT_API_KEY: "secret-value" },
    shellEnv: { enabled: false },
  });
  assert.deepEqual(config.browser.tabCleanup, { enabled: true });
  assert.equal(config.browser.remoteCdpTimeoutMs, undefined);
  assert.equal(config.browser.remoteCdpHandshakeTimeoutMs, undefined);
  assert.deepEqual(config.browser.profiles["vbrowser-01"], { driver: "extension" });
  assert.deepEqual(config.agents.defaults.contextPruning, { mode: "cache-ttl", ttl: "5m" });
  assert.deepEqual(config.agents.defaults.compaction, {
    mode: "safeguard",
    keepRecentTokens: 8_000,
    recentTurnsPreserve: 6,
  });
  assert.deepEqual(config.agents.defaults.mediaModels.image, { primary: "makaron-image/gpt-image-2" });
  assert.equal(config.agents.defaults.imageGenerationModel, undefined);
  assert.equal(config.memory.search.provider, "gemini");
  assert.equal(
    config.memory.search.store.vector.extensionPath,
    "/opt/vlab/releases/2026.8.1/node_modules/sqlite-vec-linux-x64/vec0.so",
  );
  assert.deepEqual(config.tts, { provider: "tts-local-cli", auto: "off" });
  assert.equal(config.messages.tts, undefined);
  assert.deepEqual(config.messages.queue.debounceMsByChannel, {
    slack: 1_000,
    ddingtalk: 1_000,
    wecom: 1_000,
    feishu: 1_000,
  });
  assert.equal(config.messages.queue.debounceMs, undefined);
  assert.deepEqual(config.channels.feishu.streaming, {
    mode: "partial",
    block: { enabled: false },
  });
  assert.equal(config.channels.feishu.blockStreaming, undefined);
  assert.deepEqual(config.channels.feishu.tools, { chat: false, bitable: false });
  assert.deepEqual(config.channels.slack, { enabled: false });
  assert.equal(config.channels.ddingtalk, undefined);
  assert.equal(config.agents.list, undefined);
  assert.equal(config.agents.defaults.contextTokens, undefined);
  assert.equal(config.agents.entries.makaron.contextLimits, undefined);
  assert.equal(config.agents.entries.makaron.id, undefined);
  assert.deepEqual(Object.keys(config.agents.entries), ["makaron", "v-codex", "dealclaw"]);
  assert.deepEqual(config.agents.entries.dealclaw.memory.search, {
    provider: "gemini",
    model: "embedding",
  });
  assert.equal(config.agents.ownership, "explicit");
  assert.equal(config.agents.defaults.systemAgent.agentId, "makaron");
  assert.equal(config.agents.defaults.sessionStore.agentId, "makaron");
  assert.deepEqual(config.agents.defaults.modelPolicy.allow, [
    "deepseek/deepseek-v4-pro",
    "openai/gpt-5.6-sol",
  ]);
  assert.equal(
    config.agents.defaults.models["openai/gpt-5.6-sol"].agentRuntime.id,
    "codex",
  );
  assert.equal(config.gateway.controlUi.dangerouslyDisableDeviceAuth, undefined);
  assert.deepEqual(config.tools.media.models, [
    { provider: "deepgram", model: "nova", capabilities: ["audio"] },
    { provider: "google", model: "gemini", capabilities: ["video"] },
  ]);
  assert.deepEqual(config.hooks, { enabled: true });
  assert.deepEqual(config.plugins.allow, [
    "custom-worker",
    "browser",
    "codex",
    "project-sandbox",
    "wecom-openclaw-plugin",
    "feishu",
    "tts-local-cli",
    "memory-core",
  ]);
  assert.equal(config.plugins.entries["codex-supervisor"], undefined);
  assert.equal(config.plugins.entries["openclaw-plugin-yuanbao"], undefined);
  assert.equal(config.plugins.entries.ddingtalk, undefined);
  assert.deepEqual(config.plugins.load.paths, [
    "/opt/vlab/experiments/agent-worker-isolation-v1/releases/new-release",
  ]);
  assert.deepEqual(config.plugins.entries["project-sandbox"].hooks, {
    allowPromptInjection: true,
    allowConversationAccess: true,
  });
  assert.ok(changes.length >= 20);
  assert.deepEqual(input.agents.defaults.imageGenerationModel, { primary: "makaron-image/gpt-image-2" });
});

test("refuses a missing or conflicting system agent owner", () => {
  assert.throws(
    () =>
      migrateOpenClaw2026081Config(
        { agents: { list: [{ id: "makaron" }] } },
        { systemAgentId: "missing" },
      ),
    /is not present/,
  );
  assert.throws(
    () =>
      migrateOpenClaw2026081Config(
        {
          agents: {
            defaults: { systemAgent: { agentId: "v-codex" } },
            list: [{ id: "makaron" }, { id: "v-codex" }],
          },
        },
        { systemAgentId: "makaron" },
      ),
    /Refusing to overwrite non-equivalent/,
  );
  assert.throws(
    () =>
      migrateOpenClaw2026081Config(
        {
          agents: {
            defaults: { sessionStore: { agentId: "v-codex" } },
            list: [{ id: "makaron" }, { id: "v-codex" }],
          },
        },
        { systemAgentId: "makaron" },
      ),
    /Refusing to overwrite non-equivalent/,
  );
});

test("refuses to overwrite a conflicting 2026.8.1 target", () => {
  assert.throws(
    () =>
      migrateOpenClaw2026081Config({
        agents: {
          defaults: {
            imageGenerationModel: "old/image",
            mediaModels: { image: "new/image" },
          },
        },
      }),
    /Refusing to overwrite non-equivalent/,
  );
});

test("refuses a partial explicit model policy instead of silently reducing access", () => {
  assert.throws(
    () =>
      migrateOpenClaw2026081Config({
        agents: {
          defaults: {
            models: { "deepseek/deepseek-v4-pro": {}, "openai/gpt-5.6-sol": {} },
            modelPolicy: { allow: ["deepseek/deepseek-v4-pro"] },
          },
        },
      }),
    /Refusing to replace a partial/,
  );
});
