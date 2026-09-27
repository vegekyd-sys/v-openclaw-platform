import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { observeEagerRuntimeLoad } from "./eager-runtime-load.mjs";

test("an eager load that fails before anyone awaits it is not an unhandled rejection", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { observeEagerRuntimeLoad } from ${JSON.stringify(new URL("./eager-runtime-load.mjs", import.meta.url).href)};
const warnings = [];
const wrap = process.argv.includes("--observe");
const load = Promise.reject(Object.assign(new Error("gone"), { code: "ERR_INTERNAL_ASSERTION" }));
const runtime = wrap ? observeEagerRuntimeLoad("diagnostic runtime", load, { warn: (m) => warnings.push(m) }) : load;
await new Promise((resolve) => setTimeout(resolve, 20));
console.log(JSON.stringify(warnings));`,
      "--",
      process.env.EAGER_CASE ?? "--observe",
    ],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /eager diagnostic runtime load failed.*ERR_INTERNAL_ASSERTION: gone/);
});

test("without observation the same rejection terminates the process", () => {
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `const load = Promise.reject(new Error("gone")); await new Promise((r) => setTimeout(r, 20)); void load;`],
    { encoding: "utf8" },
  );
  assert.notEqual(child.status, 0);
});

test("awaiters still receive the original failure", async () => {
  const error = new Error("moved");
  const load = observeEagerRuntimeLoad("transcript runtime", Promise.reject(error), {});
  await assert.rejects(load, (received) => received === error);
});
