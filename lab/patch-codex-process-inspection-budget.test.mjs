import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MARKER, TRANSPORT_FILE, patchCodexProcessInspectionBudget } from "./patch-codex-process-inspection-budget.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const before = readFileSync(path.join(here, "fixtures/codex-process-inspection", TRANSPORT_FILE), "utf8");

test("identity inspection gets 15 s and one retry; containment keeps its 2 s", () => {
  const after = patchCodexProcessInspectionBudget(before);
  assert.match(after, /const PROCESS_IDENTITY_INSPECTION_MS = 15e3;/u);
  assert.match(after, /async function readCodexAppServerProcessSnapshot\(deadline = Date\.now\(\) \+ PROCESS_IDENTITY_INSPECTION_MS, pids\)/u);
  assert.equal(after.match(/withProcessInspectionRetry\(\(\) =>/gu).length, 3, "reap snapshot, register snapshot, register command");
  // containment: its constants and every explicit-deadline call are untouched
  assert.match(after, /const MAX_PROCESS_CONTAINMENT_MS = 2e3;/u);
  const containment = (s) => s.slice(s.indexOf("//#region extensions/codex/src/app-server/transport-process-containment.ts"), s.indexOf("async function reapRegisteredCodexAppServerOrphans"));
  assert.equal(containment(after), containment(before));
  // only deadline failures are retried
  assert.match(after, /if \(!\(error instanceof ProcessInspectionError\) \|\| error\.reason !== "deadline"\) throw error;/u);
  assert.throws(() => patchCodexProcessInspectionBudget(after), new RegExp(`already carries ${MARKER}`, "u"));
  assert.throws(() => patchCodexProcessInspectionBudget(`${before}\n`), /not V's bytes/u);
  const dir = mkdtempSync(path.join(tmpdir(), "codex-inspection-"));
  try {
    writeFileSync(path.join(dir, "patched.mjs"), after);
    execFileSync(process.execPath, ["--check", path.join(dir, "patched.mjs")]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(readFileSync(path.join(here, "release-files/codex-process-inspection", TRANSPORT_FILE), "utf8"), after);
});
