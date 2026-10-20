// §2.c ledger: atomic async writes, CAS, LOCK, DISABLED, run records, archive, crash hook.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { newBatchId, newSendId, runRecordName } from "../core/contracts.js";
import { ARCHIVE_AFTER_MS, Ledger, LedgerLockedError } from "../core/ledger.js";
import { tmpDir } from "./fixtures/harness.mjs";

const send = (over = {}) => ({ v: 2, sendId: newSendId(), code: "7F3A", idempotencyKey: "ss:" + "a".repeat(32), contentKey: "c", phase: "accepted", createdAt: Date.now(), requester: { sessionKey: "a" }, target: { sessionKey: "b" }, ...over });

test("ledger: records land as whole JSON files, CAS checks the phase, history is capped", async () => {
  const dir = tmpDir();
  const ledger = await Ledger.open(dir, { crashAt: null });
  const rec = await ledger.createSend(send());
  const file = path.join(dir, "sends", `${rec.sendId}.json`);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).phase, "accepted");
  assert.equal(ledger.findByIdempotencyKey(rec.idempotencyKey).sendId, rec.sendId);

  assert.equal(await ledger.updateSend(rec.sendId, (d) => { d.phase = "running"; }, { from: ["queued"] }), null);
  const next = await ledger.updateSend(rec.sendId, (d) => { d.phase = "posting"; }, { from: ["accepted"] });
  assert.equal(next.phase, "posting");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).phase, "posting");
  assert.equal(await ledger.updateSend(rec.sendId, () => false), null, "mutate can give up");
  // Concurrent updates apply in order and the file ends with the last state.
  await Promise.all(Array.from({ length: 40 }, (_, i) => ledger.updateSend(rec.sendId, (d) => { d.phase = i % 2 ? "queued" : "posted"; d.n = i; })));
  const disk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(disk.n, 39);
  assert.equal(disk.history.length, 30);
  assert.deepEqual(ledger.getSend(rec.sendId), disk);
  assert.deepEqual(fs.readdirSync(path.join(dir, "sends")).filter((f) => f.endsWith(".tmp")), []);
  await ledger.close();

  // Reopen: loads sends/ and drops stale temp files.
  fs.writeFileSync(path.join(dir, "sends", "junk.json.123.1.tmp"), "{");
  fs.writeFileSync(path.join(dir, "sends", "broken.json"), "{not json");
  const again = await Ledger.open(dir, { crashAt: null });
  assert.equal(again.getSend(rec.sendId).n, 39);
  assert.equal(again.findByIdempotencyKey(rec.idempotencyKey).sendId, rec.sendId);
  assert(!fs.existsSync(path.join(dir, "sends", "junk.json.123.1.tmp")));
  await again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ledger: a failed write puts the previous record back and throws (no side effect may follow)", async () => {
  const dir = tmpDir();
  const ledger = await Ledger.open(dir, { crashAt: null });
  const rec = await ledger.createSend(send());
  fs.rmSync(path.join(dir, "sends"), { recursive: true, force: true });
  fs.writeFileSync(path.join(dir, "sends"), "not a directory");
  await assert.rejects(ledger.updateSend(rec.sendId, (d) => { d.phase = "posting"; }));
  assert.equal(ledger.getSend(rec.sendId).phase, "accepted");
  await assert.rejects(ledger.createSend(send({ idempotencyKey: "ss:" + "b".repeat(32) })));
  assert.equal(ledger.findByIdempotencyKey("ss:" + "b".repeat(32)), null);
  await ledger.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ledger: LOCK refuses a second live owner, takes over a dead one, releases on close", async () => {
  const dir = tmpDir();
  const first = await Ledger.open(dir, { crashAt: null, pid: 4242, isPidAlive: () => true, bootId: "boot-1" });
  await assert.rejects(Ledger.open(dir, { crashAt: null, pid: 4343, isPidAlive: () => true, bootId: "boot-1" }), LedgerLockedError);
  // A different boot means the old pid is not the same process.
  const otherBoot = await Ledger.open(dir, { crashAt: null, pid: 4343, isPidAlive: () => true, bootId: "boot-2" });
  await otherBoot.close();
  fs.writeFileSync(path.join(dir, "LOCK"), JSON.stringify({ pid: 4242, bootId: "boot-1", startedAt: 1 }));
  const takeover = await Ledger.open(dir, { crashAt: null, pid: 4343, isPidAlive: () => false, bootId: "boot-1" });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "LOCK"), "utf8")).pid, 4343);
  await takeover.close();
  assert(!fs.existsSync(path.join(dir, "LOCK")));
  // The same pid may reopen (plugin service restart in one process).
  const same = await Ledger.open(dir, { crashAt: null });
  const sameAgain = await Ledger.open(dir, { crashAt: null });
  await sameAgain.close();
  await same.close();
  await first.close(); // not its LOCK any more: left alone
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ledger: DISABLED switch (cached about a second, async)", async () => {
  const dir = tmpDir();
  let t = 1_000_000;
  const ledger = await Ledger.open(dir, { crashAt: null, now: () => t });
  assert.equal(await ledger.isDisabled(), false);
  fs.writeFileSync(path.join(dir, "DISABLED"), "");
  assert.equal(await ledger.isDisabled(), false, "cached");
  t += 1_500;
  assert.equal(await ledger.isDisabled(), true);
  await ledger.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ledger: run records are written by sha1(runId) and read on demand", async () => {
  const dir = tmpDir();
  const ledger = await Ledger.open(dir, { crashAt: null });
  const run = { runId: "v-a2a-req-s_x-0", sessionKey: "k", role: "request", chainId: "c", depth: 1, leaf: false, servesSendId: "s_x", batchId: null, createdAt: 1 };
  await ledger.putRun(run);
  assert(fs.existsSync(path.join(dir, "runs", runRecordName(run.runId))));
  await ledger.close();
  const again = await Ledger.open(dir, { crashAt: null });
  assert.equal(again.runs.size, 0, "runs are not loaded at startup");
  assert.deepEqual(await again.getRun(run.runId), run);
  assert.equal(await again.getRun("nope"), null);
  await again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ledger: sweep archives records closed for 24 h, keeps open ones, drops old archives", async () => {
  const dir = tmpDir();
  let t = Date.UTC(2026, 9, 20);
  const ledger = await Ledger.open(dir, { crashAt: null, now: () => t });
  const old = await ledger.createSend(send({ phase: "handed_back" }));
  const open = await ledger.createSend(send({ idempotencyKey: "ss:" + "c".repeat(32), phase: "running" }));
  const b = await ledger.createBatch({ v: 2, batchId: newBatchId(), phase: "woken", members: [], requester: {}, wake: {} });
  fs.mkdirSync(path.join(dir, "archive", "20260901"), { recursive: true });
  t += ARCHIVE_AFTER_MS + 1;
  const { moved } = await ledger.sweep();
  assert.equal(moved, 2);
  assert.equal(ledger.getSend(old.sendId), null);
  assert.equal(ledger.getSend(open.sendId).phase, "running");
  assert.equal(ledger.getBatch(b.batchId), null);
  const day = fs.readdirSync(path.join(dir, "archive")).filter((d) => d !== "20260901");
  assert.equal(day.length, 1);
  assert(fs.existsSync(path.join(dir, "archive", day[0], "sends", `${old.sendId}.json`)));
  assert(!fs.existsSync(path.join(dir, "archive", "20260901")), "archives older than 7 days are removed");
  await ledger.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ledger: VSR_CRASH_AT fires once, after the record with that phase is on disk", async () => {
  const dir = tmpDir();
  const crashes = [];
  const ledger = await Ledger.open(dir, { crashAt: "posted", onCrash: (info) => crashes.push(info) });
  const rec = await ledger.createSend(send());
  await ledger.updateSend(rec.sendId, (d) => { d.phase = "posting"; });
  assert.equal(crashes.length, 0);
  await ledger.updateSend(rec.sendId, (d) => { d.phase = "posted"; });
  assert.equal(crashes.length, 1);
  assert.equal(crashes[0].record.phase, "posted");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "sends", `${rec.sendId}.json`), "utf8")).phase, "posted");
  assert.equal(ledger.dead, true);
  await assert.rejects(ledger.updateSend(rec.sendId, (d) => { d.phase = "queued"; }), /crashed/u);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ledger: VSR_CRASH_AT=before:<phase> fires before that record is written", async () => {
  const dir = tmpDir();
  const crashes = [];
  const ledger = await Ledger.open(dir, { crashAt: "before:posted", onCrash: (info) => { crashes.push(info); throw new Error("crash"); } });
  const rec = await ledger.createSend(send());
  await ledger.updateSend(rec.sendId, (d) => { d.phase = "posting"; });
  await assert.rejects(ledger.updateSend(rec.sendId, (d) => { d.phase = "posted"; }), /crash/u);
  assert.equal(crashes.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "sends", `${rec.sendId}.json`), "utf8")).phase, "posting");
  assert.equal(ledger.getSend(rec.sendId).phase, "posting", "memory rolled back too");
  fs.rmSync(dir, { recursive: true, force: true });
});
