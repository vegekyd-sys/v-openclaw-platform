// Candidate unit test for lab/release-files/deepseek-budget-image: the DeepSeek
// output budget (applyDeepSeekOutputBudget in @openclaw/ai transports.mjs) must
// count an inline image as a fixed allowance, not as its base64 bytes.
//
// V 2026-09-28 14:20: deepseek-v4-pro, providerPayloadBytes=1909721, refused with
// V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED before any request was sent.
//
// The function is not exported, so it is lifted out of the dist file and
// evaluated on its own (it only uses Buffer and Math). Run against the unpatched
// file with DEEPSEEK_BUDGET_EXPECT=absent to see the image cases fail there.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

// In a VLab candidate the runtime copy is tested; offline (CI) the committed release file.
const file = process.env.DEEPSEEK_BUDGET_FILE
  ?? (process.env.VLAB_CANDIDATE_RUNTIME
    ? path.join(process.env.VLAB_CANDIDATE_RUNTIME, "openclaw", "node_modules", "@openclaw", "ai", "dist", "transports.mjs")
    : new URL("../release-files/deepseek-budget-image/transports.mjs", import.meta.url).pathname);
assert(fs.existsSync(file), `transports.mjs not found at ${file}`);
const source = fs.readFileSync(file, "utf8");
const patched = source.includes("deepseek-budget-image-v1");
const start = source.indexOf("function applyDeepSeekOutputBudget(");
assert(start >= 0, "applyDeepSeekOutputBudget not found");
const end = source.indexOf("\n}\n", start);
assert(end > start, "end of applyDeepSeekOutputBudget not found");
const applyDeepSeekOutputBudget = new Function("Buffer", `${source.slice(start, end + 2)}\nreturn applyDeepSeekOutputBudget;`)(Buffer);

const deepseekModel = (extra = {}) => ({ id: "deepseek-v4-flash", contextWindow: 1_000_000, maxTokens: 384_000, input: ["text"], ...extra });
// The budget estimates two UTF-8 bytes per token.
const textOfTokens = (n) => "a".repeat(n * 2);
const base64 = "A".repeat(2_400_000); // a generated image: ~2.4 MB of base64
// DEEPSEEK_BUDGET_ASSUME_FIXED=1 asserts the fixed behaviour on any file, to show the old one fails.
const imageFixed = patched || process.env.DEEPSEEK_BUDGET_ASSUME_FIXED === "1";

test(`patched marker present: ${patched}`, () => {
  assert.equal(patched, process.env.DEEPSEEK_BUDGET_EXPECT !== "absent", "patch state does not match the expectation");
});

test("wire image_url data URL is not counted as text tokens", () => {
  const params = {
    messages: [
      { role: "user", content: textOfTokens(20_000) },
      { role: "user", content: [
        { type: "text", text: "generated image" },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
      ] },
    ],
    max_tokens: 384_000,
  };
  const run = () => applyDeepSeekOutputBudget(params, deepseekModel({ input: ["text", "image"] }), undefined);
  if (imageFixed) {
    assert.doesNotThrow(run);
    assert.equal(params.max_tokens, 384_000);
  } else {
    assert.throws(run, /V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED/, "unpatched: a 2.4 MB image is refused as overflow");
  }
});

test("transcript image blocks after the last usage are not counted as text tokens", () => {
  const model = deepseekModel({ input: ["text", "image"] });
  const context = {
    systemPrompt: "",
    messages: [
      { role: "assistant", model: model.id, usage: { input: 30_000, output: 500 } },
      { role: "toolResult", content: [{ type: "image", data: base64, mimeType: "image/jpeg" }] },
    ],
  };
  const params = { messages: [{ content: textOfTokens(30_000) }], max_tokens: 384_000 };
  const run = () => applyDeepSeekOutputBudget(params, model, context);
  if (imageFixed) assert.doesNotThrow(run);
  else assert.throws(run, /V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED/);
});

test("a genuinely oversized text context next to an image is still refused", () => {
  const params = {
    messages: [
      { content: textOfTokens(1_000_000) },
      { content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }] },
    ],
    max_tokens: 384_000,
  };
  assert.throws(() => applyDeepSeekOutputBudget(params, deepseekModel(), undefined), /V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED/);
});

test("text-only requests get exactly the budget the old estimate gave", () => {
  for (const tokens of [1_000, 200_000, 560_000]) {
    const params = { messages: [{ role: "user", content: textOfTokens(tokens) }], tools: [{ type: "function", function: { name: "t" } }], max_tokens: 384_000 };
    // The pre-fix formula, written out independently.
    const est = Math.ceil(Buffer.byteLength(JSON.stringify({ messages: params.messages, tools: params.tools }), "utf8") / 2);
    const available = Math.floor(1_000_000 - est - Math.max(8192, Math.ceil(est * 0.05)));
    const expected = Math.min(384_000, available, 384_000);
    applyDeepSeekOutputBudget(params, deepseekModel(), undefined);
    assert.equal(params.max_tokens, expected, `text-only budget changed at ${tokens} tokens`);
  }
});

test("short strings that merely look like data URLs, and non-image data fields, are untouched", () => {
  const small = "data:image/png;base64,AAAA"; // < 1024 chars: counted as text, as before
  const params = { messages: [{ content: [{ type: "file", data: "B".repeat(400_000) }, { type: "text", text: small }] }], max_tokens: 384_000 };
  const est = Math.ceil(Buffer.byteLength(JSON.stringify({ messages: params.messages, tools: undefined }), "utf8") / 2);
  const available = Math.floor(1_000_000 - est - Math.max(8192, Math.ceil(est * 0.05)));
  applyDeepSeekOutputBudget(params, deepseekModel(), undefined);
  assert.equal(params.max_tokens, Math.min(384_000, available));
});

test("non-DeepSeek-v4 models are never touched", () => {
  const params = { messages: [{ content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }] }], max_tokens: 5 };
  applyDeepSeekOutputBudget(params, { id: "deepseek-flash", contextWindow: 1_000_000 }, undefined);
  assert.equal(params.max_tokens, 5);
});
