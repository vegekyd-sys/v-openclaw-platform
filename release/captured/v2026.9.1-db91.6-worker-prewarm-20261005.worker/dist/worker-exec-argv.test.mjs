import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkerExecArgv } from "./worker-pool.mjs";

test("Workers keep runtime flags but never inherit the Gateway inspector", () => {
  assert.deepEqual(
    resolveWorkerExecArgv([
      "--inspect=127.0.0.1:9239",
      "--inspect-brk",
      "--max-old-space-size=4096",
      "--enable-source-maps",
    ]),
    ["--max-old-space-size=4096", "--enable-source-maps"],
  );
});
