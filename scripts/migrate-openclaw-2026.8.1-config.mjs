#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getAt(root, keys) {
  let cursor = root;
  for (const key of keys) {
    if (!isObject(cursor) || !(key in cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function ensureParent(root, keys) {
  let cursor = root;
  for (const key of keys) {
    if (cursor[key] === undefined) cursor[key] = {};
    if (!isObject(cursor[key])) fail(`Expected ${keys.join(".")} to be an object`);
    cursor = cursor[key];
  }
  return cursor;
}

function deleteAt(root, keys, changes) {
  const parent = getAt(root, keys.slice(0, -1));
  const key = keys.at(-1);
  if (!isObject(parent) || !(key in parent)) return;
  delete parent[key];
  changes.push({ action: "remove", path: keys.join(".") });
}

function moveAt(root, from, to, changes) {
  const value = getAt(root, from);
  if (value === undefined) return;
  const target = getAt(root, to);
  if (target !== undefined && !equalJson(value, target)) {
    fail(`Refusing to overwrite non-equivalent ${to.join(".")}`);
  }
  const parent = ensureParent(root, to.slice(0, -1));
  parent[to.at(-1)] = value;
  deleteAt(root, from, []);
  changes.push({ action: "move", from: from.join("."), to: to.join(".") });
}

function setEquivalent(target, key, value, pathLabel) {
  if (target[key] !== undefined && !equalJson(target[key], value)) {
    fail(`Refusing to overwrite non-equivalent ${pathLabel}`);
  }
  target[key] = value;
}

function migrateChannelStreamingEntry(entry, pathLabel, changes) {
  if (!isObject(entry)) return;
  const legacyStreaming = entry.streaming;
  const streaming = isObject(legacyStreaming) ? structuredClone(legacyStreaming) : {};

  if (typeof legacyStreaming === "boolean") {
    setEquivalent(streaming, "mode", legacyStreaming ? "partial" : "off", `${pathLabel}.streaming.mode`);
  } else if (typeof legacyStreaming === "string") {
    const mode = legacyStreaming === "on" ? "partial" : legacyStreaming;
    setEquivalent(streaming, "mode", mode, `${pathLabel}.streaming.mode`);
  }
  if (entry.streamMode !== undefined) {
    const mode = entry.streamMode === "on" ? "partial" : entry.streamMode;
    setEquivalent(streaming, "mode", mode, `${pathLabel}.streaming.mode`);
  }
  if (entry.chunkMode !== undefined) {
    setEquivalent(streaming, "chunkMode", entry.chunkMode, `${pathLabel}.streaming.chunkMode`);
  }

  const block = isObject(streaming.block) ? structuredClone(streaming.block) : {};
  if (entry.blockStreaming !== undefined) {
    setEquivalent(block, "enabled", entry.blockStreaming, `${pathLabel}.streaming.block.enabled`);
  }
  if (entry.blockStreamingCoalesce !== undefined) {
    setEquivalent(
      block,
      "coalesce",
      entry.blockStreamingCoalesce,
      `${pathLabel}.streaming.block.coalesce`,
    );
  }
  if (Object.keys(block).length > 0) streaming.block = block;

  const legacyKeys = ["streamMode", "chunkMode", "blockStreaming", "blockStreamingCoalesce"];
  const hadLegacyFields =
    typeof legacyStreaming === "boolean" ||
    typeof legacyStreaming === "string" ||
    legacyKeys.some((key) => entry[key] !== undefined);
  if (!hadLegacyFields) return;
  entry.streaming = streaming;
  for (const key of legacyKeys) delete entry[key];
  changes.push({ action: "normalize", path: `${pathLabel}.streaming` });
}

export function migrateOpenClaw2026081Config(input, options = {}) {
  const config = structuredClone(input);
  const changes = [];

  const environment = config.env;
  if (isObject(environment)) {
    const directVariables = Object.entries(environment).filter(
      ([key, value]) => key !== "vars" && key !== "shellEnv" && typeof value === "string",
    );
    if (directVariables.length > 0) {
      environment.vars ??= {};
      if (!isObject(environment.vars)) fail("env.vars must be an object");
      for (const [key, value] of directVariables) {
        setEquivalent(environment.vars, key, value, `env.vars.${key}`);
        delete environment[key];
      }
      changes.push({ action: "move", from: "env.{direct strings}", to: "env.vars" });
    }
  }

  deleteAt(config, ["meta", "lastTouchedAt"], changes);
  deleteAt(config, ["diagnostics", "memoryPressureSnapshot"], changes);
  deleteAt(config, ["browser", "tabCleanup", "idleMinutes"], changes);
  deleteAt(config, ["browser", "tabCleanup", "maxTabsPerSession"], changes);
  deleteAt(config, ["browser", "tabCleanup", "sweepMinutes"], changes);
  deleteAt(config, ["browser", "remoteCdpTimeoutMs"], changes);
  deleteAt(config, ["browser", "remoteCdpHandshakeTimeoutMs"], changes);
  for (const profile of Object.values(config.browser?.profiles ?? {})) {
    if (isObject(profile) && "color" in profile) {
      delete profile.color;
      changes.push({ action: "remove", path: "browser.profiles.*.color" });
    }
  }

  deleteAt(config, ["agents", "defaults", "contextLimits", "toolResultMaxChars"], changes);
  deleteAt(config, ["agents", "defaults", "contextPruning", "keepLastAssistants"], changes);
  deleteAt(config, ["agents", "defaults", "contextPruning", "softTrimRatio"], changes);
  deleteAt(config, ["agents", "defaults", "contextPruning", "hardClearRatio"], changes);
  deleteAt(config, ["agents", "defaults", "contextPruning", "minPrunableToolChars"], changes);
  deleteAt(config, ["agents", "defaults", "compaction", "reserveTokens"], changes);
  deleteAt(config, ["agents", "defaults", "compaction", "reserveTokensFloor"], changes);
  deleteAt(config, ["agents", "defaults", "compaction", "maxHistoryShare"], changes);
  deleteAt(config, ["agents", "defaults", "compaction", "truncateAfterCompaction"], changes);
  deleteAt(config, ["agents", "defaults", "heartbeat", "skipWhenBusy"], changes);
  deleteAt(config, ["agents", "defaults", "heartbeat", "includeSystemPromptSection"], changes);
  deleteAt(config, ["agents", "defaults", "contextTokens"], changes);

  const legacyAgentList = config.agents?.list ?? [];
  for (const agent of legacyAgentList) {
    if (!isObject(agent)) continue;
    if (agent.memorySearch !== undefined) {
      if (!isObject(agent.memorySearch)) fail(`agents.list.${agent.id ?? "unknown"}.memorySearch must be an object`);
      agent.memory ??= {};
      if (!isObject(agent.memory)) fail(`agents.list.${agent.id ?? "unknown"}.memory must be an object`);
      setEquivalent(
        agent.memory,
        "search",
        agent.memorySearch,
        `agents.list.${agent.id ?? "unknown"}.memory.search`,
      );
      delete agent.memorySearch;
      changes.push({
        action: "move",
        from: `agents.list.${agent.id ?? "unknown"}.memorySearch`,
        to: `agents.list.${agent.id ?? "unknown"}.memory.search`,
      });
    }
    deleteAt(agent, ["contextLimits", "toolResultMaxChars"], changes);
    if ("contextTokens" in agent) {
      delete agent.contextTokens;
      changes.push({ action: "remove", path: `agents.list.${agent.id ?? "unknown"}.contextTokens` });
    }
    if (isObject(agent.contextLimits) && Object.keys(agent.contextLimits).length === 0) {
      delete agent.contextLimits;
    }
  }

  if (legacyAgentList.length > 0) {
    if (config.agents.entries !== undefined) fail("Refusing to merge agents.list into existing agents.entries");
    const entries = {};
    for (const legacyAgent of legacyAgentList) {
      if (!isObject(legacyAgent) || typeof legacyAgent.id !== "string" || legacyAgent.id.length === 0) {
        fail("Every agents.list entry must have a non-empty id");
      }
      if (entries[legacyAgent.id]) fail(`Duplicate agents.list id: ${legacyAgent.id}`);
      const entry = structuredClone(legacyAgent);
      delete entry.id;
      delete entry.default;
      entries[legacyAgent.id] = entry;
    }
    config.agents.entries = entries;
    delete config.agents.list;
    changes.push({ action: "move", from: "agents.list", to: "agents.entries" });
  }

  const agentIds = Object.keys(config.agents?.entries ?? {});
  if (
    agentIds.length > 1 &&
    config.agents?.ownership === undefined &&
    !legacyAgentList.some((agent) => isObject(agent) && agent.default === true)
  ) {
    config.agents.ownership = "explicit";
    changes.push({ action: "add", path: "agents.ownership", value: "explicit" });
  }

  if (options.systemAgentId) {
    if (!agentIds.includes(options.systemAgentId)) {
      fail(`System agent ${options.systemAgentId} is not present in agents.entries`);
    }
    const defaults = ensureParent(config, ["agents", "defaults"]);
    defaults.systemAgent ??= {};
    if (!isObject(defaults.systemAgent)) {
      fail("agents.defaults.systemAgent must be an object");
    }
    setEquivalent(
      defaults.systemAgent,
      "agentId",
      options.systemAgentId,
      "agents.defaults.systemAgent.agentId",
    );
    changes.push({
      action: "add",
      path: "agents.defaults.systemAgent.agentId",
      value: options.systemAgentId,
    });
    defaults.sessionStore ??= {};
    if (!isObject(defaults.sessionStore)) {
      fail("agents.defaults.sessionStore must be an object");
    }
    setEquivalent(
      defaults.sessionStore,
      "agentId",
      options.systemAgentId,
      "agents.defaults.sessionStore.agentId",
    );
    changes.push({
      action: "add",
      path: "agents.defaults.sessionStore.agentId",
      value: options.systemAgentId,
    });
  }

  moveAt(
    config,
    ["agents", "defaults", "imageGenerationModel"],
    ["agents", "defaults", "mediaModels", "image"],
    changes,
  );
  moveAt(config, ["agents", "defaults", "memorySearch"], ["memory", "search"], changes);
  moveAt(config, ["messages", "tts"], ["tts"], changes);

  const media = getAt(config, ["tools", "media"]);
  if (isObject(media)) {
    const sharedModels = Array.isArray(media.models) ? media.models : [];
    const migratedModels = [];
    for (const capability of ["image", "audio", "video"]) {
      const capabilityConfig = media[capability];
      if (!isObject(capabilityConfig) || !Array.isArray(capabilityConfig.models)) continue;
      for (const model of capabilityConfig.models) {
        if (!isObject(model)) continue;
        if (Array.isArray(model.capabilities) && !model.capabilities.includes(capability)) continue;
        migratedModels.push({ ...structuredClone(model), capabilities: [capability] });
      }
      delete capabilityConfig.models;
      changes.push({
        action: "move",
        from: `tools.media.${capability}.models`,
        to: "tools.media.models",
      });
      if (Object.keys(capabilityConfig).length === 0) delete media[capability];
    }
    if (migratedModels.length > 0) {
      const seen = new Set();
      media.models = [...migratedModels, ...sharedModels].filter((model) => {
        const signature = JSON.stringify(model);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      });
    }
  }

  const debounceMs = getAt(config, ["messages", "queue", "debounceMs"]);
  if (debounceMs !== undefined) {
    const queue = ensureParent(config, ["messages", "queue"]);
    queue.debounceMsByChannel ??= {};
    if (!isObject(queue.debounceMsByChannel)) fail("messages.queue.debounceMsByChannel must be an object");
    const channels = Object.keys(config.channels ?? {});
    for (const channel of channels) {
      queue.debounceMsByChannel[channel] ??= debounceMs;
    }
    delete queue.debounceMs;
    changes.push({
      action: "move",
      from: "messages.queue.debounceMs",
      to: `messages.queue.debounceMsByChannel.{${channels.join(",")}}`,
    });
  }

  for (const [channelId, channel] of Object.entries(config.channels ?? {})) {
    if (!isObject(channel)) continue;
    migrateChannelStreamingEntry(channel, `channels.${channelId}`, changes);
    for (const [accountId, account] of Object.entries(channel.accounts ?? {})) {
      migrateChannelStreamingEntry(account, `channels.${channelId}.accounts.${accountId}`, changes);
    }
  }
  deleteAt(config, ["channels", "slack", "socketMode"], changes);
  if (config.channels?.ddingtalk?.enabled === false) {
    delete config.channels.ddingtalk;
    changes.push({ action: "remove", path: "channels.ddingtalk" });
  }

  const feishuTools = getAt(config, ["channels", "feishu", "tools"]);
  if (isObject(feishuTools) && feishuTools.base !== undefined) {
    if (feishuTools.bitable !== undefined && feishuTools.bitable !== feishuTools.base) {
      fail("Refusing conflicting channels.feishu.tools.base and channels.feishu.tools.bitable");
    }
    feishuTools.bitable ??= feishuTools.base;
    delete feishuTools.base;
    changes.push({
      action: "move",
      from: "channels.feishu.tools.base",
      to: "channels.feishu.tools.bitable",
    });
  }

  deleteAt(config, ["commands", "ownerDisplay"], changes);
  deleteAt(config, ["gateway", "controlUi", "allowInsecureAuth"], changes);
  deleteAt(config, ["gateway", "controlUi", "dangerouslyDisableDeviceAuth"], changes);
  deleteAt(config, ["gateway", "tailscale", "resetOnExit"], changes);
  deleteAt(config, ["hooks", "maxBodyBytes"], changes);

  const legacyModelCatalog = getAt(config, ["agents", "defaults", "models"]);
  if (isObject(legacyModelCatalog) && Object.keys(legacyModelCatalog).length > 0) {
    const defaults = ensureParent(config, ["agents", "defaults"]);
    defaults.modelPolicy ??= {};
    if (!isObject(defaults.modelPolicy)) fail("agents.defaults.modelPolicy must be an object");
    const modelRefs = Object.keys(legacyModelCatalog);
    if (defaults.modelPolicy.allow !== undefined) {
      if (!Array.isArray(defaults.modelPolicy.allow)) {
        fail("agents.defaults.modelPolicy.allow must be an array");
      }
      const missingRefs = modelRefs.filter((ref) => !defaults.modelPolicy.allow.includes(ref));
      if (missingRefs.length > 0) {
        fail(
          `Refusing to replace a partial agents.defaults.modelPolicy.allow; missing: ${missingRefs.join(", ")}`,
        );
      }
    } else {
      defaults.modelPolicy.allow = modelRefs;
      changes.push({
        action: "copy",
        from: "agents.defaults.models.{keys}",
        to: "agents.defaults.modelPolicy.allow",
      });
    }
  }

  const retiredPluginIds = new Set([
    "codex-supervisor",
    "phone-control",
    "ddingtalk",
    "openclaw-plugin-yuanbao",
    "wecom",
  ]);
  const enabledPluginIds = new Set(
    (config.plugins?.allow ?? []).filter((pluginId) => !retiredPluginIds.has(pluginId)),
  );
  for (const [pluginId, entry] of Object.entries(config.plugins?.entries ?? {})) {
    if (retiredPluginIds.has(pluginId)) {
      delete config.plugins.entries[pluginId];
      changes.push({ action: "remove", path: `plugins.entries.${pluginId}` });
      continue;
    }
    if (!isObject(entry) || entry.enabled !== false) enabledPluginIds.add(pluginId);
  }
  for (const [channelId, channel] of Object.entries(config.channels ?? {})) {
    if (!isObject(channel) || channel.enabled !== false) {
      enabledPluginIds.add(channelId === "wecom" ? "wecom-openclaw-plugin" : channelId);
    }
  }
  if (typeof config.tts?.provider === "string" && config.tts.provider.length > 0) {
    enabledPluginIds.add(config.tts.provider);
  }
  if (config.memory?.search) enabledPluginIds.add("memory-core");
  if (enabledPluginIds.size > 0) {
    config.plugins ??= {};
    config.plugins.allow = [...enabledPluginIds];
    changes.push({ action: "normalize", path: "plugins.allow" });
  }

  const pluginLoadPaths = getAt(config, ["plugins", "load", "paths"]);
  if (Array.isArray(pluginLoadPaths)) {
    let retainedPaths = pluginLoadPaths.filter(
      (pluginPath) =>
        typeof pluginPath !== "string" || !pluginPath.includes("/node_modules/@openclaw/feishu"),
    );
    if (retainedPaths.length !== pluginLoadPaths.length) {
      config.plugins.load.paths = retainedPaths;
      changes.push({
        action: "remove",
        path: "plugins.load.paths.{official-feishu-explicit-path}",
      });
    }
    if (options.workerPluginPath) {
      const workerPathIndexes = retainedPaths
        .map((pluginPath, index) =>
          typeof pluginPath === "string" &&
          pluginPath.includes("/agent-worker-isolation-v1/releases/")
            ? index
            : -1,
        )
        .filter((index) => index >= 0);
      if (workerPathIndexes.length !== 1) {
        fail(
          `Expected exactly one Worker release path, found ${workerPathIndexes.length}`,
        );
      }
      const index = workerPathIndexes[0];
      if (retainedPaths[index] !== options.workerPluginPath) {
        retainedPaths[index] = options.workerPluginPath;
        changes.push({
          action: "replace",
          path: "plugins.load.paths.{worker-release}",
        });
      }
    }
    config.plugins.load.paths = retainedPaths;
  }

  const projectSandbox = getAt(config, ["plugins", "entries", "project-sandbox"]);
  if (isObject(projectSandbox) && projectSandbox.enabled !== false) {
    projectSandbox.hooks ??= {};
    if (!isObject(projectSandbox.hooks)) {
      fail("plugins.entries.project-sandbox.hooks must be an object");
    }
    setEquivalent(
      projectSandbox.hooks,
      "allowConversationAccess",
      true,
      "plugins.entries.project-sandbox.hooks.allowConversationAccess",
    );
    changes.push({
      action: "add",
      path: "plugins.entries.project-sandbox.hooks.allowConversationAccess",
      value: true,
    });
  }

  const extensionPath = getAt(config, ["memory", "search", "store", "vector", "extensionPath"]);
  if (typeof extensionPath === "string" && options.openClawRoot) {
    const nextPath = path.join(options.openClawRoot, "node_modules", "sqlite-vec-linux-x64", "vec0.so");
    if (extensionPath !== nextPath) {
      config.memory.search.store.vector.extensionPath = nextPath;
      changes.push({ action: "replace", path: "memory.search.store.vector.extensionPath" });
    }
  }

  return { config, changes };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") options.input = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--openclaw-root") options.openClawRoot = argv[++index];
    else if (arg === "--system-agent-id") options.systemAgentId = argv[++index];
    else if (arg === "--worker-plugin-path") options.workerPluginPath = argv[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  if (!options.input || !options.output) {
    fail(
      "Usage: --input <path> --output <path> [--openclaw-root <path>] [--system-agent-id <id>] [--worker-plugin-path <path>]",
    );
  }
  return options;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const options = parseArgs(process.argv.slice(2));
  const input = JSON.parse(fs.readFileSync(options.input, "utf8"));
  const result = migrateOpenClaw2026081Config(input, options);
  fs.writeFileSync(options.output, `${JSON.stringify(result.config, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ ok: true, output: options.output, changes: result.changes }, null, 2)}\n`);
}
