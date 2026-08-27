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
\t\t\treturn { opts, args };
\t\t}
\t};
}
//#endregion
`;

test("routes Worker sessions_spawn to the Gateway owner", () => {
  const result = patchSessionsSpawnGatewayProxy(fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(result.source, /toolName: "sessions_spawn"/);
  assert.match(result.source, /completionOwnerKey: opts\?\.completionOwnerKey/);
  assert.doesNotThrow(() => new Function(result.source));
});

test("sessions_spawn Gateway patch is idempotent", () => {
  const once = patchSessionsSpawnGatewayProxy(fixture);
  const twice = patchSessionsSpawnGatewayProxy(once.source);
  assert.equal(twice.changed, false);
  assert.equal(twice.source, once.source);
});

