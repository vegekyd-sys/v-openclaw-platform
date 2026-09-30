// Candidate unit test for lab/release-files/computer-frame-prune: within the
// current (incomplete) turn only the newest two tool-result images survive the
// prompt transform; completed-turn pruning keeps its upstream behaviour.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const chunk = fs.readdirSync(dist).find((f) => /^history-image-prune-[\w-]+\.js$/u.test(f));
assert(chunk, "history-image-prune chunk not found");
const source = fs.readFileSync(path.join(dist, chunk), "utf8");
const patched = source.includes("v-computer-frame-prune-v1");
const mod = await import(path.join(dist, chunk));
const prune = mod.n; // pruneProcessedHistoryImages
assert.equal(typeof prune, "function", "export n must be pruneProcessedHistoryImages");

const img = (id) => ({ type: "image", data: `base64-${id}`, mimeType: "image/jpeg" });
const user = (text) => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text) => ({ role: "assistant", content: [{ type: "text", text }] });
const shot = (id) => ({ role: "toolResult", toolCallId: `call-${id}`, toolName: "computer", content: [{ type: "text", text: `screenshot ${id}` }, img(id)] });
const imagesIn = (m) => (Array.isArray(m.content) ? m.content.filter((b) => b?.type === "image").length : 0);

test(`patched chunk present: ${patched}`, () => {
  assert.equal(patched, process.env.FRAME_PRUNE_EXPECT !== "absent", "patch state does not match the expectation");
});

test("first turn of a fresh session: only the newest two screenshots keep their image data", () => {
  const messages = [user("do the task"), assistant("ok"), shot(1), assistant("next"), shot(2), assistant("next"), shot(3), assistant("next"), shot(4), assistant("next"), shot(5)];
  const out = prune(messages);
  if (!patched) {
    assert.equal(out, null, "upstream returns null when no turn has completed");
    return;
  }
  assert.ok(out, "patched prune must return a transformed list");
  const kept = out.filter((m) => m.role === "toolResult").map(imagesIn);
  assert.deepEqual(kept, [0, 0, 0, 1, 1]);
  assert.match(out[2].content[1].text, /superseded by a newer frame/u);
  assert.equal(out[2].content[0].text, "screenshot 1", "text blocks are untouched");
  assert.equal(messages[2].content[1].type, "image", "input messages are not mutated");
  assert.equal(out[10].content[1].type, "image", "the newest frame stays intact");
});

test("completed turns are still pruned by the upstream rule; current turn keeps its newest frames", () => {
  // three completed turns (image in the first), then the current turn with four screenshots
  const messages = [user("t1"), shot("a"), assistant("done 1"), user("t2"), assistant("done 2"), user("t3"), assistant("done 3"), user("t4"), assistant("done 4"), user("now"), assistant("go"), shot("b"), assistant("."), shot("c"), assistant("."), shot("d"), assistant("."), shot("e")];
  const out = prune(messages) ?? messages;
  const byId = Object.fromEntries(out.filter((m) => m.role === "toolResult").map((m) => [m.toolCallId, imagesIn(m)]));
  assert.equal(byId["call-a"], 0, "image from an old completed turn is pruned upstream");
  if (patched) {
    assert.deepEqual([byId["call-b"], byId["call-c"], byId["call-d"], byId["call-e"]], [0, 0, 1, 1]);
  } else {
    assert.deepEqual([byId["call-b"], byId["call-c"], byId["call-d"], byId["call-e"]], [1, 1, 1, 1]);
  }
});

test("user-message images of the current turn and non-image tool results are untouched", () => {
  const messages = [
    { role: "user", content: [{ type: "text", text: "look" }, img("u")] },
    assistant("ok"),
    { role: "toolResult", toolCallId: "call-text", toolName: "exec", content: [{ type: "text", text: "ls output" }] },
    assistant("."),
    shot(1), assistant("."), shot(2), assistant("."), shot(3),
  ];
  const out = prune(messages) ?? messages;
  assert.equal(imagesIn(out[0]), 1);
  assert.equal(out[2].content[0].text, "ls output");
  if (patched) {
    assert.deepEqual(out.filter((m) => m.toolName === "computer").map(imagesIn), [0, 1, 1]);
  }
});

test("payload shrinks: 12 screenshots of 100 KB collapse to 2", () => {
  const big = "x".repeat(100_000);
  const messages = [user("go")];
  for (let i = 0; i < 12; i += 1) {
    messages.push(assistant("."), { role: "toolResult", toolCallId: `c${i}`, toolName: "computer", content: [{ type: "image", data: big, mimeType: "image/jpeg" }] });
  }
  const out = prune(messages) ?? messages;
  const bytes = JSON.stringify(out).length;
  if (patched) {
    assert.ok(bytes < 3 * 100_000, `payload still ${bytes} bytes`);
  } else {
    assert.ok(bytes > 12 * 100_000);
  }
});
