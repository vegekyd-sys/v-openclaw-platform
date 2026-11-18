// CI entry for the v-meeting-bridge plugin's own tests (apps/ is outside the catalog's test
// discovery). Every *.test.mjs in the plugin's tests/ directory is imported.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const dir = new URL("../apps/v-meeting-bridge/plugin/tests/", import.meta.url);
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).sort();

test("v-meeting-bridge plugin tests are present", () => {
  assert(files.includes("bridge.test.mjs"), `plugin tests found: ${files.join(", ")}`);
});

for (const name of files) await import(new URL(name, dir));
