#!/usr/bin/env node
import { Sandbox } from "@vercel/sandbox";

const startedAt = Date.now();
let sandbox;
let deleted = false;

try {
  const creationStartedAt = Date.now();
  sandbox = await Sandbox.create({
    resources: { vcpus: 1 },
    ports: [3000],
    timeout: 120_000,
    networkPolicy: "deny-all",
    persistent: false,
    tags: { environment: "vlab", purpose: "preview-validation" },
  });
  const creationMs = Date.now() - creationStartedAt;
  await sandbox.runCommand("mkdir", ["-p", "/vercel/workspace"]);
  await sandbox.writeFiles([{
    path: "/vercel/workspace/server.mjs",
    content: "import http from 'node:http'; http.createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({marker:'VLAB_PREVIEW_OK'}));}).listen(3000,'0.0.0.0');\n",
  }]);
  await sandbox.runCommand({
    cmd: "node",
    args: ["server.mjs"],
    cwd: "/vercel/workspace",
    detached: true,
    timeoutMs: 90_000,
  });

  const response = await fetchWithRetry(sandbox.domain(3000));
  const body = await response.json();
  if (!response.ok || body.marker !== "VLAB_PREVIEW_OK") throw new Error("preview marker mismatch");

  await sandbox.delete();
  deleted = true;
  process.stdout.write(`${JSON.stringify({
    ok: true,
    previewReached: true,
    marker: body.marker,
    deleted,
    timing: { creationMs, totalMs: Date.now() - startedAt },
  })}\n`);
} catch (error) {
  if (sandbox && !deleted) {
    try { await sandbox.delete(); deleted = true; } catch { /* report cleanup below */ }
  }
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    deleted,
    totalMs: Date.now() - startedAt,
  })}\n`);
  process.exitCode = 1;
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(5_000) });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}
