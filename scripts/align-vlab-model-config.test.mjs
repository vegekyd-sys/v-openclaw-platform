import { test } from "node:test";
import assert from "node:assert/strict";
import { exportModels, applyModels, missingCredentials } from "./align-vlab-model-config.mjs";

const v = () => ({
  models: { providers: {
    deepseek: { baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-V-SECRET", timeoutSeconds: 90, models: [{ id: "deepseek-flash", contextWindow: 980000 }] },
    "azure-openai": { baseUrl: "https://example.openai.azure.com/openai/v1", apiKey: "AZ-SECRET", auth: "api-key", models: [] },
    openai: { models: [{ id: "gpt-6-luna", contextTokens: 850000 }] },
  } },
  agents: { defaults: { model: { primary: "deepseek/deepseek-flash", fallbacks: ["openai/gpt-6-luna"] }, models: { "openai/gpt-6-luna": { alias: "luna" } }, modelPolicy: { allow: ["openai/gpt-6-luna"] }, compaction: { mode: "safeguard" }, workspace: "/v" },
    entries: { makaron: { models: { "openai/gpt-6-luna": { alias: "luna" } }, workspace: "/v/makaron" }, "hy-codex": { models: {} } } },
});
const vlab = () => ({
  models: { providers: { deepseek: { baseUrl: "https://api.deepseek.com/v1", apiKey: "${DEEPSEEK_API_KEY}", timeoutSeconds: 300, models: [] }, stale: { baseUrl: "https://x" } } },
  agents: { defaults: { model: { primary: "deepseek/deepseek-flash", fallbacks: [] }, workspace: "/vlab" }, entries: { makaron: { models: {}, workspace: "/vlab/makaron" }, labonly: { models: { a: {} } } } },
});

test("export never carries credentials", () => {
  const s = JSON.stringify(exportModels(v()));
  assert(!s.includes("SECRET"));
  assert.equal(exportModels(v()).providers["azure-openai"].auth, "api-key", "an auth mode is not a credential");
});

test("apply takes V's model sections, keeps VLab's credentials, paths and agents", () => {
  const config = vlab();
  const changed = applyModels(config, exportModels(v()));
  assert(changed.includes("models.providers.stale (removed)"));
  assert.equal(config.models.providers.deepseek.apiKey, "${DEEPSEEK_API_KEY}");
  assert.equal(config.models.providers.deepseek.timeoutSeconds, 90);
  assert.equal(config.models.providers["azure-openai"].apiKey, undefined);
  assert.deepEqual(config.agents.defaults.model.fallbacks, ["openai/gpt-6-luna"]);
  assert.equal(config.agents.defaults.workspace, "/vlab");
  assert.equal(config.agents.entries.makaron.workspace, "/vlab/makaron");
  assert.deepEqual(config.agents.entries.labonly.models, { a: {} });
  assert.equal(config.agents.entries["hy-codex"], undefined, "agents V has and VLab does not are not created");
  assert.deepEqual(missingCredentials(config), ["azure-openai"]);
  assert.deepEqual(applyModels(config, exportModels(v())), [], "idempotent");
});
