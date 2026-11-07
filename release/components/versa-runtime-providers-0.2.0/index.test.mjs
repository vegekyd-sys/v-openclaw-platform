import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import plugin, {
  DEFAULT_FAST_COMPACTION_MODEL,
  PLUGIN_ID,
  resolveFastCompactionSettings,
} from "./index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "openclaw.plugin.json"), "utf8"));
// The Worker plugin as V last ran it (captured production bytes, 2026-10-13).
const workerDir = join(here, "..", "..", "captured", "voice-streamed-hangup-20261013b.worker", "dist");

const VALID_SUMMARY = [
  "## Decisions",
  "- keep",
  "## Open TODOs",
  "- none",
  "## Constraints/Rules",
  "- none",
  "## Pending user asks",
  "- none",
  "## Exact identifiers",
  "- oc_1234567890abcdef",
].join("\n");

/**
 * A plugin API that only offers what this plugin is allowed to use. Any other
 * member access (hooks, gateway methods, harnesses, services) fails the test,
 * so a Worker-only registration sneaking back in is caught here.
 */
function createFakeApi({ pluginConfig = {}, config = {}, complete } = {}) {
  const registered = { compaction: [], llmCalls: [], logs: [] };
  const allowed = {
    id: PLUGIN_ID,
    pluginConfig,
    config,
    logger: {
      info: (message) => registered.logs.push(message),
      warn: (message) => registered.logs.push(message),
      error: (message) => registered.logs.push(message),
      debug: () => {},
    },
    runtime: {
      llm: {
        complete: async (params) => {
          registered.llmCalls.push(params);
          return complete ? complete(params) : { text: VALID_SUMMARY };
        },
      },
    },
    registerCompactionProvider: (provider) => registered.compaction.push(provider),
  };
  const api = new Proxy(allowed, {
    get(target, key) {
      if (typeof key === "symbol" || key in target) return target[key];
      throw new Error(`plugin touched api.${String(key)}, which no-worker mode does not provide for it`);
    },
  });
  return { api, registered };
}

test("manifest id, package entry and plugin id agree", () => {
  const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
  assert.equal(manifest.id, PLUGIN_ID);
  assert.equal(plugin.id, PLUGIN_ID);
  assert.deepEqual(pkg.openclaw.extensions, ["./index.mjs"]);
  assert.equal(manifest.activation.onStartup, true);
  assert.equal(manifest.contracts, undefined);
});

test("registers exactly the compaction provider the config names", () => {
  const { api, registered } = createFakeApi();
  plugin.register(api);
  assert.deepEqual(
    registered.compaction.map((provider) => provider.id),
    ["versa-fast-quality-v1"],
  );
  assert.equal(typeof registered.compaction[0].summarize, "function");
});

test("compaction runs through api.runtime.llm.complete with the Worker plugin's model precedence", async () => {
  const { api, registered } = createFakeApi({
    pluginConfig: { fastCompactionModel: " azure-openai/gpt-5.5 ", fastCompactionMaxOutputTokens: 9000 },
    config: { agents: { defaults: { compaction: { model: "deepseek/deepseek-v4-pro" } } } },
  });
  plugin.register(api);
  const summary = await registered.compaction[0].summarize({
    messages: [{ role: "user", content: "hello oc_1234567890abcdef" }],
  });
  assert.match(summary, /## Decisions/);
  assert.equal(registered.llmCalls.length, 1);
  assert.equal(registered.llmCalls[0].model, "azure-openai/gpt-5.5");
  assert.equal(registered.llmCalls[0].maxTokens, 9000);
  assert.equal(registered.llmCalls[0].purpose, "versa-fast-quality-compaction");
});

test("fast compaction settings fall back exactly like the Worker plugin", () => {
  assert.deepEqual(resolveFastCompactionSettings(undefined, undefined), {
    model: DEFAULT_FAST_COMPACTION_MODEL,
    maxInputChars: 420_000,
    maxOutputTokens: 12_000,
    maxQualityRetries: 1,
  });
  assert.equal(
    resolveFastCompactionSettings(
      { fastCompactionModel: "  " },
      { agents: { defaults: { compaction: { model: "deepseek/deepseek-v4-pro" } } } },
    ).model,
    "deepseek/deepseek-v4-pro",
  );
  assert.equal(
    resolveFastCompactionSettings({ fastCompactionMaxQualityRetries: 0 }, {}).maxQualityRetries,
    0,
  );
});

test("every pluginConfig key the code reads is declared, and nothing else is", () => {
  const source = readFileSync(join(here, "index.mjs"), "utf8");
  const read = new Set([...source.matchAll(/pluginConfig\?\.(\w+)/gu)].map((match) => match[1]));
  const declared = new Set(Object.keys(manifest.configSchema.properties));
  assert.equal(manifest.configSchema.additionalProperties, false);
  assert.deepEqual([...read].sort(), [...declared].sort());
});

test("declared config keys keep the Worker plugin's schema, so a moved config block validates", {
  skip: !existsSync(join(workerDir, "openclaw.plugin.json")) && "worker component not present",
}, () => {
  const worker = JSON.parse(readFileSync(join(workerDir, "openclaw.plugin.json"), "utf8"));
  for (const [key, schema] of Object.entries(manifest.configSchema.properties)) {
    assert.deepEqual(schema, worker.configSchema.properties[key], key);
  }
});

test("provider modules are byte-identical to the Worker plugin's", {
  skip: !existsSync(workerDir) && "worker component not present",
}, () => {
  for (const file of ["fast-compaction-provider.mjs"]) {
    assert.equal(
      readFileSync(join(here, file), "utf8"),
      readFileSync(join(workerDir, file), "utf8"),
      file,
    );
  }
});

test("imports nothing but node builtins and its own provider module", () => {
  const allowedLocal = new Set(["./fast-compaction-provider.mjs"]);
  for (const file of ["index.mjs", "fast-compaction-provider.mjs"]) {
    const source = readFileSync(join(here, file), "utf8");
    const specifiers = [
      ...source.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gmu),
      ...source.matchAll(/import\(\s*["'`]([^"'`]+)["'`]\s*\)/gu),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      assert.ok(
        specifier.startsWith("node:") || allowedLocal.has(specifier),
        `${file} imports ${specifier}`,
      );
    }
    assert.doesNotMatch(source, /VLAB_WORKER_CHILD|worker-pool|resolveOpenClawAgentRuntimePath/u, file);
  }
});
