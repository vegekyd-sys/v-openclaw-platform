import test from "node:test";
import assert from "node:assert/strict";
import {
  readAutomaticMaintenanceActivityFingerprint,
  waitForAutomaticMaintenanceQuietWindow,
} from "./release-files/automatic-maintenance-quiet-window.mjs";

test("quiet window resets on cross-process database activity", async () => {
  let at = 0;
  let fingerprint = "initial";
  let sleeps = 0;
  const window = await waitForAutomaticMaintenanceQuietWindow({
    databasePath: "/fixture/agent.sqlite",
    isCurrent: () => true,
    isLocallyIdle: () => true,
  }, {
    quietMs: 1_000,
    pollMs: 250,
    maxWaitMs: 5_000,
    now: () => at,
    readFingerprint: async () => fingerprint,
    sleep: async (ms) => {
      at += ms;
      sleeps += 1;
      if (sleeps === 2) fingerprint = "foreground-write";
    },
  });
  assert.equal(at, 1_500);
  assert.equal(window.fingerprint, "foreground-write");
  assert.equal(await window.changed(), false);
  fingerprint = "later-write";
  assert.equal(await window.changed(), true);
});

test("local admissions prevent a quiet window and stale owners stop waiting", async () => {
  let at = 0;
  let current = true;
  let idle = false;
  const result = await waitForAutomaticMaintenanceQuietWindow({
    databasePath: "/fixture/agent.sqlite",
    isCurrent: () => current,
    isLocallyIdle: () => idle,
  }, {
    quietMs: 500,
    pollMs: 100,
    maxWaitMs: 2_000,
    now: () => at,
    readFingerprint: async () => "stable",
    sleep: async (ms) => {
      at += ms;
      if (at === 300) idle = true;
      if (at === 500) current = false;
    },
  });
  assert.equal(result, null);
  assert.equal(at, 500);
});

test("database activity fingerprint tracks database and WAL content but ignores read-only ctime churn", async () => {
  const calls = [];
  const values = new Map([
    ["/fixture/agent.sqlite", {dev: 1n, ino: 2n, size: 3n, mtimeNs: 4n, ctimeNs: 5n}],
    ["/fixture/agent.sqlite-wal", {dev: 6n, ino: 7n, size: 8n, mtimeNs: 9n, ctimeNs: 10n}],
  ]);
  const fingerprint = await readAutomaticMaintenanceActivityFingerprint("/fixture/agent.sqlite", {
    stat: async (filename, options) => {
      calls.push([filename, options]);
      return {...values.get(filename), isFile: () => true};
    },
  });
  assert.equal(fingerprint, "1:2:3:4|6:7:8:9");
  assert.deepEqual(calls.map(([filename]) => filename), ["/fixture/agent.sqlite", "/fixture/agent.sqlite-wal"]);
  assert(calls.every(([, options]) => options.bigint === true));

  values.get("/fixture/agent.sqlite").ctimeNs = 50n;
  values.get("/fixture/agent.sqlite-wal").ctimeNs = 100n;
  assert.equal(await readAutomaticMaintenanceActivityFingerprint("/fixture/agent.sqlite", {
    stat: async (filename) => ({...values.get(filename), isFile: () => true}),
  }), fingerprint);
});

test("missing WAL has a stable explicit fingerprint", async () => {
  const fingerprint = await readAutomaticMaintenanceActivityFingerprint("/fixture/agent.sqlite", {
    stat: async (filename) => {
      if (filename.endsWith("-wal")) throw Object.assign(new Error("missing"), {code: "ENOENT"});
      return {dev: 1n, ino: 2n, size: 3n, mtimeNs: 4n, ctimeNs: 5n, isFile: () => true};
    },
  });
  assert.equal(fingerprint, "1:2:3:4|missing");
});
