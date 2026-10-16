import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { BUILTIN_FILE, MARKER, patchBuiltinProjectionWait } from "./patch-projection-wait-all-inter-session.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const before = readFileSync(path.join(here, "fixtures/projection-wait", BUILTIN_FILE), "utf8");

test("every inter-session turn waits for the projection; the waiter itself is unchanged", () => {
  const after = patchBuiltinProjectionWait(before);
  assert.doesNotMatch(after, /\["subagent_announce", "agent_harness_task"\]\.includes\(provenance\.sourceTool\)/u);
  assert.match(after, /if \(provenance\?\.kind !== "inter_session"\) return;/u);
  const waiter = (s) => s.slice(s.indexOf("async function waitForSubagentCompletionProjection(input) {"), s.indexOf("async function prepareEmbeddedAttemptTranscriptLifecycle(input) {"));
  assert.equal(waiter(after).replace(/\n\t\/\/ projection-wait-inter-session-v1[^\n]*\n\t\/\/[^\n]*\n\tif \(provenance\?\.kind !== "inter_session"\) return;/u, ""),
    waiter(before).replace(/\n\tif \(provenance\?\.kind !== "inter_session" \|\| [^\n]*/u, ""), "only the provenance filter changed");
  assert.equal(after.length - before.length > 0, true);
  assert.throws(() => patchBuiltinProjectionWait(after), new RegExp(`already carries ${MARKER}`, "u"));
  assert.throws(() => patchBuiltinProjectionWait(`${before}\n`), /not V's db91.6 bytes/u);
  const dir = mkdtempSync(path.join(tmpdir(), "projection-wait-"));
  try {
    writeFileSync(path.join(dir, "patched.mjs"), after);
    execFileSync(process.execPath, ["--check", path.join(dir, "patched.mjs")]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(readFileSync(path.join(here, "release-files/projection-wait", BUILTIN_FILE), "utf8"), after, "release file is the patched V bytes");
});
