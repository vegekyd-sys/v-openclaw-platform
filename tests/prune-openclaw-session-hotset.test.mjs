import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const pruner = path.join(
  repositoryRoot,
  "scripts",
  "prune-openclaw-session-hotset.mjs",
);
const modulePath = path.join(
  repositoryRoot,
  "experiments",
  "agent-worker-isolation-v1",
  "session-hotset.mjs",
);

test("offline pre-start pruning shrinks derived state without deleting Sessions", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-hotset-prune-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sessionDir = path.join(root, "makaron", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  const storePath = path.join(sessionDir, "sessions.json");
  const now = Date.now();
  const store = Object.fromEntries(
    Array.from({ length: 500 }, (_, index) => [
      `agent:makaron:explicit:${index}`,
      {
        sessionId: `session-${index}`,
        sessionFile: `/sessions/session-${index}.jsonl`,
        updatedAt: index < 490 ? now - 600_000 : now,
        compactionCheckpoints: [{ id: `checkpoint-${index}` }],
        skillsSnapshot: { skills: ["x".repeat(5_000)] },
        systemPromptReport: { tools: ["y".repeat(5_000)] },
      },
    ]),
  );
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
  const beforeBytes = fs.statSync(storePath).size;

  const report = JSON.parse(
    execFileSync(
      process.execPath,
      [pruner, root, modulePath, "180000"],
      { encoding: "utf8" },
    ),
  );
  const after = JSON.parse(fs.readFileSync(storePath, "utf8"));

  assert.equal(report.ok, true);
  assert.equal(report.totals.sessionCountBefore, 500);
  assert.equal(report.totals.sessionCountAfter, 500);
  assert.equal(report.totals.changedEntries, 490);
  assert.equal(Object.keys(after).length, 500);
  assert.equal(after["agent:makaron:explicit:0"].skillsSnapshot, undefined);
  assert.ok(after["agent:makaron:explicit:499"].skillsSnapshot);
  assert.deepEqual(
    after["agent:makaron:explicit:0"].compactionCheckpoints,
    [{ id: "checkpoint-0" }],
  );
  assert.ok(fs.statSync(storePath).size < beforeBytes / 5);
});
