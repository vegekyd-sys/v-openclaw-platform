import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  convertConfig,
  diffWorkerConfig,
  findWorkerLoadPaths,
  main,
  MOVED_CONFIG_KEYS,
  RefusedError,
} from "./noworker96-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, "fixtures", "noworker96");
const PLUGIN_PATH = "/srv/example/runtime/versa-runtime-providers-0.1.0";
const SECRET_FIXTURE_VALUES = [
  "synthetic-placeholder-not-a-secret",
  "synthetic-placeholder-app-key",
  "synthetic-placeholder-ak",
  "synthetic-placeholder-sk",
  "synthetic-placeholder-token",
  "${OPENCLAW_GATEWAY_TOKEN}",
  "${DEEPSEEK_API_KEY}",
];

const loadFixture = (name = "openclaw.json") =>
  JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));

function runtimeIds(config) {
  const ids = [];
  const visit = (value, at) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "agentRuntime") ids.push([`${at}.${key}`, child.id]);
      visit(child, `${at}.${key}`);
    }
  };
  visit(config, "");
  return ids;
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "noworker96-"));
}

function captureMain(argv) {
  const out = [];
  const err = [];
  const code = main(argv, { log: (line) => out.push(line), error: (line) => err.push(line) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("routes every vlab-worker runtime to openclaw and keeps codex and claude-cli", () => {
  const before = runtimeIds(loadFixture());
  const { config } = convertConfig(loadFixture(), { pluginPath: PLUGIN_PATH });
  const after = runtimeIds(config);
  assert.equal(after.length, before.length);
  for (const [at, id] of after) {
    const original = before.find(([other]) => other === at)[1];
    assert.equal(id, original === "vlab-worker" ? "openclaw" : original, at);
  }
  assert.ok(after.some(([, id]) => id === "codex"));
  assert.ok(after.some(([, id]) => id === "claude-cli"));
  assert.equal(config.models.providers.deepseek.agentRuntime.id, "openclaw");
  assert.equal(JSON.stringify(config).includes("vlab-worker\""), false);
});

test("disables the Worker plugin, unloads its path and loads versa-runtime-providers", () => {
  const { config } = convertConfig(loadFixture(), { pluginPath: PLUGIN_PATH });
  assert.deepEqual(config.plugins.entries["vlab-agent-worker-isolation"], { enabled: false });
  assert.deepEqual(config.plugins.load.paths, [
    "/srv/example/plugins/makaron-image",
    "/srv/example/plugins/v-browser/openclaw-plugin",
    PLUGIN_PATH,
  ]);
  const entry = config.plugins.entries["versa-runtime-providers"];
  assert.equal(entry.enabled, true);
  assert.deepEqual(entry.config, {
    fastCompactionModel: "azure-openai/gpt-5.5",
    fastCompactionMaxInputChars: 420000,
    fastCompactionMaxOutputTokens: 12000,
    fastCompactionMaxQualityRetries: 1,
  });
  assert.deepEqual(entry.llm, { allowModelOverride: true, allowedModels: ["azure-openai/gpt-5.5"] });
  assert.ok(config.plugins.allow.includes("versa-runtime-providers"));
  // Provider references are unchanged: the ids are the same, only the owner moved.
  assert.equal(config.talk.realtime.provider, "volcengine-rtc-agent");
  assert.equal(config.agents.defaults.compaction.provider, "versa-fast-quality-v1");
  assert.deepEqual(config.talk.realtime.providers, loadFixture().talk.realtime.providers);
});

test("moves only keys the new plugin's schema declares", () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(here, "..", "..", "release", "components", "versa-runtime-providers-0.1.0", "openclaw.plugin.json"),
      "utf8",
    ),
  );
  assert.deepEqual([...MOVED_CONFIG_KEYS].sort(), Object.keys(manifest.configSchema.properties).sort());
  const { config } = convertConfig(loadFixture(), { pluginPath: PLUGIN_PATH });
  for (const key of Object.keys(config.plugins.entries["versa-runtime-providers"].config)) {
    assert.ok(manifest.configSchema.properties[key], key);
  }
});

test("sets mcp.sessionIdleTtlMs only when absent and disables named MCP servers", () => {
  const { config } = convertConfig(loadFixture(), {
    pluginPath: PLUGIN_PATH,
    disableMcp: ["voice-memory"],
  });
  assert.equal(config.mcp.sessionIdleTtlMs, 300000);
  assert.equal(config.mcp.servers["voice-memory"].enabled, false);
  assert.equal(config.mcp.servers["universal-memory"].enabled, false);

  const preset = loadFixture();
  preset.mcp.sessionIdleTtlMs = 60000;
  assert.equal(convertConfig(preset, { pluginPath: PLUGIN_PATH }).config.mcp.sessionIdleTtlMs, 60000);
  assert.equal(
    convertConfig(loadFixture(), { pluginPath: PLUGIN_PATH }).config.mcp.servers["voice-memory"].enabled,
    true,
  );
});

test("is idempotent: a converted config converts to itself with no changes", () => {
  const first = convertConfig(loadFixture(), { pluginPath: PLUGIN_PATH, disableMcp: ["voice-memory"] });
  assert.ok(first.changes.length > 0);
  const second = convertConfig(first.config, { pluginPath: PLUGIN_PATH, disableMcp: ["voice-memory"] });
  assert.deepEqual(second.changes, []);
  assert.deepEqual(second.config, first.config);
});

test("finds the Worker path by manifest id before falling back to its name", () => {
  const dir = tempDir();
  const oddlyNamed = path.join(dir, "pool-plugin");
  fs.mkdirSync(oddlyNamed);
  fs.writeFileSync(
    path.join(oddlyNamed, "openclaw.plugin.json"),
    JSON.stringify({ id: "vlab-agent-worker-isolation" }),
  );
  assert.deepEqual(findWorkerLoadPaths(["/a/makaron-image", oddlyNamed, "/b/worker"]).matches, [oddlyNamed]);
  assert.deepEqual(findWorkerLoadPaths(["/a/makaron-image", "/srv/x/runtime/worker-95-final"]).matches, [
    "/srv/x/runtime/worker-95-final",
  ]);
  assert.deepEqual(findWorkerLoadPaths(["/a", "/b"], { workerPath: "/b" }).matches, ["/b"]);
  assert.throws(() => findWorkerLoadPaths(["/a/worker", "/b/worker-2"]), RefusedError);
});

test("refuses shapes it was not built for, before changing anything", () => {
  const cases = [
    ["no plugins", (c) => delete c.plugins, /plugins is missing/],
    ["string runtime", (c) => (c.agents.defaults.models["openai/*"].agentRuntime = "vlab-worker"), /agentRuntime is not an object/],
    ["stray reference", (c) => (c.agents.defaults.embeddedHarness = { runtime: "vlab-worker" }), /still referenced outside agentRuntime\.id at agents\.defaults\.embeddedHarness\.runtime/],
    ["no worker, no providers", (c) => delete c.plugins.entries["vlab-agent-worker-isolation"], /not a V Gateway config/],
    ["unknown MCP server", (c) => c, /mcp\.servers\.nope does not exist/, ["nope"]],
    ["worker path unknown", (c) => (c.plugins.load.paths = ["/srv/example/plugins/makaron-image"]), /none of plugins\.load\.paths/],
    ["load paths not strings", (c) => (c.plugins.load.paths = [1]), /not an array of strings/],
    ["denied plugin", (c) => (c.plugins.deny = ["versa-runtime-providers"]), /plugins\.deny/],
  ];
  for (const [name, mutate, message, disableMcp] of cases) {
    const config = loadFixture();
    mutate(config);
    const snapshot = JSON.stringify(config);
    assert.throws(() => convertConfig(config, { pluginPath: PLUGIN_PATH, disableMcp }), (error) => {
      assert.ok(error instanceof RefusedError, name);
      assert.match(error.message, message, name);
      return true;
    });
    assert.equal(JSON.stringify(config), snapshot, `${name}: input mutated`);
  }
});

test("reports Worker-config settings that stop applying, by path only", () => {
  const { config } = convertConfig(loadFixture(), { pluginPath: PLUGIN_PATH });
  const drift = diffWorkerConfig(config, loadFixture("worker-openclaw.json"));
  assert.deepEqual(drift.onlyInWorker, ["agents.entries.dealclaw"]);
  assert.deepEqual(drift.differ, ["channels.feishu.renderMode"]);
});

test("CLI writes a backup, prints keys but never credential values, and is a no-op the second time", () => {
  const dir = tempDir();
  const configPath = path.join(dir, "openclaw.json");
  fs.copyFileSync(path.join(fixtureDir, "openclaw.json"), configPath);
  fs.chmodSync(configPath, 0o600);
  const original = fs.readFileSync(configPath, "utf8");
  const args = [
    "--config", configPath,
    "--plugin-path", PLUGIN_PATH,
    "--worker-config", path.join(fixtureDir, "worker-openclaw.json"),
    "--disable-mcp", "voice-memory",
  ];

  const first = captureMain(args);
  assert.equal(first.code, 0, first.err);
  const backups = fs.readdirSync(dir).filter((name) => name.startsWith("openclaw.json.pre-noworker-"));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, backups[0]), "utf8"), original);
  assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(dir, backups[0])).mode & 0o777, 0o600);
  const written = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(written.plugins.entries["vlab-agent-worker-isolation"].enabled, false);
  for (const secret of SECRET_FIXTURE_VALUES) {
    assert.equal(first.out.includes(secret), false, `summary printed ${secret}`);
  }
  assert.match(first.out, /agents\.defaults\.models\["deepseek\/deepseek-v4-flash"\]\.agentRuntime\.id: set "openclaw"/);
  assert.match(first.out, /only in worker: agents\.entries\.dealclaw/);

  const second = captureMain(args);
  assert.equal(second.code, 0, second.err);
  assert.match(second.out, /^unchanged: /);
  assert.match(second.out, /0 change\(s\)/);
  assert.equal(
    fs.readdirSync(dir).filter((name) => name.startsWith("openclaw.json.pre-noworker-")).length,
    1,
  );
});

test("CLI refuses with exit 2 and writes nothing", () => {
  const dir = tempDir();
  const configPath = path.join(dir, "openclaw.json");
  fs.writeFileSync(configPath, "{ // json5\n plugins: {} }\n");
  const result = captureMain(["--config", configPath, "--plugin-path", PLUGIN_PATH]);
  assert.equal(result.code, 2);
  assert.match(result.err, /not strict JSON/);
  assert.deepEqual(fs.readdirSync(dir), ["openclaw.json"]);
  assert.equal(captureMain(["--config", configPath]).code, 1);
});

test("dry run changes nothing on disk", () => {
  const dir = tempDir();
  const configPath = path.join(dir, "openclaw.json");
  fs.copyFileSync(path.join(fixtureDir, "openclaw.json"), configPath);
  const before = fs.readFileSync(configPath, "utf8");
  const result = captureMain(["--config", configPath, "--plugin-path", PLUGIN_PATH, "--dry-run", "--json"]);
  assert.equal(result.code, 0, result.err);
  assert.equal(JSON.parse(result.out).mode, "dry-run");
  assert.equal(fs.readFileSync(configPath, "utf8"), before);
  assert.deepEqual(fs.readdirSync(dir), ["openclaw.json"]);
});
