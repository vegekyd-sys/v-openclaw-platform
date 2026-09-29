// Offline test for lab/release-files/completions-overflow-signal: when the
// completions transport estimates no room left for output, it must fail the call
// as a context overflow instead of sending max_tokens=1.
//
// V 2026-09-26..29: deepseek-flash requests went out with max_tokens=1 (recorded
// on the wire in the VLab candidate), DeepSeek stopped with finish_reason=length
// after one token, and the session never compacted. The end-to-end proof is
// completions-overflow-signal.mjs; this test pins the transport block itself.
//
// The block is lifted out of transports.mjs and run with a stubbed estimator, so
// the only inputs are the estimate, the context size and the requested output.
// DEEPSEEK_OVERFLOW_EXPECT=absent runs it against the unpatched file to show the
// old behaviour.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

const file = process.env.COMPLETIONS_TRANSPORTS_FILE
  ?? (process.env.VLAB_CANDIDATE_RUNTIME
    ? path.join(process.env.VLAB_CANDIDATE_RUNTIME, "openclaw", "node_modules", "@openclaw", "ai", "dist", "transports.mjs")
    : new URL("../release-files/completions-overflow-signal/transports.mjs", import.meta.url).pathname);
const source = fs.readFileSync(file, "utf8");
const patched = source.includes("completions-overflow-signal-v1");

const head = "if (compatDetection.capabilities.usesExplicitProxyLikeEndpoint && clampedMaxTokens !== void 0 && effectiveContextTokens !== void 0) {";
const start = source.indexOf(head);
assert(start >= 0, "context clamp block not found in transports.mjs");
let depth = 0, end = -1;
for (let i = start + head.length - 1; i < source.length; i++) {
  if (source[i] === "{") depth += 1;
  else if (source[i] === "}" && --depth === 0) { end = i + 1; break; }
}
assert(end > start, "end of the context clamp block not found");
const clamp = new Function(
  "compatDetection", "clampedMaxTokens", "effectiveContextTokens", "params", "estimateOpenAICompletionsInputTokens",
  "emitModelTransportDebug", "log", "model", "effectiveMaxTokens",
  `${source.slice(start, end)}\nreturn clampedMaxTokens;`,
);
const run = ({ estimate, context = 1_000_000, requested = 384_000, proxyLike = true }) => clamp(
  { capabilities: { usesExplicitProxyLikeEndpoint: proxyLike } }, requested, context, {}, () => estimate,
  () => {}, undefined, { provider: "deepseek", api: "openai-completions", id: "deepseek-flash" }, requested,
);

test(`patched marker present: ${patched}`, () => {
  assert.equal(patched, process.env.DEEPSEEK_OVERFLOW_EXPECT !== "absent", "patch state does not match the expectation");
});

test("an estimate past the window is a context overflow, not max_tokens=1", () => {
  // V: a Chinese-heavy 571k-token session estimated past 1M
  if (patched) {
    assert.throws(() => run({ estimate: 1_020_000 }), (error) => {
      assert.match(error.message, /^Context overflow: /u, "OpenClaw only compacts on errors it classifies as overflow");
      assert.equal(error.code, "V_COMPLETIONS_CONTEXT_BUDGET_EXHAUSTED");
      return true;
    });
  } else {
    assert.equal(run({ estimate: 1_020_000 }), 1, "unpatched: the request goes out with max_tokens=1");
  }
});

test("under 4096 tokens of room is also an overflow", () => {
  if (patched) assert.throws(() => run({ estimate: 1_000_000 - 3_000 }), (error) => /^Context overflow: /u.test(error.message));
  else assert.equal(run({ estimate: 1_000_000 - 3_000 }), 1_000_000 - (1_000_000 - 3_000) - 1);
});

test("room for at least 4096 tokens is clamped exactly as before", () => {
  assert.equal(run({ estimate: 600_000 }), 384_000, "plenty of room: requested budget unchanged");
  assert.equal(run({ estimate: 899_633 }), 100_366, "VLab 484k session: clamped to the remaining budget");
  assert.equal(run({ estimate: 1_000_000 - 4_097 }), 4_096, "exactly 4096 left still answers");
});

test("a small requested output only needs its own size", () => {
  // compaction summaries ask for 16000; a 1000-token request with 2000 left must go out
  assert.equal(run({ estimate: 1_000_000 - 2_001, requested: 1_000 }), 1_000);
});

test("non proxy-like endpoints are never touched", () => {
  assert.equal(run({ estimate: 5_000_000, proxyLike: false }), 384_000);
});
