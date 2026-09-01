import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../scripts/build-openclaw-2026.8.1-acceptance-workspaces.mjs", import.meta.url),
  "utf8",
);

test("acceptance Workspace mirrors copy legacy state but symlink ordinary content", () => {
  assert.match(source, /openclaw-workspace-state\.json/);
  assert.match(source, /workspace-state\.json/);
  assert.match(source, /fs\.copyFileSync/);
  assert.match(source, /fs\.symlinkSync/);
  assert.match(source, /entry\.workspace = rewrite/);
});
