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
  before: "cec4a1bd7398dc0245a12262ac618d042125630e71c5396128aec81da4795de9",
};
const result = JSON.parse(execFileSync(process.execPath, [vlab, "read-code", "--repo", repo,
  "--target", file.target], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
assert.equal(result.sha256, file.before, "deployed v10c source drift");
let candidate = Buffer.from(result.content, "base64").toString("utf8");
const before = `\t\t\ttraceAutomaticMaintenance("failed", databasePath, owner, {\n` +
  `\t\t\t\terrorName: error instanceof Error ? error.name : typeof error\n\t\t\t});`;
const after = `\t\t\ttraceAutomaticMaintenance("failed", databasePath, owner, {\n` +
  `\t\t\t\terrorName: error instanceof Error ? error.name : typeof error,\n` +
  `\t\t\t\terrorCode: typeof error?.code === "string" ? error.code : void 0,\n` +
  `\t\t\t\terrorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)\n` +
  `\t\t\t});`;
assert.equal(candidate.split(before).length - 1, 1, "v10c failure trace not found exactly once");
candidate = candidate.replace(before, after);
assert.equal(candidate, fs.readFileSync(path.join(root, file.source), "utf8"),
  "v10d trace candidate differs from deterministic patch");
console.log(JSON.stringify({ ...file, bytes: Buffer.byteLength(candidate) }, null, 2));
