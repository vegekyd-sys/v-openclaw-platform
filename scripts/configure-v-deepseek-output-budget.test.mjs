import { test } from "node:test";
import assert from "node:assert/strict";
import { setBudget, budgets, MODELS, NEW, OLD, DEEPSEEK_LIMIT } from "./configure-v-deepseek-output-budget.mjs";

const v = () => ({ models: { providers: {
  deepseek: { models: [...MODELS.map((id) => ({ id, ...OLD })), { id: "deepseek-other", ...OLD }] },
  xai: { models: [{ id: "grok-4.3", contextWindow: 1000000, maxTokens: 64000 }] },
} } });

test("the new budget always fits DeepSeek's request limit", () => {
  assert(NEW.contextWindow + NEW.maxTokens <= DEEPSEEK_LIMIT);
  assert(OLD.contextWindow + OLD.maxTokens > DEEPSEEK_LIMIT, "the old budget is the bug");
});

test("apply sets the four V models, leaves other models alone and is idempotent", () => {
  const config = v();
  assert.deepEqual(setBudget(config, NEW).map((c) => c.id), MODELS);
  assert.deepEqual(Object.values(budgets(config)), MODELS.map(() => NEW));
  assert.deepEqual(config.models.providers.deepseek.models.at(-1), { id: "deepseek-other", ...OLD });
  assert.deepEqual(config.models.providers.xai.models[0], { id: "grok-4.3", contextWindow: 1000000, maxTokens: 64000 });
  assert.equal(setBudget(config, NEW).length, 0);
  assert.deepEqual(setBudget(config, OLD).map((c) => c.id), MODELS, "restore puts the old values back");
  assert.deepEqual(config, v());
});

test("a config without DeepSeek models is refused", () => {
  assert.throws(() => setBudget({ models: { providers: {} } }, NEW), /no models.providers.deepseek.models/);
});
