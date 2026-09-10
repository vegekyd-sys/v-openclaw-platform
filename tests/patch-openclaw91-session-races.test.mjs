import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchLiveModelSwitchBundle,
  patchPackage,
  patchReplySessionPersistenceBundle,
  patchSqliteSessionAccessorBundle,
  restorePackage,
} from "../scripts/patch-openclaw91-session-races.mjs";

const liveSwitchFixture = `
function modelKey(provider, model) { return provider + "/" + model; }
function resolveLiveSessionModelSwitchRedirectIndex(params) {
\tconst targetKey = modelKey(params.error.provider, params.error.model);
\tconst targetIndex = params.candidates.findIndex((candidate) => modelKey(candidate.provider, candidate.model) === targetKey);
\tif (targetIndex === -1) throw params.error;
\treturn targetIndex > params.currentIndex ? targetIndex : null;
}`;

const sqliteFixture = `
let calls = 0;
async function patchSqliteSessionEntrySnapshot(params) {
  calls += 1;
  if (calls < 3) {
    const error = new Error("SQLite session state changed while preparing session-entry.patch");
    error.name = "SqliteSessionMutationConflictError";
    throw error;
  }
  return { calls };
}`;

const persistenceFixture = `
async function persistReplySessionEntry(params) {
  return await patchSessionEntryCore({}, (entry) => {
    return params.entry;
\t}, {
\t\tfallbackEntry: params.entry,
\t\treplaceEntry: true,
\t\tskipMaintenance: params.skipMaintenance
\t});
}`;

async function importFixture(source, exports) {
  const moduleSource = `${source}\nexport { ${exports.join(", ")} };`;
  return await import(`data:text/javascript,${encodeURIComponent(moduleSource)}`);
}

test("same-model live switches escape fallback and rebuild auth/runtime state", async () => {
  const result = patchLiveModelSwitchBundle(liveSwitchFixture);
  assert.equal(result.changed, true);
  const runtime = await importFixture(result.source, [
    "resolveLiveSessionModelSwitchRedirectIndex",
  ]);
  const sameModel = Object.assign(new Error("switch"), {
    provider: "deepseek",
    model: "deepseek-v4-pro",
  });
  assert.throws(
    () => runtime.resolveLiveSessionModelSwitchRedirectIndex({
      error: sameModel,
      candidates: [{ provider: "deepseek", model: "deepseek-v4-pro" }],
      currentIndex: 0,
    }),
    (error) => error === sameModel,
  );
  assert.equal(
    runtime.resolveLiveSessionModelSwitchRedirectIndex({
      error: Object.assign(new Error("forward"), {
        provider: "openai",
        model: "gpt-5.6-sol",
      }),
      candidates: [
        { provider: "deepseek", model: "deepseek-v4-pro" },
        { provider: "openai", model: "gpt-5.6-sol" },
      ],
      currentIndex: 0,
    }),
    1,
  );
  assert.equal(patchLiveModelSwitchBundle(result.source).changed, false);
});

test("SQLite snapshot conflicts retry only for explicitly safe callers", async () => {
  const optedIn = patchSqliteSessionAccessorBundle(sqliteFixture);
  const runtime = await importFixture(optedIn.source, [
    "patchSqliteSessionEntrySnapshot",
  ]);
  assert.deepEqual(
    await runtime.patchSqliteSessionEntrySnapshot({
      options: { retrySnapshotConflicts: true },
    }),
    { calls: 3 },
  );

  const noRetry = patchSqliteSessionAccessorBundle(sqliteFixture.replace(
    "let calls = 0;",
    "let calls = -20;",
  ));
  const noRetryRuntime = await importFixture(noRetry.source, [
    "patchSqliteSessionEntrySnapshot",
  ]);
  await assert.rejects(
    noRetryRuntime.patchSqliteSessionEntrySnapshot({ options: {} }),
    { name: "SqliteSessionMutationConflictError" },
  );
  assert.equal(patchSqliteSessionAccessorBundle(optedIn.source).changed, false);
});

test("reply-session persistence opts into the pure optimistic retry", () => {
  const result = patchReplySessionPersistenceBundle(persistenceFixture);
  assert.equal(result.changed, true);
  assert.match(result.source, /retrySnapshotConflicts: true/);
  assert.equal(patchReplySessionPersistenceBundle(result.source).changed, false);
});

test("package patch is exact, idempotent, and reversible", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oc64-session-races-"));
  try {
    const dist = path.join(root, "dist");
    await mkdir(dist);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "openclaw", version: "2026.9.1" }),
    );
    const files = new Map([
      ["model-fallback-attempt-test.js", liveSwitchFixture],
      ["session-accessor.sqlite-entry-test.js", sqliteFixture],
      ["session-entry-persistence-test.js", persistenceFixture],
      [
        "session-entry-persistence-public.js",
        `import { t as persistReplySessionEntry } from "./session-entry-persistence-test.js";\nexport { persistReplySessionEntry };\n`,
      ],
    ]);
    for (const [name, source] of files) {
      await writeFile(path.join(dist, name), source);
    }

    const first = await patchPackage(root);
    assert.equal(first.filter((entry) => entry.changed).length, 3);
    const second = await patchPackage(root);
    assert.equal(second.filter((entry) => entry.changed).length, 0);
    const restored = await restorePackage(root);
    assert.equal(restored.filter((entry) => entry.changed).length, 3);
    for (const [name, source] of files) {
      assert.equal(await readFile(path.join(dist, name), "utf8"), source);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
