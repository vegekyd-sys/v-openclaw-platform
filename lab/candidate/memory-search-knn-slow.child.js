// Test-only stand-in for extensions/memory-core/memory-search-knn.child.js. The manager
// keeps one spare child waiting on stdin, so the delay starts when a request arrives: while
// the parent test holds a flag file, wait 30 s (a cold scan of V's fragmented vector table
// takes 23-45 s), then hand the request to the real child. Without the flag: no delay.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const real = path.join(path.dirname(fileURLToPath(import.meta.url)), "memory-search-knn.child.real.js");
const flag = path.join(os.tmpdir(), `slow-knn-${process.ppid}`);
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.once("end", async () => {
  if (fs.existsSync(flag)) await new Promise((resolve) => setTimeout(resolve, 30_000));
  const child = spawn(process.execPath, [real], { stdio: ["pipe", "inherit", "inherit"] });
  child.on("exit", (code) => process.exit(code ?? 1));
  child.stdin.end(Buffer.concat(chunks));
});
