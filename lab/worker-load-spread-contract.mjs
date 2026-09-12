// Undo only the reviewed Session load-spread delta for byte-level baseline tests.
import assert from "node:assert/strict";

function once(source, from, to) {
  assert.equal(source.split(from).length, 2, "Worker load-spread patch anchor drift");
  return source.replace(from, to);
}

export function restoreWorkerLoadSpread(source) {
  const start = source.indexOf("\n  compareSessionWorkerLoad(left, right) {");
  const end = source.indexOf("\n  async pump() {", start);
  assert.ok(start > 0 && end > start, "Worker load-spread methods missing");
  source = once(source, source.slice(start, end), "");
  return once(
    source,
    "        if (!worker) worker = this.selectSessionWorker(job.sessionOwnerKey);",
    `        if (!worker) {
          worker = this.preferredSessionWorker(job.sessionOwnerKey) ?? [...this.workers.values()].find(
            (candidate) =>
              candidate.ready &&
              !candidate.retiring &&
              candidate.ownerSessionKeys.size < this.sessionsPerWorker,
          );
        }`,
  );
}
