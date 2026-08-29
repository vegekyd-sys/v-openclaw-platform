import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobStore } from "../src/store.mjs";

test("concurrent creates with one idempotency key persist exactly one job record", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sandbox-job-store-race-"));
  try {
    const store = new JobStore(root);
    const input = {
      owner: "ou-owner",
      session: "agent:test:group:one",
      request: "run the same test once",
      idempotencyKey: "same-session:same-message",
      projectPath: "/tmp/project",
      command: ["npm", "test"],
      cpu: "1",
      memory: "2Gi",
      timeoutSeconds: 900,
      networkProfile: "offline",
      collect: [],
    };

    const results = await Promise.all(
      Array.from({ length: 24 }, () => store.create(structuredClone(input))),
    );

    assert.equal(new Set(results.map(({ job }) => job.id)).size, 1);
    assert.equal(results.filter(({ existing }) => !existing).length, 1);
    assert.equal((await store.list()).length, 1);
    assert.deepEqual(await readdir(store.idempotencyLocksDir), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
