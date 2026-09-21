import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTROL_UI_BUILD_QUERY_KEY,
  CONTROL_UI_BUILD_QUERY_VALUE,
  patchControlUiVersionedModuleGraph,
} from "./patch-control-ui-versioned-module-graph.mjs";

const inputPath = resolve(
  import.meta.dirname,
  "release-files/xiaohe-ui-cache-bust/control-ui-DhD7PO_6.js",
);

test("patches the accepted server bundle exactly once and is idempotent", () => {
  const before = readFileSync(inputPath, "utf8");
  const after = patchControlUiVersionedModuleGraph(before);
  assert.notEqual(after, before);
  assert.equal(patchControlUiVersionedModuleGraph(after), after);
  assert.match(after, /versionControlUiIndexAssets/);
  assert.match(after, /versionControlUiModuleImports/);
  assert.match(after, /precompressed: immutableAsset && !versionedModuleRequest/);
  assert.match(after, /encoding: versionedModuleRequest \? "identity" : representation\.encoding/);
  assert.match(after, new RegExp(`${CONTROL_UI_BUILD_QUERY_KEY}.*${CONTROL_UI_BUILD_QUERY_VALUE}`));
});

test("the injected rewriter versions static and dynamic module imports", () => {
  const before = readFileSync(inputPath, "utf8");
  const after = patchControlUiVersionedModuleGraph(before);
  const helperStart = after.indexOf("function versionControlUiModuleImports");
  const helperEnd = after.indexOf("/** Anchors bundled assets", helperStart);
  const helperSource = after.slice(helperStart, helperEnd);
  const factory = new Function(
    `${helperSource}; return versionControlUiModuleImports;`,
  );
  const rewrite = factory();
  const value = [
    'import x from "./alpha.js";',
    "const y = import(`./beta.runtime.js`);",
    "const z = '/assets/gamma.js';",
    'const untouched = "./image.png";',
  ].join("\n");
  const query = `?${CONTROL_UI_BUILD_QUERY_KEY}=${CONTROL_UI_BUILD_QUERY_VALUE}`;
  const output = rewrite(value);
  assert.match(output, new RegExp(`alpha\\.js\\${query}`));
  assert.match(output, new RegExp(`beta\\.runtime\\.js\\${query}`));
  assert.match(output, new RegExp(`gamma\\.js\\${query}`));
  assert.match(output, /\.\/image\.png/);
});
