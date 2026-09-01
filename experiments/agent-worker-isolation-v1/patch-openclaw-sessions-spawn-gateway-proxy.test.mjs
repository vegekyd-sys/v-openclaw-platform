import assert from "node:assert/strict";
import test from "node:test";
import {
  PATCH_MARKER,
  patchSessionsSpawnGatewayProxy,
} from "./patch-openclaw-sessions-spawn-gateway-proxy.mjs";

const fixture = `
/** sessions_spawn built-in tool. */
function createSessionsSpawnTool(opts) {
\treturn {
\t\texecute: async (_toolCallId, args) => {
\t\t\tconst params = args;
\t\t\tconst result = { status: "accepted", runId: "child" };
\t\t\trecordAcceptedSessionSpawn(result, "isolated");
\t\t\treturn { opts, params };
\t\t}
\t};
}
//#endregion
`;

const openClaw81Fixture = `
function createSessionsSpawnTool(opts) {
\treturn {
\t\tname: "sessions_spawn",
\t\texecute: async (_toolCallId, args) => {
\t\t\tconst params = args;
\t\t\tif (args.runtime === "acp") {
\t\t\t\tconst result = { status: "accepted", runId: "acp-child" };
\t\t\t\trecordAcceptedSessionSpawn(result, "isolated");
\t\t\t\treturn result;
\t\t\t}
\t\t\tconst result = { status: "accepted", runId: "subagent-child" };
\t\t\trecordAcceptedSessionSpawn(result, result.context);
\t\t\treturn { opts, params };
\t\t}
\t};
}
//#endregion
`;

test("moves Worker completion delivery to the external Harness bridge", () => {
  const result = patchSessionsSpawnGatewayProxy(fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(result.source, /external-harness-task-bridge-v1/);
  assert.match(result.source, /external-harness-task-record-v1/);
  assert.match(result.source, /expectsCompletionMessage: false/);
  assert.doesNotThrow(() => new Function(result.source));
});

test("patches every OpenClaw 2026.8.1 sessions_spawn branch", () => {
  const result = patchSessionsSpawnGatewayProxy(openClaw81Fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(result.source, /expectsCompletionMessage: false/);
  assert.equal(
    result.source.match(/sessions-spawn-external-task-record-v0\.2\.8-v4/g)
      ?.length,
    2,
  );
  assert.doesNotThrow(() => new Function(result.source));
});

test("sessions_spawn external Harness patch is idempotent", () => {
  const once = patchSessionsSpawnGatewayProxy(fixture);
  const twice = patchSessionsSpawnGatewayProxy(once.source);
  assert.equal(twice.changed, false);
  assert.equal(twice.source, once.source);
});
