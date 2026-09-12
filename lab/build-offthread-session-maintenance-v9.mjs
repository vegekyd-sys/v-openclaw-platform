import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRelease = "offthread-session-maintenance-20260912-v8";
const sha = value => createHash("sha256").update(value).digest("hex");
const once = (value, from, to) => {
  assert.equal(value.split(from).length, 2, `anchor drift: ${from.slice(0, 120)}`);
  return value.replace(from, to);
};
function readCode(target, expectedHash) {
  const result = JSON.parse(execFileSync(process.execPath, [
    "/Users/tianyicai/vlab-dev/lab/vlab.mjs", "read-code", "--repo", "/Users/tianyicai/vlab-dev", "--target", target,
  ], { encoding: "utf8", maxBuffer: 20 * 1024 ** 2 }));
  assert.equal(result.current.release, baseRelease);
  assert.equal(result.sha256, expectedHash);
  const value = Buffer.from(result.content, "base64").toString();
  assert.equal(sha(value), expectedHash);
  return value;
}

const file = {
  source: "lab/release-files/automatic-maintenance-quiet-window.mjs",
  target: "openclaw/dist/automatic-maintenance-quiet-window.mjs",
  before: "d8a04c2b1bba7928567f945b7fcce090ec336d75ab1247fa0b4f11cdc81bba87",
};
let candidate = readCode(file.target, file.before);
candidate = once(candidate,
  `    return [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(":");\n`,
  `    // A read-only SQLite connection can update WAL ctime while taking/releasing\n` +
  `    // locks even though the WAL contents did not change. Including ctime makes\n` +
  `    // the isolated planner observe its own read as foreground write activity\n` +
  `    // and interrupt itself. Device/inode still detect replacement; size/mtime\n` +
  `    // track content changes without that self-interference.\n` +
  `    return [value.dev, value.ino, value.size, value.mtimeNs].join(":");\n`,
);
assert.equal(candidate, fs.readFileSync(path.join(root, file.source), "utf8"), "v9 quiet-window candidate differs from deterministic patch");

console.log(JSON.stringify({baseRelease, files: [{...file, candidate: sha(candidate)}]}, null, 2));
