#!/usr/bin/env node
import http from "node:http";
import { readFile } from "node:fs/promises";

const socketPath = process.env.VLAB_SANDBOX_SOCKET ?? "/srv/vlab/state/sandbox-broker/broker.sock";
await main();

async function main() {
  const [command, arg] = process.argv.slice(2);
  let method = "GET";
  let endpoint;
  let payload;

  if (command === "health") endpoint = "/health";
  else if (command === "list") endpoint = "/jobs";
  else if (command === "status" && arg) endpoint = `/jobs/${arg}`;
  else if (command === "cancel" && arg) { method = "POST"; endpoint = `/jobs/${arg}/cancel`; }
  else if (command === "prune") { method = "POST"; endpoint = "/prune"; }
  else if (command === "route") { method = "POST"; endpoint = "/route"; payload = await input(arg); }
  else if (command === "submit") { method = "POST"; endpoint = "/jobs"; payload = await input(arg); }
  else if (command === "wait" && arg) {
    const timeoutMs = Number(process.env.VLAB_SANDBOX_WAIT_TIMEOUT_MS ?? 3_700_000);
    const startedAt = Date.now();
    for (;;) {
      const job = await request("GET", `/jobs/${arg}`);
      if (["completed", "failed", "cancelled"].includes(job.status)) {
        print(job, job.status === "completed" ? 0 : 1);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) throw new Error("wait timed out; the sandbox job continues in the broker");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } else {
    throw new Error("usage: sandboxctl health|route [json-file]|submit [json-file]|status ID|wait ID|cancel ID|list|prune");
  }

  print(await request(method, endpoint, payload));
}

async function input(file) {
  const text = file ? await readFile(file, "utf8") : await readStdin();
  return JSON.parse(text || "{}");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function request(requestMethod, requestPath, value) {
  return new Promise((resolve, reject) => {
    const data = value == null ? null : Buffer.from(JSON.stringify(value));
    const request = http.request({ socketPath, path: requestPath, method: requestMethod, headers: data ? { "content-type": "application/json", "content-length": data.length } : {} }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (response.statusCode >= 400) reject(new Error(parsed.error ?? `HTTP ${response.statusCode}`));
        else resolve(parsed);
      });
    });
    request.on("error", reject);
    if (data) request.end(data); else request.end();
  });
}

function print(value, code = 0) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exitCode = code;
}
