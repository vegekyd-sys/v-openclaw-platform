// CI entry for the v-scan-guard plugin's own tests (apps/ is outside the catalog's test
// discovery). Every *.test.mjs in the plugin's tests/ directory is imported.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const dir = new URL("../apps/v-scan-guard/plugin/tests/", import.meta.url);
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).sort();

test("v-scan-guard plugin tests are present", () => {
  assert.deepEqual(files, ["hook.test.mjs", "scan.test.mjs"]);
});

for (const name of files) await import(new URL(name, dir));
