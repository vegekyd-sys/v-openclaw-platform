import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ROUTED_CALL,
  ROUTING_IMPORT,
  patchWorkerHarnessModelRouting,
} from "./patch-worker-harness-model-routing.mjs";

const fixture = fs.readFileSync(
  new URL("./fixtures/seeduplex-voice-provider/production-worker-index.mjs", import.meta.url),
  "utf8",
);

test("patches Worker model routing exactly once", () => {
  const patched = patchWorkerHarnessModelRouting(fixture);
  assert.equal(patched.split(ROUTING_IMPORT).length - 1, 1);
  assert.equal(patched.split(ROUTED_CALL).length - 1, 1);
  assert.equal(patchWorkerHarnessModelRouting(patched), patched);
});

test("fails closed on partial application or source drift", () => {
  assert.throws(
    () => patchWorkerHarnessModelRouting(`${fixture}\n${ROUTING_IMPORT}`),
    /partially applied/,
  );
  assert.throws(
    () => patchWorkerHarnessModelRouting("unrelated"),
    /refuses import-anchor drift/,
  );
});
