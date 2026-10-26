// CI entry for the v-session-relay plugin's own tests (apps/ is outside the catalog's
// test discovery, design §10.1). Every *.test.mjs in the plugin's tests/ directory is
// imported, so tests added or removed there need no change here.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const dir = new URL("../apps/v-session-relay/plugin/tests/", import.meta.url);
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).sort();

test("v-session-relay plugin tests are present", () => {
  assert(files.includes("contracts.test.mjs"), `plugin tests found: ${files.join(", ")}`);
});

for (const name of files) await import(new URL(name, dir));
