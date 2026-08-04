import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const labRoot = process.env.LAB_ROOT ?? "/srv/vlab";
const nodePath = process.env.VLAB_NODE ?? "/opt/vlab/node/bin/node";
const packageRoot =
  process.env.VLAB_OPENCLAW_PACKAGE ??
  "/opt/vlab/current/node_modules/openclaw";
const storePath =
  process.env.VLAB_SESSION_STORE ??
  `${labRoot}/state/agents/makaron/sessions/sessions.json`;
const sampleCount = Number(process.env.VLAB_HOTSET_SAMPLE_COUNT ?? 15);
const reportPath = process.env.VLAB_HOTSET_REPORT_PATH;

if (process.argv[2] === "--sample") {
  const [, , , bundlePath, sampleStorePath, sessionKey] = process.argv;
  const bundle = await import(pathToFileURL(bundlePath).href);
  assert.equal(typeof bundle.w, "function", "OpenClaw readSessionEntry export changed");
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const entry = bundle.w(sampleStorePath, sessionKey);
  const elapsedMs = performance.now() - started;
  assert.ok(entry?.sessionId, "target Session did not activate");
  process.stdout.write(
    `${JSON.stringify({
      elapsedMs,
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
      sessionId: entry.sessionId,
    })}\n`,
  );
  process.exit(0);
}

assert.ok(Number.isInteger(sampleCount) && sampleCount >= 3 && sampleCount <= 50);
const bundleNames = (await readdir(path.join(packageRoot, "dist"))).filter(
  (name) => /^store-[A-Za-z0-9_-]+\.js$/.test(name),
);
const bundleCandidates = [];
for (const bundleName of bundleNames) {
  const candidatePath = path.join(packageRoot, "dist", bundleName);
  const candidate = await readFile(candidatePath, "utf8");
  if (candidate.includes("function readSessionEntry(storePath, sessionKey")) {
    bundleCandidates.push(candidatePath);
  }
}
assert.equal(
  bundleCandidates.length,
  1,
  "expected exactly one writable Session Store bundle",
);
const [bundlePath] = bundleCandidates;
const source = await readFile(storePath, "utf8");
const store = JSON.parse(source);
const entries = Object.entries(store);
assert.ok(entries.length >= 500, "VLab does not contain the required 500 Sessions");
const ordered = entries
  .filter(([, entry]) => typeof entry?.sessionId === "string")
  .sort((left, right) => Number(left[1].updatedAt ?? 0) - Number(right[1].updatedAt ?? 0));
assert.ok(ordered.length > 0, "no readable Session entry found");
const [sessionKey, targetEntry] = ordered[0];

const samples = [];
for (let index = 0; index < sampleCount; index += 1) {
  const output = execFileSync(
    nodePath,
    [import.meta.filename, "--sample", bundlePath, storePath, sessionKey],
    {
      encoding: "utf8",
      env: process.env,
      timeout: 60_000,
    },
  );
  samples.push(JSON.parse(output));
}

const percentile = (values, ratio) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};
const fieldCounts = entries.reduce(
  (counts, [, entry]) => {
    if (entry?.skillsSnapshot) counts.skillsSnapshot += 1;
    if (entry?.systemPromptReport) counts.systemPromptReport += 1;
    return counts;
  },
  { skillsSnapshot: 0, systemPromptReport: 0 },
);
const elapsed = samples.map((sample) => sample.elapsedMs);
const heapDeltas = samples.map((sample) => Math.max(0, sample.heapDeltaBytes));
const report = {
  ok: true,
  measuredPath: "OpenClaw 2026.7.1 readSessionEntry cold process",
  sessionCount: entries.length,
  storeBytes: (await stat(storePath)).size,
  fieldCounts,
  target: {
    sessionKey,
    sessionId: targetEntry.sessionId,
    updatedAt: targetEntry.updatedAt,
  },
  samples: sampleCount,
  activationMs: {
    p50: percentile(elapsed, 0.5),
    p90: percentile(elapsed, 0.9),
    min: Math.min(...elapsed),
    max: Math.max(...elapsed),
  },
  heapDeltaBytes: {
    p50: percentile(heapDeltas, 0.5),
    p90: percentile(heapDeltas, 0.9),
  },
};
if (reportPath) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
