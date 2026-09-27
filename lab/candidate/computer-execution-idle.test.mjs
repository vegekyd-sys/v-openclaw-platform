// Candidate unit test for lab/release-files/computer-execution-idle: a provider
// execution that is never closed is released after OPENCLAW_COMPUTER_EXECUTION_IDLE_MS
// of inactivity, so the next execution (another session / runtime) is not BUSY forever.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const chunk = fs.readdirSync(dist).find((f) => /^computer-use-contract-[\w-]+\.js$/u.test(f));
assert(chunk, "computer-use-contract chunk not found");
const source = fs.readFileSync(path.join(dist, chunk), "utf8");
const patched = source.includes("v-computer-execution-idle-v1");
const IDLE_MS = Number(process.env.OPENCLAW_COMPUTER_EXECUTION_IDLE_MS);
assert(IDLE_MS > 0, "test must run with OPENCLAW_COMPUTER_EXECUTION_IDLE_MS set (plan env)");
const mod = await import(path.join(dist, chunk));
const registerComputerUseProvider = mod._;
assert.equal(typeof registerComputerUseProvider, "function", "export _ must be registerComputerUseProvider");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function harness() {
  const commands = new Map();
  const events = [];
  const provider = {
    capabilities: () => ({ version: 2, actions: ["screenshot", "left_click"] }),
    isAvailable: () => true,
    openExecution: async ({ executionId }) => {
      events.push(`open:${executionId}`);
      return {
        snapshot: async () => JSON.stringify({ ok: true, executionId }),
        act: async () => JSON.stringify({ ok: true, executionId }),
        close: async (reason) => {
          events.push(`close:${executionId}:${reason}`);
        },
      };
    },
  };
  registerComputerUseProvider({ registerNodeHostCommand: (def) => commands.set(def.command, def) }, provider);
  const call = (command, params) => commands.get(command).handle(JSON.stringify(params), {}, { sessionKey: "agent:test" });
  return { call, events };
}

test(`patched chunk present: ${patched}`, () => {
  assert.equal(patched, process.env.EXECUTION_IDLE_EXPECT !== "absent", "patch state does not match the expectation");
});

test("second execution is BUSY while the first is active; explicit close still releases", async () => {
  const { call, events } = harness();
  const a = randomUUID();
  const b = randomUUID();
  await call("screen.snapshot", { executionId: a, maxWidth: 320 });
  await assert.rejects(call("computer.act", { executionId: b, action: "screenshot" }), /COMPUTER_HOST_BUSY/u);
  await call("computer.act", { executionId: a, action: "__close_execution", reason: "completion" });
  assert.deepEqual(events, [`open:${a}`, `close:${a}:completion`]);
  await call("computer.act", { executionId: b, action: "screenshot" });
  assert.equal(events.at(-1), `open:${b}`);
  await call("computer.act", { executionId: b, action: "__close_execution" });
});

test("an execution nobody closes is released after the idle window and a new owner gets in", async () => {
  const { call, events } = harness();
  const a = randomUUID();
  const b = randomUUID();
  await call("screen.snapshot", { executionId: a, maxWidth: 320 });
  await assert.rejects(call("computer.act", { executionId: b, action: "screenshot" }), /COMPUTER_HOST_BUSY/u);
  await sleep(IDLE_MS * 2 + 100);
  if (!patched) {
    await assert.rejects(call("computer.act", { executionId: b, action: "screenshot" }), /COMPUTER_HOST_BUSY/u, "upstream keeps the lock forever");
    await call("computer.act", { executionId: a, action: "__close_execution" });
    return;
  }
  assert.ok(events.includes(`close:${a}:idle-expired`), `idle close missing: ${events.join(",")}`);
  await call("computer.act", { executionId: b, action: "screenshot" });
  assert.equal(events.at(-1), `open:${b}`);
  await call("computer.act", { executionId: b, action: "__close_execution" });
});

test("activity keeps the execution alive; the same executionId reopens transparently after expiry", async () => {
  const { call, events } = harness();
  const a = randomUUID();
  await call("screen.snapshot", { executionId: a, maxWidth: 320 });
  for (let i = 0; i < 4; i += 1) {
    await sleep(IDLE_MS * 0.6);
    await call("computer.act", { executionId: a, action: "screenshot" });
  }
  if (patched) {
    assert.ok(!events.some((e) => e.startsWith("close:")), `kept-alive execution was closed: ${events.join(",")}`);
    await sleep(IDLE_MS * 2 + 100);
    assert.ok(events.includes(`close:${a}:idle-expired`));
    await call("computer.act", { executionId: a, action: "screenshot" });
    assert.equal(events.filter((e) => e === `open:${a}`).length, 2, "same id reopened a fresh execution");
  }
  await call("computer.act", { executionId: a, action: "__close_execution" });
});
