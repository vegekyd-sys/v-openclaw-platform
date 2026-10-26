import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeoutMs, timeoutOf, NEW, OLD } from "./configure-v-announce-timeout.mjs";

const v = () => ({ agents: { defaults: { subagents: { maxConcurrent: 45, runTimeoutSeconds: 21600 }, model: "x" } } });

test("the new timeout is 30 min: far above the 120 s default, within a child's run limit", () => {
  assert.equal(NEW, 30 * 60 * 1000);
  assert(NEW <= v().agents.defaults.subagents.runTimeoutSeconds * 1000);
  assert(NEW <= 2 ** 31 - 1, "fits a Node timer");
});

test("apply sets the key, keeps the other subagent settings and is idempotent; restore unsets it", () => {
  const config = v();
  assert.equal(setTimeoutMs(config, NEW), true);
  assert.equal(timeoutOf(config), NEW);
  assert.deepEqual(config.agents.defaults.subagents, { maxConcurrent: 45, runTimeoutSeconds: 21600, announceTimeoutMs: NEW });
  assert.equal(setTimeoutMs(config, NEW), false);
  assert.equal(setTimeoutMs(config, OLD), true);
  assert.deepEqual(config, v());
  assert.equal(setTimeoutMs(config, OLD), false);
});

test("a config without a subagents block gets one", () => {
  const config = { agents: { defaults: {} } };
  setTimeoutMs(config, NEW);
  assert.deepEqual(config.agents.defaults.subagents, { announceTimeoutMs: NEW });
});

test("a config without agents.defaults is refused", () => {
  assert.throws(() => setTimeoutMs({}, NEW), /no agents.defaults/);
});
