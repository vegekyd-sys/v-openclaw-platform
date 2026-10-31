#!/usr/bin/env node
// Candidate-only: while CODEX_FORCE_RESUME_FILE exists the warm path sees a config change, so the next
// turn takes the thread/resume branch. A real config change cannot be made from chat.send alone.
//   node codex-force-thread-resume.mjs <@openclaw/codex/dist>
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2];
const name = fs.readdirSync(dist).find((f) => /^thread-lifecycle-.*\.js$/u.test(f) && !f.includes(".bak"));
assert(name);
const file = path.join(dist, name);
const from = "if (!incognito && retainedThread.configFingerprint !== liveThreadConfigFingerprint) {";
const to = "if (!incognito && (retainedThread.configFingerprint !== liveThreadConfigFingerprint || process.getBuiltinModule(\"node:fs\").existsSync(process.env.CODEX_FORCE_RESUME_FILE))) {";
const text = fs.readFileSync(file, "utf8");
if (!text.includes(to)) {
  assert.equal(text.split(from).length, 2, "warm-path config check");
  fs.writeFileSync(file, text.replace(from, () => to));
}
