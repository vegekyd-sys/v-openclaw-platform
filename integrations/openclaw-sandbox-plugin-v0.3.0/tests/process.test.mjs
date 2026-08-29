import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../src/process.mjs";

test("truncated process output retains the exact stdout and stderr prefixes", async () => {
  const stdout = "stdout-".repeat(40);
  const stderr = "stderr-".repeat(40);
  const maxBytes = 37;
  const result = await run([
    process.execPath,
    "-e",
    "process.stdout.write(process.argv[1]); process.stderr.write(process.argv[2]);",
    stdout,
    stderr,
  ], { maxBytes });

  assert.equal(result.code, 0);
  assert.equal(result.stdoutTruncated, true);
  assert.equal(result.stderrTruncated, true);
  assert.equal(result.stdout.length, maxBytes);
  assert.equal(result.stderr.length, maxBytes);
  assert.equal(result.stdout.toString("utf8"), stdout.slice(0, maxBytes));
  assert.equal(result.stderr.toString("utf8"), stderr.slice(0, maxBytes));
});
