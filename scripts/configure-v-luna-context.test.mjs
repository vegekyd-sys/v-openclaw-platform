import { test } from "node:test";
import assert from "node:assert/strict";
import { setLunaRow, lunaRow, LUNA_ROW } from "./configure-v-luna-context.mjs";

const TERRA = { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", api: "openai-chatgpt-responses", contextWindow: 500000, contextTokens: 272000, maxTokens: 128000 };
const v = () => ({ models: { providers: {
  openai: { models: [structuredClone(TERRA)] },
  deepseek: { models: [{ id: "deepseek-flash", contextWindow: 980000, maxTokens: 64000 }] },
} } });

test("the row gives luna 850k under its window and under the 872k backend limit", () => {
  assert.equal(LUNA_ROW.contextTokens, 850000);
  assert(LUNA_ROW.contextTokens <= LUNA_ROW.contextWindow, "the Gateway answers min(contextTokens, contextWindow)");
  assert(LUNA_ROW.contextTokens < 872000);
});

test("apply adds the row, keeps terra and other providers, and is idempotent", () => {
  const config = v();
  assert.equal(setLunaRow(config, true), true);
  assert.deepEqual(lunaRow(config), LUNA_ROW);
  assert.deepEqual(config.models.providers.openai.models[0], TERRA);
  assert.deepEqual(config.models.providers.deepseek, v().models.providers.deepseek);
  assert.equal(setLunaRow(config, true), false);
  assert.equal(setLunaRow(config, false), true, "restore removes it");
  assert.deepEqual(config, v());
  assert.equal(setLunaRow(config, false), false);
});

test("a drifted luna row is replaced, not duplicated", () => {
  const config = v();
  config.models.providers.openai.models.push({ id: "gpt-6-luna", contextTokens: 272000 });
  assert.equal(setLunaRow(config, true), true);
  assert.equal(config.models.providers.openai.models.filter((m) => m.id === "gpt-6-luna").length, 1);
  assert.deepEqual(lunaRow(config), LUNA_ROW);
});

test("an openai provider without models gets a list; a config without openai is refused", () => {
  const config = { models: { providers: { openai: {} } } };
  assert.equal(setLunaRow(config, true), true);
  assert.deepEqual(config.models.providers.openai.models, [LUNA_ROW]);
  assert.throws(() => setLunaRow({ models: { providers: {} } }, true), /no models.providers.openai/);
});
