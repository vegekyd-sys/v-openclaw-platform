import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFastCompactionProvider,
  REQUIRED_COMPACTION_SECTIONS,
} from "./fast-compaction-provider.mjs";

const validSummary = [
  "## Decisions",
  "- Keep worker and Gateway session ownership unified.",
  "",
  "## Open TODOs",
  "- Verify the rollout.",
  "",
  "## Constraints/Rules",
  "- Preserve exact identifiers.",
  "",
  "## Pending user asks",
  "- Confirm the compact result.",
  "",
  "## Exact identifiers",
  "- oc_1234567890abcdef",
].join("\n");

test("uses one configured GPT-5.5 completion when the first summary passes audit", async () => {
  const calls = [];
  const provider = buildFastCompactionProvider({
    model: "azure-openai/gpt-5.5",
    llmComplete: async (params) => {
      calls.push(params);
      return {
        text: validSummary,
        provider: "azure-openai",
        model: "gpt-5.5",
        agentId: "makaron",
        usage: {},
        audit: { caller: { pluginId: "test" } },
      };
    },
  });

  const summary = await provider.summarize({
    messages: [
      {
        role: "user",
        content: "请继续处理 oc_1234567890abcdef，并确认 compact 结果。",
      },
      {
        role: "toolResult",
        content: "x".repeat(30_000),
      },
    ],
    customInstructions: "Use the required headings.",
  });

  assert.equal(summary, validSummary);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "azure-openai/gpt-5.5");
  assert.equal(calls[0].temperature, 0);
  assert.match(calls[0].messages[0].content, /oc_1234567890abcdef/);
  assert.ok(calls[0].messages[0].content.length < 20_000);
});

test("retries at most once when the first result fails structural audit", async () => {
  const calls = [];
  const provider = buildFastCompactionProvider({
    model: "azure-openai/gpt-5.5",
    maxQualityRetries: 1,
    llmComplete: async (params) => {
      calls.push(params);
      return {
        text: calls.length === 1 ? "too short" : validSummary,
        provider: "azure-openai",
        model: "gpt-5.5",
        agentId: "makaron",
        usage: {},
        audit: { caller: { pluginId: "test" } },
      };
    },
  });

  const summary = await provider.summarize({
    messages: [
      {
        role: "user",
        content: "检查 oc_1234567890abcdef",
      },
    ],
  });

  assert.equal(summary, validSummary);
  assert.equal(calls.length, 2);
  assert.match(calls[1].systemPrompt, /failed quality checks/i);
});

test("repairs required sections and exact identifiers after the final model attempt", async () => {
  let calls = 0;
  const provider = buildFastCompactionProvider({
    model: "azure-openai/gpt-5.5",
    maxQualityRetries: 1,
    llmComplete: async () => {
      calls += 1;
      return {
        text: "A useful narrative summary without headings.",
        provider: "azure-openai",
        model: "gpt-5.5",
        agentId: "makaron",
        usage: {},
        audit: { caller: { pluginId: "test" } },
      };
    },
  });

  const summary = await provider.summarize({
    messages: [
      {
        role: "user",
        content: "保留 oc_abcdef1234567890",
      },
    ],
  });

  assert.equal(calls, 2);
  for (const section of REQUIRED_COMPACTION_SECTIONS) {
    assert.match(summary, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(summary, /oc_abcdef1234567890/);
  assert.match(summary, /A useful narrative summary/);
});

test("bounds large histories while retaining the newest real user request", async () => {
  let captured;
  const provider = buildFastCompactionProvider({
    model: "azure-openai/gpt-5.5",
    maxInputChars: 40_000,
    llmComplete: async (params) => {
      captured = params;
      return {
        text: validSummary,
        provider: "azure-openai",
        model: "gpt-5.5",
        agentId: "makaron",
        usage: {},
        audit: { caller: { pluginId: "test" } },
      };
    },
  });

  await provider.summarize({
    messages: [
      ...Array.from({ length: 100 }, (_, index) => ({
        role: "toolResult",
        content: `tool-${index}:${"z".repeat(10_000)}`,
      })),
      {
        role: "user",
        content: "LATEST_USER_ASK_987654321",
      },
    ],
  });

  assert.ok(captured.messages[0].content.length <= 40_000);
  assert.match(captured.messages[0].content, /LATEST_USER_ASK_987654321/);
});
