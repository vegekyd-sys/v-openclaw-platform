import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vlab = "/Users/tianyicai/vlab-dev/lab/vlab.mjs";
const repo = "/Users/tianyicai/vlab-dev";
const file = {
  source: "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js",
  target: "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js",
  before: "1b19e786de9a5fc9793681b0ee2a9c3f2421ac0e2edcbf71a016e2b73be5f42e",
};

const result = JSON.parse(execFileSync(process.execPath, [vlab, "read-code", "--repo", repo,
  "--target", file.target], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
assert.equal(result.sha256, file.before, "deployed v10 source drift");
let candidate = Buffer.from(result.content, "base64").toString("utf8");
const before = `\tgetChildLogger({subsystem: "session-sqlite"}).warn("SQLite automatic maintenance trace", {\n` +
  `\t\tstage,\n\t\tpid: process.pid,\n\t\tcurrentOwner: current === owner,\n` +
  `\t\tcurrentGeneration: current?.generation,\n\t\townerGeneration: owner.generation,\n` +
  `\t\tdatabaseOpen: owner.database.db.isOpen,\n\t\t...details\n\t});`;
const after = `\tprocess.stderr.write(\`[db91-maintenance-trace] \${JSON.stringify({\n` +
  `\t\tstage,\n\t\tpid: process.pid,\n\t\tcurrentOwner: current === owner,\n` +
  `\t\tcurrentGeneration: current?.generation,\n\t\townerGeneration: owner.generation,\n` +
  `\t\tdatabaseOpen: owner.database.db.isOpen,\n\t\t...details\n\t})}\\n\`);`;
assert.equal(candidate.split(before).length - 1, 1, "v10 trace sink not found exactly once");
candidate = candidate.replace(before, after);
assert.equal(candidate, fs.readFileSync(path.join(root, file.source), "utf8"),
  "v10b trace sink candidate differs from deterministic patch");
console.log(JSON.stringify({ ...file, bytes: Buffer.byteLength(candidate) }, null, 2));
