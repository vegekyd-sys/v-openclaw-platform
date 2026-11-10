// CI entry for the Python tests of scripts/v-agent-shell-cgroup.py.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("v-agent-shell-cgroup.py offline tests pass", () => {
  const r = spawnSync("python3", [new URL("./v-agent-shell-cgroup.test.py", import.meta.url).pathname], { encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
