import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("../../../scripts/apply-openclaw91-workboard-parity-patch.mjs", import.meta.url);
const fixture = process.env.OPENCLAW91_DIST_FIXTURE;

test("patches the exact OpenClaw 9.1 Workboard runtime when a fixture is available", { skip: !fixture }, () => {
  const root = mkdtempSync(join(tmpdir(), "openclaw91-workboard-parity-"));
  const dist = join(root, "dist");
  const backup = join(root, "backup");
  mkdirSync(dist);
  mkdirSync(backup);
  for (const name of readdirSync(fixture).filter((name) => /^(runtime-api|sqlite-store)-.*\.js$/.test(name))) {
    copyFileSync(join(fixture, name), join(dist, name));
  }

  const result = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
  const runtimeName = readdirSync(dist).find((name) => name.startsWith("runtime-api-"));
  const sqliteName = readdirSync(dist).find((name) => name.startsWith("sqlite-store-"));
  const bundle = join(dist, runtimeName);
  const sqliteBundle = join(dist, sqliteName);
  const patched = readFileSync(bundle, "utf8");
  const sqlitePatched = readFileSync(sqliteBundle, "utf8");
  assert.equal(result.changed, true);
  assert.match(patched, /NIGHTSHIFT_OPENCLAW91_WORKBOARD_PARITY_PATCH = 1/);
  assert.match(patched, /listWorkboardCards\(store, boardId, cardIds, redactCard\)/);
  assert.match(patched, /store\.list\(\{ boardId, cardIds \}\)/);
  assert.match(patched, /requestParams\.cardIds/);
  assert.match(patched, /NIGHTSHIFT_DISPATCH_MAX_PER_OWNER = 36/);
  assert.match(patched, /NIGHTSHIFT_DISPATCH_MAX_TOTAL = 36/);
  assert.match(sqlitePatched, /NIGHTSHIFT_OPENCLAW91_SQLITE_OWNER_CAP_PATCH = 36/);
  assert.match(sqlitePatched, /activeForOwner >= NIGHTSHIFT_OPENCLAW91_SQLITE_OWNER_CAP_PATCH/);
  execFileSync(process.execPath, ["--check", bundle]);
  execFileSync(process.execPath, ["--check", sqliteBundle]);

  copyFileSync(join(fixture, sqliteName), sqliteBundle);
  const resumed = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
  assert.equal(resumed.changed, true);
  assert.match(readFileSync(sqliteBundle, "utf8"), /NIGHTSHIFT_OPENCLAW91_SQLITE_OWNER_CAP_PATCH = 36/);

  const second = JSON.parse(execFileSync(process.execPath, [script.pathname, `--dist=${dist}`, `--backup-dir=${backup}`], { encoding: "utf8" }));
  assert.equal(second.status, "already-patched");
});
