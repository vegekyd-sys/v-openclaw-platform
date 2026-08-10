import assert from "node:assert/strict";
import test from "node:test";
import {
  PATCH_MARKER,
  patchSkillWorkshopWorkerProxy,
} from "./patch-openclaw-skill-workshop-worker-proxy.mjs";

const fixture = `
/** Create the Skill Workshop tool for proposal discovery and lifecycle actions. */
function createSkillWorkshopTool(options) {
\treturn {
\t\texecute: async (_toolCallId, args) => {
\t\t\treturn { options, args };
\t\t}
\t};
}
//#endregion
`;

test("routes only the Worker skill_workshop tool through the process proxy", () => {
  const result = patchSkillWorkshopWorkerProxy(fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(
    result.source,
    /versa\.vlab\.gateway-owned-tool-proxy-v1/,
  );
  assert.match(result.source, /toolName: "skill_workshop"/);
  assert.doesNotMatch(result.source, /^\+\s*const workerToolProxy/m);
  assert.match(result.source, /workspaceDir: options\.workspaceDir/);
  assert.doesNotThrow(() => new Function(result.source));
});

test("is idempotent", () => {
  const once = patchSkillWorkshopWorkerProxy(fixture);
  const twice = patchSkillWorkshopWorkerProxy(once.source);
  assert.equal(twice.changed, false);
  assert.equal(twice.source, once.source);
});
