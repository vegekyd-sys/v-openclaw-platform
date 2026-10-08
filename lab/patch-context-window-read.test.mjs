import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { patchSessionManagerContextWindow, SESSION_MANAGER_FILE } from "./patch-context-window-read.mjs";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/context-window-read", SESSION_MANAGER_FILE);

test("patches V's bytes once, keeps the full scan as the fallback and parses", () => {
  const before = readFileSync(fixture, "utf8");
  const after = patchSessionManagerContextWindow(before);
  assert.equal(after.split("function withTranscriptContextSnapshot(scope, view, read) {").length, 2);
  assert.equal(after.split("function withTranscriptContextSnapshotFullScan(scope, view, read) {").length, 2);
  assert.match(after, /operationLabel: "session context snapshot read"/u, "the full scan keeps its label");
  assert.match(after, /operationLabel: "session context window read"/u);
  assert.match(after, /OPENCLAW_V_CONTEXT_WINDOW_READ === "0"/u);
  assert.throws(() => patchSessionManagerContextWindow(after), /already carries/u);
  assert.throws(() => patchSessionManagerContextWindow(`${before}\n`), /not V's db91.6 bytes/u);
  const dir = mkdtempSync(path.join(tmpdir(), "context-window-read-"));
  try {
    const file = path.join(dir, "patched.mjs");
    writeFileSync(file, after);
    execFileSync(process.execPath, ["--check", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
