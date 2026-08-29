import { spawn } from "node:child_process";

export function run(argv, options = {}) {
  return new Promise((resolve, reject) => {
    const hasStdin = options.stdin !== undefined && options.stdin !== null;
    const child = spawn(argv[0], argv.slice(1), {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [hasStdin ? "pipe" : "ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutCaptured = 0;
    let stderrCaptured = 0;
    const max = options.maxBytes ?? 2_000_000;
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      const remaining = max - stdoutCaptured;
      if (remaining > 0) {
        const captured = chunk.subarray(0, remaining);
        stdout.push(captured);
        stdoutCaptured += captured.length;
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      const remaining = max - stderrCaptured;
      if (remaining > 0) {
        const captured = chunk.subarray(0, remaining);
        stderr.push(captured);
        stderrCaptured += captured.length;
      }
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({
      code, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr),
      stdoutTruncated: stdoutBytes > max, stderrTruncated: stderrBytes > max,
    }));
    if (hasStdin) {
      if (typeof options.stdin?.pipe === "function") options.stdin.pipe(child.stdin);
      else child.stdin.end(options.stdin);
    }
  });
}

export function pipe(argvA, argvB, options = {}) {
  return new Promise((resolve, reject) => {
    const first = spawn(argvA[0], argvA.slice(1), { cwd: options.cwdA, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    const second = spawn(argvB[0], argvB.slice(1), { cwd: options.cwdB, env: options.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    first.stdout.pipe(second.stdin);
    const firstErr = [], secondOut = [], secondErr = [];
    first.stderr.on("data", (chunk) => firstErr.push(chunk));
    second.stdout.on("data", (chunk) => secondOut.push(chunk));
    second.stderr.on("data", (chunk) => secondErr.push(chunk));
    let firstResult;
    first.on("error", reject); second.on("error", reject);
    first.on("close", (code, signal) => { firstResult = { code, signal }; });
    second.on("close", (code, signal) => resolve({
      first: firstResult, second: { code, signal }, stdout: Buffer.concat(secondOut),
      stderr: Buffer.concat([...firstErr, ...secondErr]),
    }));
  });
}
