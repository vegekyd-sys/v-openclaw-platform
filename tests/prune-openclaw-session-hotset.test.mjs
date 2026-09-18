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
  assert.equal(report.outcome, "projected");
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

function fileSnapshot(root) {
  const out = {};
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath ?? entry.path, entry.name);
    out[path.relative(root, full)] = fs.readFileSync(full, "utf8");
  }
  return out;
}

test("SQLite-era per-session layout is reported as a no-op, not as success", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-hotset-prune-sqlite-"));
  try {
    // Production shape since the SQLite session store (2026.9.1): one .jsonl
    // per Session plus trajectory sidecars and a store.sqlite, and no central
    // sessions.json at all. This is the layout the pruner met on V and on the
    // shared VLab, where it reported ok=true while touching nothing.
    for (const agent of ["makaron", "main"]) {
      const sessionDir = path.join(root, agent, "sessions");
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(root, agent, "store.sqlite"), "");
      for (const id of [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ]) {
        fs.writeFileSync(path.join(sessionDir, `${id}.jsonl`), "{}\n");
        fs.writeFileSync(path.join(sessionDir, `${id}.trajectory.jsonl`), "{}\n");
        fs.writeFileSync(path.join(sessionDir, `${id}.trajectory-path.json`), "{}\n");
      }
    }
    const before = fileSnapshot(root);

    // execFileSync throws on a non-zero exit, so this also proves the pruner
    // still exits 0: it runs as ExecStartPre and must never block Gateway start.
    const report = JSON.parse(
      execFileSync(process.execPath, [pruner, root, modulePath, "180000"], {
        encoding: "utf8",
      }),
    );

    assert.equal(report.ok, false);
    assert.equal(report.outcome, "no-central-store");
    assert.match(report.note, /SQLite/);
    assert.equal(report.stores.length, 2);
    assert.ok(report.stores.every((store) => store.skipped === "missing"));
    assert.equal(report.totals.changedEntries, 0);
    assert.deepEqual(fileSnapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an agents root with no agent directories is not success either", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-hotset-prune-empty-"));
  try {
    const report = JSON.parse(
      execFileSync(process.execPath, [pruner, root, modulePath, "180000"], {
        encoding: "utf8",
      }),
    );
    assert.equal(report.ok, false);
    assert.equal(report.outcome, "nothing-to-project");
    assert.equal(report.stores.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
