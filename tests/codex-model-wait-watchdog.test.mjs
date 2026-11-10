// The model-wait watchdog in isolation, taken from the patched dist, on mocked timers.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patch = path.join(root, "lab/release-files/codex-model-wait-watchdog/patch-codex-model-wait-watchdog.mjs");
const source = path.join(root, "lab/release-files/codex-turn-context-handoff/dist/run-attempt-D1hJO4fX.js");

function patched() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "model-wait-"));
  const file = path.join(dir, "run-attempt-D1hJO4fX.js");
  fs.copyFileSync(source, file);
  execFileSync(process.execPath, [patch, dir]);
  execFileSync(process.execPath, [patch, dir, "--check"]);
  const text = fs.readFileSync(file, "utf8");
  fs.rmSync(dir, { recursive: true });
  return text;
}
const text = patched();
const region = text.slice(text.indexOf("//#region extensions/codex/src/app-server/attempt-model-wait.ts"), text.indexOf("//#region extensions/codex/src/app-server/attempt-deadlines.ts"));
const isJsonObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

const LIMIT = 90_000;
const started = (type, id) => ({ method: "item/started", params: { item: { type, id } } });
const completed = (type, id) => ({ method: "item/completed", params: { item: { type, id } } });
const raw = (item) => ({ method: "rawResponseItem/completed", params: { item } });

function setup({ busy = () => false } = {}) {
  mock.timers.enable({ apis: ["setTimeout"], now: 0 });
  let clock = 0;
  const load = new Function("isJsonObject", "performance", "process", `${region}\nreturn { createCodexModelWaitWatchdog, resolveCodexModelWaitLimitMs };`);
  const { createCodexModelWaitWatchdog, resolveCodexModelWaitLimitMs } = load(isJsonObject, { now: () => clock }, { env: setup.env ?? {} });
  const fired = [];
  const controller = new AbortController();
  const dog = createCodexModelWaitWatchdog({ signal: controller.signal, isBusy: busy, onExpire: (e) => fired.push(e) });
  const advance = (ms) => {
    for (let left = ms; left > 0; left -= 1000) {
      clock += Math.min(1000, left);
      mock.timers.tick(Math.min(1000, left));
    }
  };
  return { dog, fired, advance, controller, resolveCodexModelWaitLimitMs };
}
test.afterEach(() => mock.timers.reset());

test("a silent model request fires after the limit plus the delivery grace", () => {
  const { dog, fired, advance } = setup();
  dog.start(LIMIT);
  advance(LIMIT - 1000);
  assert.equal(fired.length, 0);
  advance(3000);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].limitMs, LIMIT);
  assert.equal(fired[0].modelOutputSeen, false);
  advance(600_000);
  assert.equal(fired.length, 1, "fires once");
});

test("output queued behind a frozen event loop counts: the grace lets it land first", () => {
  const { dog, fired, advance } = setup();
  dog.start(LIMIT);
  advance(LIMIT);
  dog.note({ method: "item/reasoning/textDelta", params: {} });
  advance(2000);
  assert.equal(fired.length, 0);
});

test("a native tool item owns the wait however long it runs", () => {
  const { dog, fired, advance } = setup();
  dog.start(LIMIT);
  dog.note(started("commandExecution", "call_1"));
  advance(3_600_000);
  assert.equal(fired.length, 0);
  dog.note(completed("commandExecution", "call_1"));
  advance(LIMIT - 1000);
  assert.equal(fired.length, 0, "the next model request gets a whole limit");
  advance(3000);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].modelOutputSeen, false, "a tool result starts a new request");
});

test("an unknown item type is treated as a tool, not as silence", () => {
  const { dog, fired, advance } = setup();
  dog.start(LIMIT);
  dog.note(started("somethingNewFromCodex", "x"));
  advance(3_600_000);
  assert.equal(fired.length, 0);
});

test("a finished tool call without its item yet, as during a PreToolUse hook, owns the wait", () => {
  const { dog, fired, advance } = setup();
  dog.start(LIMIT);
  dog.note(raw({ type: "function_call", call_id: "c1" }));
  advance(1_800_000);
  assert.equal(fired.length, 0);
  dog.note(raw({ type: "function_call_output", call_id: "c1" }));
  advance(LIMIT + 2000);
  assert.equal(fired.length, 1);
});

test("a host request, dynamic tool or compaction owns the wait through isBusy", () => {
  let busy = true;
  const { dog, fired, advance } = setup({ busy: () => busy });
  dog.start(LIMIT);
  advance(3_600_000);
  assert.equal(fired.length, 0);
  busy = false;
  dog.touch();
  advance(LIMIT + 2000);
  assert.equal(fired.length, 1);
});

test("model output doubles the limit: tool arguments stream with no app-server event", () => {
  const { dog, fired, advance } = setup();
  dog.start(LIMIT);
  dog.note({ method: "item/reasoning/textDelta", params: {} });
  advance(LIMIT + 5000);
  assert.equal(fired.length, 0);
  advance(LIMIT);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].limitMs, LIMIT * 2);
  assert.equal(fired[0].modelOutputSeen, true);
});

test("the input echo and Codex's own retry notices prove nothing about the model", () => {
  const { dog, fired, advance } = setup();
  dog.start(LIMIT);
  dog.note(started("userMessage", "u"));
  dog.note(completed("userMessage", "u"));
  dog.note(raw({ type: "message", role: "user" }));
  advance(LIMIT - 1000);
  dog.note({ method: "error", params: { willRetry: true } });
  dog.note({ method: "thread/status/changed", params: {} });
  advance(3000);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].limitMs, LIMIT, "still the first-response limit");
});

test("a hook run owns the wait until it completes", () => {
  const { dog, fired, advance } = setup();
  dog.start(LIMIT);
  dog.note({ method: "hook/started", params: { run: { id: "r1" } } });
  advance(1_800_000);
  assert.equal(fired.length, 0);
  dog.note({ method: "hook/completed", params: { run: { id: "r1" } } });
  advance(LIMIT + 2000);
  assert.equal(fired.length, 1);
});

test("abort and dispose end the watch", () => {
  const a = setup();
  a.dog.start(LIMIT);
  a.controller.abort();
  a.advance(600_000);
  assert.equal(a.fired.length, 0);
  mock.timers.reset();
  const b = setup();
  b.dog.start(LIMIT);
  b.dog.dispose();
  b.advance(600_000);
  assert.equal(b.fired.length, 0);
});

test("start with no limit stays off", () => {
  const { dog, fired, advance } = setup();
  dog.start(undefined);
  advance(3_600_000);
  assert.equal(fired.length, 0);
});

test("the limit is the provider's timeoutSeconds; without one it stays off unless asked for", () => {
  const { resolveCodexModelWaitLimitMs: limit } = setup();
  const config = { models: { providers: { deepseek: { timeoutSeconds: 90 }, xai: {} } } };
  assert.equal(limit({ config, provider: "deepseek" }, undefined), 90_000);
  assert.equal(limit({ config, provider: "codex" }, "deepseek"), 90_000);
  assert.equal(limit({ config, provider: "openai" }, "openai"), undefined);
  assert.equal(limit({ provider: "openai" }, undefined), undefined);
  mock.timers.reset();
  setup.env = { OPENCLAW_CODEX_MODEL_WAIT_DEFAULT_SECONDS: "300" };
  const asked = setup().resolveCodexModelWaitLimitMs;
  assert.equal(asked({ config, provider: "openai" }, "openai"), 300_000);
  assert.equal(asked({ config, provider: "deepseek" }, undefined), 90_000);
  mock.timers.reset();
  setup.env = { OPENCLAW_CODEX_MODEL_WAIT_WATCHDOG: "off" };
  const off = setup().resolveCodexModelWaitLimitMs;
  setup.env = undefined;
  assert.equal(off({ config, provider: "deepseek" }, undefined), undefined);
});

test("the turn ends as a prompt timeout the failover policy can classify, not as an abort", () => {
  assert.match(text, /state\.modelWaitTimeout\?\.message \?\? clientClosedPromptErrorForFinal/u);
  assert.match(text, /const codexAppServerFailureKind = state\.modelWaitTimeout \? void 0 :/u);
  assert.match(text, /Codex model request timed out: no response from/u);
  // never goes through the run's abort controller
  const onExpire = text.slice(text.indexOf("onExpire: (expired) => {"), text.indexOf("}).finally(completeTurn);"));
  assert.doesNotMatch(onExpire, /runAbortController\.abort/u);
});
