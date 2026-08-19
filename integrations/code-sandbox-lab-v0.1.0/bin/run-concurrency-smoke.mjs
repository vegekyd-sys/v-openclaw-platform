#!/usr/bin/env node
import { spawn } from "node:child_process";

const count = Number(process.argv[2] ?? 5);
if (!Number.isInteger(count) || count < 1 || count > 10) {
  throw new Error("concurrency must be between 1 and 10");
}

const startedAt = Date.now();
const results = await Promise.all(Array.from({ length: count }, (_, index) => runOne(index + 1)));
const ok = results.every((result) => result.ok && result.sandbox?.deleted && result.stdout.includes("CONCURRENT_OK"));
process.stdout.write(`${JSON.stringify({
  ok,
  count,
  completed: results.filter((result) => result.ok).length,
  allDeleted: results.every((result) => result.sandbox?.deleted),
  creationMs: results.map((result) => result.timing?.creationMs ?? null),
  commandMs: results.map((result) => result.timing?.commandMs ?? null),
  wallMs: Date.now() - startedAt,
})}\n`);
if (!ok) process.exitCode = 1;

function runOne(number) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("./run-job.mjs", import.meta.url).pathname], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", () => {
      try {
        resolve(JSON.parse(output.trim()));
      } catch (error) {
        reject(new Error(`worker ${number} returned invalid JSON: ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify({
      jobId: `concurrent-${number}`,
      command: ["python3", "-c", "import time; time.sleep(4); print('CONCURRENT_OK')"],
      vcpus: 1,
      timeoutMs: 120000,
      networkProfile: "offline"
    }));
  });
}
