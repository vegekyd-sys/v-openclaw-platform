#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { parseJobRequest, sandboxName } from "../src/policy.mjs";

const MAX_OUTPUT_BYTES = 200_000;
const MAX_ARTIFACT_BYTES = 1_000_000;

async function main() {
  const raw = await readInput();
  const request = parseJobRequest(JSON.parse(raw));
  const startedAt = Date.now();
  let sandbox;
  let deleted = false;
  let phase = "create";

  try {
    const creationStartedAt = Date.now();
    sandbox = await Sandbox.create({
      name: sandboxName(request.jobId),
      resources: { vcpus: request.vcpus },
      timeout: request.timeoutMs,
      networkPolicy: request.networkPolicy,
      persistent: false,
      tags: { environment: "vlab", purpose: "code-validation" },
      signal: AbortSignal.timeout(Math.min(request.timeoutMs, 120_000)),
    });
    const creationMs = Date.now() - creationStartedAt;

    phase = "upload";
    await uploadFiles(sandbox, request.files);
    phase = "execute";
    const commandStartedAt = Date.now();
    const result = await sandbox.runCommand({
      cmd: request.command[0],
      args: request.command.slice(1),
      cwd: request.cwd,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const commandMs = Date.now() - commandStartedAt;
    const stdout = truncate(await result.stdout());
    const stderr = truncate(await result.stderr());
    phase = "collect";
    const artifacts = await collectArtifacts(sandbox, request.collect);

    phase = "delete";
    await sandbox.delete();
    deleted = true;

    process.stdout.write(`${JSON.stringify({
      ok: result.exitCode === 0,
      jobId: request.jobId,
      exitCode: result.exitCode,
      stdout,
      stderr,
      artifacts,
      sandbox: {
        provider: "vercel",
        isolated: true,
        persistent: false,
        deleted,
        vcpus: request.vcpus,
        memoryMb: request.vcpus * 2048,
        networkProfile: request.networkProfile,
      },
      timing: { creationMs, commandMs, totalMs: Date.now() - startedAt },
    })}\n`);
  } catch (error) {
    if (sandbox && !deleted) {
      try {
        await sandbox.delete();
        deleted = true;
      } catch {
        // The cleanup status is reported below; never hide the original failure.
      }
    }
    process.stdout.write(`${JSON.stringify({
      ok: false,
      phase,
      error: error instanceof Error ? error.message : String(error),
      deleted,
      totalMs: Date.now() - startedAt,
    })}\n`);
    process.exitCode = 1;
  }
}

async function readInput() {
  if (process.argv[2]) return readFile(process.argv[2], "utf8");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function uploadFiles(sandbox, files) {
  await sandbox.runCommand("mkdir", ["-p", "/vercel/workspace"]);
  if (files.length === 0) return;
  const directories = [...new Set(files.map((file) => dirname(file.path)).filter((path) => path !== "."))];
  if (directories.length > 0) {
    await sandbox.runCommand("mkdir", ["-p", ...directories.map((path) => `/vercel/workspace/${path}`)]);
  }
  await sandbox.writeFiles(files.map((file) => ({ ...file, path: `/vercel/workspace/${file.path}` })));
}

async function collectArtifacts(sandbox, paths) {
  const artifacts = [];
  for (const path of paths) {
    const data = await sandbox.readFileToBuffer({ path, cwd: "/vercel/workspace" });
    if (data == null) {
      artifacts.push({ path, missing: true });
      continue;
    }
    if (data.byteLength > MAX_ARTIFACT_BYTES) {
      artifacts.push({ path, tooLarge: true, sizeBytes: data.byteLength });
      continue;
    }
    artifacts.push({
      path,
      sizeBytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
      contentBase64: data.toString("base64"),
    });
  }
  return artifacts;
}

function truncate(value) {
  const text = String(value ?? "");
  const data = Buffer.from(text);
  if (data.byteLength <= MAX_OUTPUT_BYTES) return text;
  return `${data.subarray(0, MAX_OUTPUT_BYTES).toString("utf8")}\n...[truncated]`;
}

await main();
