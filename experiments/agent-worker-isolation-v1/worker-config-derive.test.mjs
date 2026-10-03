import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  WORKER_CONFIG_OVERLAY,
  deriveWorkerConfig,
  deriveWorkerConfigFile,
  diffConfigPaths,
  summarizeDerivation,
  validateWorkerConfig,
} from "./worker-config-derive.mjs";

// Sanitized shape of production V (2026-10-03). No real secrets: every
// credential below is a fake marker, an env reference or a SecretRef object.
const FAKE_SECRET = "sk-fake-gateway-secret-do-not-log";

function gatewayFixture() {
  return {
    agents: {
      defaults: {
        compaction: { mode: "safeguard", provider: "versa-fast-quality-v1" },
        model: { primary: "deepseek/deepseek-v4-flash", fallbacks: [] },
        imageModel: {
          primary: "xai/grok-4.6",
          fallbacks: ["azure-openai/gpt-5.6-sol"],
        },
        modelSelectionScope: "session",
        modelPolicy: {
          allow: [
            "deepseek/deepseek-v4-flash",
            "deepseek/vds-deepseek-flash",
            "anthropic/claude-opus-5-5",
            "xai/*",
            "azure-openai/gpt-5.6-sol",
          ],
        },
        models: {
          "deepseek/deepseek-v4-flash": {
            alias: "ds-flash",
            agentRuntime: { id: "vlab-worker" },
          },
          "deepseek/vds-deepseek-flash": {
            alias: "vds",
            params: { thinking: "high" },
            agentRuntime: { id: "codex" },
          },
          "anthropic/claude-opus-5-5": {
            alias: "vcc",
            agentRuntime: { id: "claude-cli" },
          },
          "openai/gpt-5.6-sol": {
            alias: "vcodex56",
            params: { thinking: "medium" },
            agentRuntime: { id: "vlab-worker" },
          },
          "xai/grok-4.7": { alias: "Grok", agentRuntime: { id: "vlab-worker" } },
        },
      },
      entries: {
        makaron: {
          workspace: "/srv/workspace",
          models: {
            "deepseek/deepseek-flash": {
              alias: "deepseek",
              agentRuntime: { id: "vlab-worker" },
            },
            "openai/gpt-5.6-sol": {
              alias: "vcodex56",
              agentRuntime: { id: "codex" },
            },
          },
        },
        "hy-codex": {
          model: { primary: "openai/gpt-5.6-sol", fallbacks: [] },
        },
      },
    },
    models: {
      providers: {
        deepseek: {
          baseUrl: "https://api.deepseek.example",
          apiKey: "${DEEPSEEK_API_KEY}",
          agentRuntime: { id: "vlab-worker" },
          models: [{ id: "deepseek-v4-flash" }, { id: "vds-deepseek-flash" }],
        },
        "azure-openai": {
          baseUrl: "https://new-endpoint.example",
          apiKey: FAKE_SECRET,
          agentRuntime: { id: "vlab-worker" },
          models: [{ id: "gpt-5.6-sol" }],
        },
        xai: {
          apiKey: { source: "env", provider: "default", id: "XAI_API_KEY" },
          models: [{ id: "grok-4.7", contextWindow: 2000000 }],
        },
      },
    },
    auth: { profiles: { "openrouter:manual": { provider: "openrouter", mode: "api_key" } } },
    session: {
      maintenance: {
        mode: "enforce",
        pruneAfter: "14d",
        maxEntries: 6000,
        maxDiskBytes: "32gb",
      },
    },
    plugins: {
      allow: ["deepseek", "codex", "vlab-agent-worker-isolation", "nightshift-feishu"],
      load: { paths: ["/opt/worker", "/opt/nightshift"] },
      entries: {
        deepseek: { enabled: true },
        "nightshift-feishu": { enabled: true },
        "vlab-agent-worker-isolation": {
          enabled: true,
          config: {
            minWorkers: 5,
            workerConfigPath: "/state/worker-openclaw.json",
            gatewayConfigPath: "/state/openclaw.json",
          },
        },
      },
    },
    channels: { feishu: { enabled: true, appSecret: { source: "file", provider: "skillhub", id: "/feishu" } } },
  };
}

// The stale hand-copied Worker config: older allow list, missing models,
// a worker-only auth profile and provider model, and a stale alias.
function staleWorkerFixture() {
  const worker = deriveWorkerConfig(gatewayFixture());
  worker.agents.defaults.modelPolicy.allow = ["deepseek/deepseek-v4-flash", "xai/*"];
  delete worker.agents.defaults.models["anthropic/claude-opus-5-5"];
  delete worker.agents.defaults.modelSelectionScope;
  worker.agents.defaults.models["openai/gpt-5.6-sol"].alias = "openai-gpt5.6";
  worker.auth.profiles["anthropic:claude-cli"] = { provider: "claude-cli", mode: "oauth" };
  worker.models.providers["azure-openai"].models.push({ id: "gpt-5.5" });
  worker.models.providers["azure-openai"].apiKey = "sk-fake-stale-worker-secret";
  worker.session.maintenance = { mode: "warn", maxEntries: 2000 };
  return worker;
}

function tempDir() {
  return mkdtempSync(resolve(tmpdir(), "worker-config-derive-"));
}

test("maps only Gateway-routed runtime ids to the embedded runtime", () => {
  const derived = deriveWorkerConfig(gatewayFixture());
  const models = derived.agents.defaults.models;
  assert.equal(models["deepseek/deepseek-v4-flash"].agentRuntime.id, "openclaw");
  assert.equal(models["openai/gpt-5.6-sol"].agentRuntime.id, "openclaw");
  assert.equal(models["xai/grok-4.7"].agentRuntime.id, "openclaw");
  assert.equal(models["deepseek/vds-deepseek-flash"].agentRuntime.id, "codex");
  assert.equal(models["anthropic/claude-opus-5-5"].agentRuntime.id, "claude-cli");
  const makaron = derived.agents.entries.makaron.models;
  assert.equal(makaron["deepseek/deepseek-flash"].agentRuntime.id, "openclaw");
  assert.equal(makaron["openai/gpt-5.6-sol"].agentRuntime.id, "codex");
  assert.equal(derived.models.providers.deepseek.agentRuntime.id, "openclaw");
  assert.equal(derived.models.providers["azure-openai"].agentRuntime.id, "openclaw");
});

test("maps the string form of agentRuntime too", () => {
  const gateway = { agents: { defaults: { models: { m: { agentRuntime: "vlab-worker" } } } } };
  assert.equal(deriveWorkerConfig(gateway).agents.defaults.models.m.agentRuntime, "openclaw");
});

test("does not rewrite runtime ids outside the overlay scopes", () => {
  const gateway = gatewayFixture();
  gateway.plugins.entries["vlab-agent-worker-isolation"].config.agentRuntime = {
    id: "vlab-worker",
  };
  const derived = deriveWorkerConfig(gateway);
  assert.equal(
    derived.plugins.entries["vlab-agent-worker-isolation"].config.agentRuntime.id,
    "vlab-worker",
  );
});

test("mirrors every Gateway model, allow entry, agent and alias", () => {
  const gateway = gatewayFixture();
  const derived = deriveWorkerConfig(gateway);
  assert.deepEqual(
    derived.agents.defaults.modelPolicy.allow,
    gateway.agents.defaults.modelPolicy.allow,
  );
  assert.deepEqual(
    Object.keys(derived.agents.defaults.models).sort(),
    Object.keys(gateway.agents.defaults.models).sort(),
  );
  assert.equal(derived.agents.defaults.models["openai/gpt-5.6-sol"].alias, "vcodex56");
  assert.deepEqual(derived.agents.entries["hy-codex"], gateway.agents.entries["hy-codex"]);
  assert.equal(derived.agents.defaults.modelSelectionScope, "session");
  assert.deepEqual(derived.plugins, gateway.plugins);
  assert.deepEqual(derived.channels, gateway.channels);
  assert.deepEqual(derived.agents.defaults.compaction, gateway.agents.defaults.compaction);
});

test("keeps Gateway-only session maintenance out of Workers", () => {
  const derived = deriveWorkerConfig(gatewayFixture());
  assert.deepEqual(derived.session.maintenance, {
    mode: "warn",
    pruneAfter: "14d",
    maxEntries: 6000,
    maxDiskBytes: "32gb",
  });
  const bare = deriveWorkerConfig({ agents: {} });
  assert.deepEqual(bare.session, { maintenance: { mode: "warn" } });
});

test("keeps secret references as references and never resolves them", () => {
  process.env.DEEPSEEK_API_KEY = "resolved-value-must-not-appear";
  process.env.XAI_API_KEY = "resolved-value-must-not-appear";
  try {
    const derived = deriveWorkerConfig(gatewayFixture());
    assert.equal(derived.models.providers.deepseek.apiKey, "${DEEPSEEK_API_KEY}");
    assert.deepEqual(derived.models.providers.xai.apiKey, {
      source: "env",
      provider: "default",
      id: "XAI_API_KEY",
    });
    assert.deepEqual(derived.channels.feishu.appSecret, {
      source: "file",
      provider: "skillhub",
      id: "/feishu",
    });
    assert.equal(
      JSON.stringify(derived).includes("resolved-value-must-not-appear"),
      false,
    );
  } finally {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.XAI_API_KEY;
  }
});

test("drops Worker-only drift instead of carrying it forward", () => {
  const derived = deriveWorkerConfig(gatewayFixture());
  assert.equal("anthropic:claude-cli" in derived.auth.profiles, false);
  assert.deepEqual(
    derived.models.providers["azure-openai"].models.map((m) => m.id),
    ["gpt-5.6-sol"],
  );
});

test("does not mutate the Gateway config or the overlay", () => {
  const gateway = gatewayFixture();
  const snapshot = structuredClone(gateway);
  const overlaySnapshot = JSON.stringify(WORKER_CONFIG_OVERLAY);
  deriveWorkerConfig(gateway);
  assert.deepEqual(gateway, snapshot);
  assert.equal(JSON.stringify(WORKER_CONFIG_OVERLAY), overlaySnapshot);
  assert.equal(Object.isFrozen(WORKER_CONFIG_OVERLAY.set[0]), true);
});

test("is deterministic", () => {
  assert.equal(
    JSON.stringify(deriveWorkerConfig(gatewayFixture())),
    JSON.stringify(deriveWorkerConfig(gatewayFixture())),
  );
});

test("rejects non-object Gateway configs", () => {
  assert.throws(() => deriveWorkerConfig(null), /JSON object/);
  assert.throws(() => deriveWorkerConfig([]), /JSON object/);
});

test("validation catches leaked Gateway runtime ids and missing models", () => {
  const gateway = gatewayFixture();
  assert.deepEqual(validateWorkerConfig(deriveWorkerConfig(gateway), gateway), []);

  const noMapping = { ...WORKER_CONFIG_OVERLAY, runtimeIdMap: {} };
  const leaked = deriveWorkerConfig(gateway, noMapping);
  assert.match(
    validateWorkerConfig(leaked, gateway).join("\n"),
    /agents: \d+ Gateway-only runtime id\(s\) left/,
  );
  assert.match(
    validateWorkerConfig(leaked, gateway).join("\n"),
    /models\.providers: \d+ Gateway-only runtime id/,
  );

  const stale = staleWorkerFixture();
  const problems = validateWorkerConfig(stale, gateway).join("\n");
  assert.match(problems, /modelPolicy\.allow: 3 Gateway entries missing/);
  assert.match(problems, /agents\.defaults\.models: 1 models missing/);

  const noPlugin = deriveWorkerConfig(gateway);
  noPlugin.plugins.entries["vlab-agent-worker-isolation"].enabled = false;
  assert.match(
    validateWorkerConfig(noPlugin, gateway).join("\n"),
    /vlab-agent-worker-isolation is not enabled/,
  );
});

test("diff reports paths, quotes dotted keys and never values", () => {
  const paths = diffConfigPaths(staleWorkerFixture(), deriveWorkerConfig(gatewayFixture()));
  assert.ok(paths.includes('agents.defaults.models["anthropic/claude-opus-5-5"]'));
  assert.ok(paths.includes('agents.defaults.models["openai/gpt-5.6-sol"].alias'));
  assert.ok(paths.includes("agents.defaults.modelPolicy.allow"));
  assert.ok(paths.includes("agents.defaults.modelSelectionScope"));
  assert.ok(paths.includes('auth.profiles["anthropic:claude-cli"]'));
  assert.ok(paths.includes("models.providers.azure-openai.apiKey"));
  assert.ok(paths.includes("session.maintenance.maxEntries"));
  assert.equal(paths.join(" ").includes("sk-fake"), false);
  assert.deepEqual(diffConfigPaths({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diffConfigPaths(1, 2), ["(root)"]);
});

test("rewrites a stale Worker config atomically, keeps its mode, then is a no-op", () => {
  const directory = tempDir();
  const gatewayConfigPath = resolve(directory, "openclaw.json");
  const workerConfigPath = resolve(directory, "worker-openclaw.json");
  writeFileSync(gatewayConfigPath, JSON.stringify(gatewayFixture()));
  writeFileSync(workerConfigPath, JSON.stringify(staleWorkerFixture()));
  chmodSync(workerConfigPath, 0o640);
  const logs = [];
  const logger = { info: (m) => logs.push(["info", m]), error: (m) => logs.push(["error", m]) };

  const first = deriveWorkerConfigFile({ gatewayConfigPath, workerConfigPath, logger });
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.equal(first.overlayVersion, WORKER_CONFIG_OVERLAY.version);
  assert.ok(first.changedPaths.includes("agents.defaults.modelPolicy.allow"));
  assert.equal(statSync(workerConfigPath).mode & 0o777, 0o640);
  const written = JSON.parse(readFileSync(workerConfigPath, "utf8"));
  assert.deepEqual(written, deriveWorkerConfig(gatewayFixture()));
  assert.deepEqual(validateWorkerConfig(written, gatewayFixture()), []);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "info");
  assert.match(logs[0][1], /overlay v1\): rewrote Worker config, \d+ changed path\(s\): /);
  assert.equal(logs[0][1].includes("sk-fake"), false);
  assert.deepEqual(
    readdirSync(directory).filter((name) => name.includes(".derive-")),
    [],
  );

  const mtime = statSync(workerConfigPath).mtimeMs;
  const second = deriveWorkerConfigFile({ gatewayConfigPath, workerConfigPath, logger });
  assert.equal(second.ok, true);
  assert.equal(second.changed, false);
  assert.deepEqual(second.changedPaths, []);
  assert.equal(statSync(workerConfigPath).mtimeMs, mtime);
  assert.match(logs[1][1], /already current/);
});

test("ignores formatting and key order when deciding whether to write", () => {
  const directory = tempDir();
  const gatewayConfigPath = resolve(directory, "openclaw.json");
  const workerConfigPath = resolve(directory, "worker-openclaw.json");
  writeFileSync(gatewayConfigPath, JSON.stringify(gatewayFixture()));
  const derived = deriveWorkerConfig(gatewayFixture());
  const reordered = Object.fromEntries(Object.entries(derived).reverse());
  writeFileSync(workerConfigPath, JSON.stringify(reordered));
  const before = readFileSync(workerConfigPath, "utf8");
  const result = deriveWorkerConfigFile({ gatewayConfigPath, workerConfigPath });
  assert.equal(result.changed, false);
  assert.equal(readFileSync(workerConfigPath, "utf8"), before);
});

test("picks up a model added to the Gateway config on the next derivation", () => {
  const directory = tempDir();
  const gatewayConfigPath = resolve(directory, "openclaw.json");
  const workerConfigPath = resolve(directory, "worker-openclaw.json");
  const gateway = gatewayFixture();
  writeFileSync(gatewayConfigPath, JSON.stringify(gateway));
  deriveWorkerConfigFile({ gatewayConfigPath, workerConfigPath });

  gateway.agents.defaults.modelPolicy.allow.push("moonshot/kimi-k3");
  gateway.agents.defaults.models["moonshot/kimi-k3"] = {
    alias: "kimi-k3",
    agentRuntime: { id: "vlab-worker" },
  };
  writeFileSync(gatewayConfigPath, JSON.stringify(gateway));
  const result = deriveWorkerConfigFile({ gatewayConfigPath, workerConfigPath });
  assert.equal(result.changed, true);
  assert.deepEqual(result.changedPaths.sort(), [
    "agents.defaults.modelPolicy.allow",
    'agents.defaults.models["moonshot/kimi-k3"]',
  ]);
  const worker = JSON.parse(readFileSync(workerConfigPath, "utf8"));
  assert.ok(worker.agents.defaults.modelPolicy.allow.includes("moonshot/kimi-k3"));
  assert.equal(worker.agents.defaults.models["moonshot/kimi-k3"].agentRuntime.id, "openclaw");
});

test("creates a missing Worker config with owner-only permissions", () => {
  const directory = tempDir();
  const gatewayConfigPath = resolve(directory, "openclaw.json");
  const workerConfigPath = resolve(directory, "worker-openclaw.json");
  writeFileSync(gatewayConfigPath, JSON.stringify(gatewayFixture()));
  const result = deriveWorkerConfigFile({ gatewayConfigPath, workerConfigPath });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.changedPaths, ["(root)"]);
  assert.equal(statSync(workerConfigPath).mode & 0o777, 0o600);
});

test("replaces an unparsable Worker config", () => {
  const directory = tempDir();
  const gatewayConfigPath = resolve(directory, "openclaw.json");
  const workerConfigPath = resolve(directory, "worker-openclaw.json");
  writeFileSync(gatewayConfigPath, JSON.stringify(gatewayFixture()));
  writeFileSync(workerConfigPath, "{ truncated");
  const result = deriveWorkerConfigFile({ gatewayConfigPath, workerConfigPath });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(JSON.parse(readFileSync(workerConfigPath, "utf8")), deriveWorkerConfig(gatewayFixture()));
});

test("keeps the existing Worker config when the Gateway config is unreadable", () => {
  const directory = tempDir();
  const gatewayConfigPath = resolve(directory, "openclaw.json");
  const workerConfigPath = resolve(directory, "worker-openclaw.json");
  writeFileSync(gatewayConfigPath, `{"apiKey": "${FAKE_SECRET}", broken`);
  const stale = JSON.stringify(staleWorkerFixture());
  writeFileSync(workerConfigPath, stale);
  const logs = [];
  const result = deriveWorkerConfigFile({
    gatewayConfigPath,
    workerConfigPath,
    logger: { info: (m) => logs.push(["info", m]), error: (m) => logs.push(["error", m]) },
  });
  assert.equal(result.ok, false);
  assert.equal(result.changed, false);
  assert.match(result.error, /Gateway config is not valid JSON/);
  assert.equal(result.error.includes(FAKE_SECRET), false);
  assert.equal(readFileSync(workerConfigPath, "utf8"), stale);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "error");
  assert.match(logs[0][1], /FAILED, kept the existing Worker config/);
  assert.equal(logs[0][1].includes(FAKE_SECRET), false);
});

test("keeps the existing Worker config when validation fails", () => {
  const directory = tempDir();
  const gatewayConfigPath = resolve(directory, "openclaw.json");
  const workerConfigPath = resolve(directory, "worker-openclaw.json");
  writeFileSync(gatewayConfigPath, JSON.stringify(gatewayFixture()));
  writeFileSync(workerConfigPath, "{}\n");
  const result = deriveWorkerConfigFile({
    gatewayConfigPath,
    workerConfigPath,
    overlay: { ...WORKER_CONFIG_OVERLAY, runtimeIdMap: {} },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /derived Worker config is invalid/);
  assert.equal(readFileSync(workerConfigPath, "utf8"), "{}\n");
});

test("refuses unsafe paths without throwing", () => {
  const directory = tempDir();
  const same = resolve(directory, "openclaw.json");
  writeFileSync(same, JSON.stringify(gatewayFixture()));
  assert.match(
    deriveWorkerConfigFile({ gatewayConfigPath: same, workerConfigPath: same }).error,
    /must be different/,
  );
  assert.match(
    deriveWorkerConfigFile({ gatewayConfigPath: "openclaw.json", workerConfigPath: same }).error,
    /absolute path/,
  );
  assert.match(deriveWorkerConfigFile().error, /gatewayConfigPath is required/);
  assert.equal(
    deriveWorkerConfigFile({
      gatewayConfigPath: resolve(directory, "missing.json"),
      workerConfigPath: resolve(directory, "worker.json"),
    }).ok,
    false,
  );
  assert.equal(existsSync(resolve(directory, "worker.json")), false);
});

test("summaries stay one line and cap the path list", () => {
  const changedPaths = Array.from({ length: 40 }, (_, i) => `p${i}`);
  const line = summarizeDerivation({ ok: true, changed: true, overlayVersion: 1, changedPaths });
  assert.equal(line.includes("\n"), false);
  assert.match(line, /40 changed path\(s\)/);
  assert.match(line, /\(\+15 more\)$/);
});
