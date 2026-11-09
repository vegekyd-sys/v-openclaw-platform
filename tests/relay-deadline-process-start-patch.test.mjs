import assert from "node:assert/strict";
import test from "node:test";
import { patchRelayDeadline } from "../scripts/apply-relay-deadline-process-start-patch.mjs";

const cli = `function createNativeHookRelayDeadline(timeoutMs) { return { timeoutMs }; }
export function start(timeoutMs) {
	const deadline = createNativeHookRelayDeadline(timeoutMs);
	return deadline.timeoutMs;
}
`;

test("the deadline shrinks by the time the process already took to start", async () => {
  const { source, changed } = patchRelayDeadline(cli);
  assert.equal(changed, true);
  const { start } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const uptime = process.uptime() * 1e3;
  const left = start(9000);
  assert.ok(left < 9000 && left <= 9000 - uptime + 5, `left ${left}, uptime ${uptime}`);
  assert.ok(left >= 8000 - uptime, `left ${left}, uptime ${uptime}`);
});

test("a process older than its budget still gets a deadline, and it is already due", async () => {
  const { source } = patchRelayDeadline(cli);
  const { start } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  assert.equal(start(1), 1);
});

test("patching twice changes nothing and another shape is refused", () => {
  const once = patchRelayDeadline(cli);
  assert.equal(patchRelayDeadline(once.source).changed, false);
  assert.throws(() => patchRelayDeadline("function other() {}"), /refusing to patch/u);
});
