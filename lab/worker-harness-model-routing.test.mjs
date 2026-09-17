import assert from "node:assert/strict";
import test from "node:test";

import { withWorkerHarnessModelSelection } from "./worker-harness-model-routing.mjs";

test("forwards the model object resolved for realtime Talk", () => {
  const resolved = withWorkerHarnessModelSelection({
    runId: "talk-realtime-relay-consult:fixture",
    model: {
      id: "deepseek-v4-pro",
      provider: "deepseek",
      api: "openai-completions",
    },
  });

  assert.equal(resolved.modelId, "deepseek-v4-pro");
  assert.equal(resolved.provider, "deepseek");
  assert.equal(resolved.model.id, "deepseek-v4-pro");
});

test("keeps explicit native Harness routing authoritative", () => {
  const resolved = withWorkerHarnessModelSelection({
    modelId: "explicit-model",
    provider: "explicit-provider",
    model: { id: "fallback-model", provider: "fallback-provider" },
  });

  assert.equal(resolved.modelId, "explicit-model");
  assert.equal(resolved.provider, "explicit-provider");
});

test("returns an untouched request when no model selection is available", () => {
  const input = { runId: "fixture" };
  assert.equal(withWorkerHarnessModelSelection(input), input);
});
