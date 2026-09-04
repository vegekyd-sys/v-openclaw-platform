import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

const script = new URL("../../../scripts/apply-openclaw91-workboard-parity-patch.mjs", import.meta.url);
const fixture = process.env.OPENCLAW91_RUNTIME_FIXTURE;

test("patches the exact OpenClaw 9.1 Workboard runtime when a fixture is available", { skip: !fixture }, () => {
  const root = mkdtempSync(join(tmpdir(), "openclaw91-workboard-parity-"));
  const dist = join(root, "dist");
  const backup = join(root, "backup");
  mkdirSync(dist);
  mkdirSync(backup);
  const bundle = join(dist, basename(fixture));
  copyFileSync(fixture, bundle);

  const result = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
  const patched = readFileSync(bundle, "utf8");
  assert.equal(result.changed, true);
  assert.match(patched, /NIGHTSHIFT_OPENCLAW91_WORKBOARD_PARITY_PATCH = 1/);
  assert.match(patched, /listWorkboardCards\(store, boardId, cardIds, redactCard\)/);
  assert.match(patched, /store\.list\(\{ boardId, cardIds \}\)/);
  assert.match(patched, /requestParams\.cardIds/);
  assert.match(patched, /NIGHTSHIFT_DISPATCH_MAX_PER_OWNER = 36/);
  assert.match(patched, /NIGHTSHIFT_DISPATCH_MAX_TOTAL = 36/);
  execFileSync(process.execPath, ["--check", bundle]);

  const second = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
  assert.equal(second.status, "already-patched");
});
