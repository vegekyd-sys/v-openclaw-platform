import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

// OpenClaw refuses agent tools a plugin did not declare ("plugin must declare contracts.tools
// before registering agent tools"); the tools then silently never reach V (shared VLab 2026-11-18).
test("every tool index.js registers is declared in openclaw.plugin.json contracts.tools", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8"));
  const source = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const registered = [...new Set([...source.matchAll(/name: "(meeting_\w+)"/gu)].map((m) => m[1]))].sort();
  assert.deepEqual(registered, ["meeting_join", "meeting_leave", "meeting_say", "meeting_screenshot"]);
  assert.deepEqual([...(manifest.contracts?.tools ?? [])].sort(), registered);
});
