import assert from "node:assert/strict";
import test from "node:test";

import {
  PATCH_MARKER,
  patchWorkerExecConfigDomainBundle,
} from "./patch-openclaw-worker-exec-config-domain.mjs";

const fixture = `
function createExecRequestPreparation(params) {
\tconst normalizeParams = (rawArgs) => rawArgs;
\tconst prepareParamsWithResolvedExecEnv = async (rawArgs, context) => {
\t\tconst execParams = normalizeParams(rawArgs);
\t\tif (!execParams.command) return execParams;
\t\tif (isResolveExecEnvPrepared(execParams)) return markResolveExecEnvPrepared(execParams);
\t\tconst hookRunner = getGlobalHookRunner();
\t\treturn execParams;
\t};
}
`;

test("pins local Worker exec commands to the Gateway config domain", () => {
  const result = patchWorkerExecConfigDomainBundle(fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(result.source, /VLAB_GATEWAY_CONFIG_PATH/);
  assert.match(result.source, /isolatedWorkerExecHost !== "sandbox"/);
  assert.match(result.source, /VLAB_ACTIVE_CONFIG_DOMAIN: "gateway"/);
  assert.doesNotThrow(() => new Function(result.source));
  assert.equal(
    patchWorkerExecConfigDomainBundle(result.source).changed,
    false,
  );
});
