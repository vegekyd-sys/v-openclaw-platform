// Corpus check for lab/release-files/transcript-index-prepare/session-transcript-index-9itOio9h.js:
// every session in the shared VLab agent database (V's data copy), opened read-only, prepared by
// V's original chunk and by the candidate runtime's chunk (the patched one), outputs compared.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const shared = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && shared, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const name = "session-transcript-index-9itOio9h.js";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const patchedSource = fs.readFileSync(path.join(dist, name));
assert.equal(sha(patchedSource), "5504f5decee060251f991e658a809a53e2548e4727cfb2838499a5a7c2ce84b1", "candidate runtime does not run the patched chunk");
const beside = path.join(dist, `session-transcript-index-v-original-${process.pid}.js`);
fs.copyFileSync("lab/fixtures/transcript-index-prepare/session-transcript-index-9itOio9h.js", beside);
assert.equal(sha(fs.readFileSync(beside)), "ae034fcf43287501cf1417231e6e2e09638c03a0729795e53d59c8fb8b6db42d");
try {
  const patched = (await import(path.join(dist, name))).g;
  const original = (await import(beside)).g;
  const db = new DatabaseSync(path.join(shared, "agents/makaron/agent/openclaw-agent.sqlite"), { readOnly: true });
  const ids = db.prepare("SELECT session_id FROM session_windows ORDER BY session_id").all().map((r) => r.session_id);
  let same = 0, empty = 0, rows = 0, origMs = 0, patchMs = 0;
  const diffs = [];
  for (const id of ids) {
    let t = performance.now();
    const a = original(db, id);
    origMs += performance.now() - t;
    t = performance.now();
    const b = patched(db, id);
    patchMs += performance.now() - t;
    if (!a) { empty += 1; assert.equal(b, a); continue; }
    rows += a.activeRows.length + a.ftsRows.length;
    try { assert.deepStrictEqual(b, a); same += 1; } catch { diffs.push(id); }
  }
  db.close();
  const out = { sessions: ids.length, identical: same, withoutTranscript: empty, differing: diffs.length, diffs: diffs.slice(0, 10), projectedRows: rows, originalMs: Math.round(origMs), patchedMs: Math.round(patchMs) };
  console.log(JSON.stringify(out));
  assert.equal(diffs.length, 0, "patched prepare differs from V's original");
} finally {
  fs.rmSync(beside, { force: true });
}
