// Builds the context-window-read release from V's exact db91.6 bytes
// (lab/fixtures/context-window-read, captured from V core/dist 2026-10-08).
// Never touches a live runtime. With --verify-vlab it also confirms that shared
// VLab still serves the same session-manager bytes (read-only read-code).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { patchSessionManagerContextWindow, SESSION_MANAGER_BEFORE, SESSION_MANAGER_FILE } from "./patch-context-window-read.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = "lab/release-files/context-window-read";
const target = `openclaw/dist/${SESSION_MANAGER_FILE}`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (process.argv.includes("--verify-vlab")) {
  const result = JSON.parse(execFileSync(process.execPath, [
    "/Users/tianyicai/vlab-dev/lab/vlab.mjs", "read-code", "--repo", "/Users/tianyicai/vlab-dev", "--target", target,
  ], { encoding: "utf8", maxBuffer: 16 * 1024 ** 2, timeout: 120_000 }));
  assert.equal(result.sha256, SESSION_MANAGER_BEFORE, `VLab ${target} differs from V`);
  console.log(JSON.stringify({ vlabRelease: result.current.release, [SESSION_MANAGER_FILE]: "matches V" }));
}

const before = readFileSync(path.join(root, "lab/fixtures/context-window-read", SESSION_MANAGER_FILE), "utf8");
assert.equal(sha256(before), SESSION_MANAGER_BEFORE, "fixture is not V's bytes");
const after = patchSessionManagerContextWindow(before);
mkdirSync(path.join(root, releaseDir), { recursive: true });
const source = `${releaseDir}/${SESSION_MANAGER_FILE}`;
writeFileSync(path.join(root, source), after);
const files = [{ source, target, before: SESSION_MANAGER_BEFORE }];
console.log(JSON.stringify({ target, before: SESSION_MANAGER_BEFORE, after: sha256(after) }));
writeFileSync(path.join(root, "lab/context-window-read-plan.json"), `${JSON.stringify({ files }, null, 2)}\n`);
