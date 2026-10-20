// §8.7 poll guard: sleep / timeout / while regexes, history counting, block-only, idempotent per call.
import assert from "node:assert/strict";
import { test } from "node:test";

import { SESSIONS_SEND_ACCEPTED } from "../core/contracts.js";
import { pollGuardText } from "../core/copy.js";
import { commandText, createPollGuard, isPollingCommand } from "../core/guard.js";

const TARGET = "agent:makaron:feishu:group:oc_a";

function world() {
  const target = {};
  target[SESSIONS_SEND_ACCEPTED] = new Map([
    ["run-1", { at: Date.now(), targets: new Map([[TARGET, { code: "7F3A", label: "任务群 a", historyReads: 0 }]]) }],
  ]);
  return { target, guard: createPollGuard({ target }) };
}
let n = 0;
const call = (toolName, params, runId = "run-1") => [{ toolName, params, runId }, { runId, toolName, toolCallId: `tc${(n += 1)}` }];

test("guard: polling commands", () => {
  for (const cmd of ["sleep 15", "sleep 60 && cat x", "sleep 20.5", "timeout 30 tail -f x", "while true; do curl x; sleep 5; done", "bash -lc 'sleep 300'"]) assert(isPollingCommand(cmd), cmd);
  for (const cmd of ["sleep 2", "sleep 14.9", "ls -la", "timeout 5 curl x", "echo while; do", "npm test", "sleep 10s", "sleep 0.2m"]) assert(!isPollingCommand(cmd), cmd);
  for (const cmd of ["sleep 1m", "sleep 5m; cat out", "sleep 2h", "sleep 30s"]) assert(isPollingCommand(cmd), `${cmd} (units)`);
  assert.equal(commandText({ command: ["bash", "-lc", "sleep 30"] }), "bash -lc sleep 30");
  assert.equal(commandText({ cmd: "sleep 30" }), "sleep 30");
});

test("guard: blocks exec polling only for a run that handed work off; never rewrites params", () => {
  const { guard } = world();
  const v = guard(...call("exec", { command: "sleep 120" }));
  assert.deepEqual(v, { block: true, blockReason: pollGuardText({ code: "7F3A", to: "任务群 a" }) });
  assert(!("params" in v));
  assert.equal(guard(...call("exec_command", { cmd: ["sh", "-c", "ls"] })), undefined);
  assert.equal(guard(...call("exec", { command: "sleep 120" }, "other-run")), undefined);
  for (const tool of ["bash", "process", "shell", "local_shell", "exec_command"]) assert.equal(guard(...call(tool, { command: "sleep 90" }))?.block, true, tool);
  assert.equal(guard(...call("read", { path: "sleep 90" })), undefined);
});

test("guard: sessions_history / session_status on an accepted target: first allowed, then blocked", () => {
  const { guard, target } = world();
  assert.equal(guard(...call("sessions_history", { sessionKey: TARGET })), undefined);
  assert.equal(guard(...call("session_status", { sessionKey: TARGET }))?.block, true);
  assert.equal(target[SESSIONS_SEND_ACCEPTED].get("run-1").targets.get(TARGET).historyReads, 2);
  assert.equal(guard(...call("sessions_history", { sessionKey: "agent:makaron:feishu:group:oc_other" })), undefined);
  assert.equal(guard(...call("session_status", {})), undefined, "own status is fine");
});

test("guard: the same toolCallId is decided once (register() runs three times)", () => {
  const { guard, target } = world();
  const args = call("sessions_history", { sessionKey: TARGET });
  assert.equal(guard(...args), undefined);
  assert.equal(guard(...args), undefined);
  assert.equal(guard(...args), undefined);
  assert.equal(target[SESSIONS_SEND_ACCEPTED].get("run-1").targets.get(TARGET).historyReads, 1);
});

test("guard: no table, empty table or a plain-object targets entry never throws", () => {
  assert.equal(createPollGuard({ target: {} })(...call("exec", { command: "sleep 99" })), undefined);
  const target = { [SESSIONS_SEND_ACCEPTED]: new Map([["run-1", { at: Date.now(), targets: { [TARGET]: { code: "AAAA", label: "a", historyReads: 1 } } }]]) };
  assert.equal(createPollGuard({ target })(...call("sessions_history", { sessionKey: TARGET }))?.block, true);
  const weird = { [SESSIONS_SEND_ACCEPTED]: new Map([["run-1", null]]) };
  assert.equal(createPollGuard({ target: weird })(...call("exec", { command: "sleep 99" })), undefined);
});

test("guard: without a toolCallId, the duplicate invocations of one call still count one history read", () => {
  let t = 1_000;
  const target = {};
  target[SESSIONS_SEND_ACCEPTED] = new Map([["run-1", { at: Date.now(), targets: new Map([[TARGET, { code: "7F3A", label: "任务群 a", historyReads: 0 }]]) }]]);
  const guard = createPollGuard({ target, now: () => t });
  const ev = { toolName: "sessions_history", params: { sessionKey: TARGET }, runId: "run-1" };
  const ctx = { runId: "run-1", toolName: "sessions_history" };
  for (let i = 0; i < 3; i += 1) assert.equal(guard(ev, ctx), undefined, "one call seen by three registrations");
  assert.equal(target[SESSIONS_SEND_ACCEPTED].get("run-1").targets.get(TARGET).historyReads, 1);
  t += 30_000; // the model's next call, much later
  assert.equal(guard(ev, ctx)?.block, true);
  assert.equal(guard(ev, ctx)?.block, true, "its duplicates get the same verdict");
  assert.equal(target[SESSIONS_SEND_ACCEPTED].get("run-1").targets.get(TARGET).historyReads, 2);
});
