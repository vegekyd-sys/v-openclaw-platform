#!/usr/bin/env node

import {
  chmod,
  copyFile,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_PACKAGE_VERSION = "2026.7.1";
export const PATCH_MARKER = "versa-worker-media-completion-relay-v0.2.1";
const BACKUP_SUFFIX = ".pre-worker-media-completion-relay-v0.2.1";
const BRIDGE_SYMBOL = "versa.vlab-worker.gateway-event-bridge-v1";
const CONTRACT_VERSION = "versa-worker-gateway-events-v1";

const SCHEDULE_START = `function scheduleMediaGenerationTaskCompletion(params) {
\tparams.scheduleBackgroundWork(async () => {
\t\tlet executed;`;

const PATCHED_SCHEDULE_START = `function scheduleMediaGenerationTaskCompletion(params) {
\tparams.scheduleBackgroundWork(async () => {
\t\t// ${PATCH_MARKER}: keep detached work alive and Gateway-owned after the request ends.
\t\tconst workerGatewayBridge = globalThis[Symbol.for(${JSON.stringify(BRIDGE_SYMBOL)})];
\t\tconst detachedTaskKey = \`media:\${params.handle?.taskId ?? params.handle?.runId ?? "unknown"}\`;
\t\tif (typeof workerGatewayBridge === "function") try {
\t\t\tawait workerGatewayBridge({
\t\t\t\tcontractVersion: ${JSON.stringify(CONTRACT_VERSION)},
\t\t\t\teventKind: "detached_task_started",
\t\t\t\teventId: \`\${detachedTaskKey}:started\`,
\t\t\t\ttaskKey: detachedTaskKey,
\t\t\t\ttaskId: params.handle?.taskId,
\t\t\t\trunId: params.handle?.runId,
\t\t\t\trequesterSessionKey: params.handle?.requesterSessionKey
\t\t\t});
\t\t} catch (error) {
\t\t\tparams.onWakeFailure("Worker detached media start relay failed", { taskId: params.handle?.taskId, runId: params.handle?.runId, error });
\t\t}
\t\ttry {
\t\tlet executed;`;

const SCHEDULE_END = `\t\t} catch (error) {
\t\t\tparams.onWakeFailure(\`\${params.toolName} completion state update failed\`, {
\t\t\t\ttaskId: params.handle?.taskId,
\t\t\t\trunId: params.handle?.runId,
\t\t\t\terror
\t\t\t});
\t\t\tparams.lifecycle.failTaskRun({
\t\t\t\thandle: params.handle,
\t\t\t\terror
\t\t\t});
\t\t}
\t});
}`;

const PATCHED_SCHEDULE_END = `\t\t} catch (error) {
\t\t\tparams.onWakeFailure(\`\${params.toolName} completion state update failed\`, {
\t\t\t\ttaskId: params.handle?.taskId,
\t\t\t\trunId: params.handle?.runId,
\t\t\t\terror
\t\t\t});
\t\t\tparams.lifecycle.failTaskRun({
\t\t\t\thandle: params.handle,
\t\t\t\terror
\t\t\t});
\t\t}
\t\t} finally {
\t\t\tif (typeof workerGatewayBridge === "function") try {
\t\t\t\tawait workerGatewayBridge({
\t\t\t\t\tcontractVersion: ${JSON.stringify(CONTRACT_VERSION)},
\t\t\t\t\teventKind: "detached_task_settled",
\t\t\t\t\teventId: \`\${detachedTaskKey}:settled\`,
\t\t\t\t\ttaskKey: detachedTaskKey,
\t\t\t\t\ttaskId: params.handle?.taskId,
\t\t\t\t\trunId: params.handle?.runId,
\t\t\t\t\trequesterSessionKey: params.handle?.requesterSessionKey
\t\t\t\t});
\t\t\t} catch (error) {
\t\t\t\tparams.onWakeFailure("Worker detached media settle relay failed", { taskId: params.handle?.taskId, runId: params.handle?.runId, error });
\t\t\t}
\t\t}
\t});
}`;

const DELIVERY_ANCHOR = `\tconst delivery = await deliverSubagentAnnouncement({`;
const PATCHED_DELIVERY_ANCHOR = `\t// ${PATCH_MARKER}: the Gateway owns Session wake and final delivery.
\tconst workerGatewayBridge = globalThis[Symbol.for(${JSON.stringify(BRIDGE_SYMBOL)})];
\tif (typeof workerGatewayBridge === "function") try {
\t\tconst taskKey = \`media:\${params.handle.taskId}\`;
\t\tconst bridged = await workerGatewayBridge({
\t\t\tcontractVersion: ${JSON.stringify(CONTRACT_VERSION)},
\t\t\teventKind: "media_generation_completion",
\t\t\teventId: \`\${announceId}:gateway\`,
\t\t\ttaskKey,
\t\t\ttaskId: params.handle.taskId,
\t\t\trunId: params.handle.runId,
\t\t\ttoolName: params.toolName,
\t\t\tstatus: params.status,
\t\t\tdelivery: {
\t\t\t\trequesterSessionKey: params.handle.requesterSessionKey,
\t\t\t\ttargetRequesterSessionKey: params.handle.requesterSessionKey,
\t\t\t\tannounceId,
\t\t\t\ttriggerMessage,
\t\t\t\tsteerMessage: triggerMessage,
\t\t\t\tinternalEvents,
\t\t\t\tsummaryLine: params.handle.taskLabel,
\t\t\t\trequesterSessionOrigin: params.handle.requesterOrigin,
\t\t\t\trequesterOrigin: params.handle.requesterOrigin,
\t\t\t\tcompletionDirectOrigin: params.handle.requesterOrigin,
\t\t\t\tdirectOrigin: params.handle.requesterOrigin,
\t\t\t\tsourceSessionKey: \`\${params.toolName}:\${params.handle.taskId}\`,
\t\t\t\tsourceChannel: INTERNAL_MESSAGE_CHANNEL,
\t\t\t\tsourceTool: params.toolName,
\t\t\t\trequesterIsSubagent: false,
\t\t\t\texpectsCompletionMessage: true,
\t\t\t\tbestEffortDeliver: true,
\t\t\t\tdirectIdempotencyKey: announceId
\t\t\t}
\t\t});
\t\tif (bridged?.handled === true) return bridged.delivered === true || bridged.terminal === true;
\t} catch (error) {
\t\tlog$5.warn("Worker-to-Gateway media completion relay failed; using local emergency fallback", {
\t\t\ttaskId: params.handle.taskId,
\t\t\trunId: params.handle.runId,
\t\t\ttoolName: params.toolName,
\t\t\terror
\t\t});
\t}
\tconst delivery = await deliverSubagentAnnouncement({`;

function replaceExactlyOnce(source, original, replacement, label) {
  const first = source.indexOf(original);
  if (first === -1) throw new Error(`media completion patch could not find ${label}`);
  if (source.indexOf(original, first + original.length) !== -1) {
    throw new Error(`media completion patch found multiple ${label} blocks`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + original.length)}`;
}

export function patchOpenClawMediaCompletionBundle(source) {
  const markerCount = source.split(PATCH_MARKER).length - 1;
  if (markerCount === 2) return { changed: false, source };
  if (markerCount !== 0) throw new Error("media completion bundle is partially patched");
  let patched = replaceExactlyOnce(
    source,
    SCHEDULE_START,
    PATCHED_SCHEDULE_START,
    "background schedule start",
  );
  patched = replaceExactlyOnce(
    patched,
    SCHEDULE_END,
    PATCHED_SCHEDULE_END,
    "background schedule end",
  );
  const wakeStart = patched.indexOf("async function wakeMediaGenerationTaskCompletion(params)");
  const wakeEnd = patched.indexOf("async function tryDeliverMediaGenerationDirect(params)", wakeStart);
  if (wakeStart < 0 || wakeEnd < 0) throw new Error("media completion wake function was not found");
  const wakeSource = patched.slice(wakeStart, wakeEnd);
  const patchedWake = replaceExactlyOnce(
    wakeSource,
    DELIVERY_ANCHOR,
    PATCHED_DELIVERY_ANCHOR,
    "Gateway delivery call",
  );
  patched = `${patched.slice(0, wakeStart)}${patchedWake}${patched.slice(wakeEnd)}`;
  return { changed: true, source: patched };
}

async function resolveBundle(packageRoot) {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  if (packageJson.name !== "openclaw" || packageJson.version !== EXPECTED_PACKAGE_VERSION) {
    throw new Error(
      `unsupported OpenClaw package ${packageJson.name}@${packageJson.version}; expected openclaw@${EXPECTED_PACKAGE_VERSION}`,
    );
  }
  const distDir = path.join(packageRoot, "dist");
  const matches = [];
  for (const name of (await readdir(distDir)).filter((entry) =>
    /^openclaw-tools-[A-Za-z0-9_-]+\.js$/.test(entry),
  )) {
    const candidate = path.join(distDir, name);
    const source = await readFile(candidate, "utf8");
    if (
      source.includes("function wakeMediaGenerationTaskCompletion(params)") &&
      (source.includes(SCHEDULE_START) || source.includes(PATCH_MARKER))
    ) {
      matches.push(candidate);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`expected one OpenClaw media tools bundle, found ${matches.length}`);
  }
  return matches[0];
}

async function patchPackage(packageRoot) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const source = await readFile(bundlePath, "utf8");
  const result = patchOpenClawMediaCompletionBundle(source);
  if (!result.changed) return { bundlePath, changed: false };
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  try {
    await stat(backupPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await copyFile(bundlePath, backupPath);
  }
  const originalStat = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.worker-media-relay-${process.pid}.tmp`;
  await writeFile(temporaryPath, result.source, { mode: originalStat.mode });
  await chmod(temporaryPath, originalStat.mode);
  await rename(temporaryPath, bundlePath);
  return { bundlePath, backupPath, changed: true };
}

async function restorePackage(packageRoot) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  const backup = await readFile(backupPath, "utf8");
  const originalStat = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.worker-media-relay-restore-${process.pid}.tmp`;
  await writeFile(temporaryPath, backup, { mode: originalStat.mode });
  await chmod(temporaryPath, originalStat.mode);
  await rename(temporaryPath, bundlePath);
  return { bundlePath, backupPath };
}

async function main(args) {
  if (args[0] === "--restore") {
    if (args.length !== 2) throw new Error("usage: patch-openclaw-media-completion-relay.mjs --restore <openclaw-package-root>");
    const result = await restorePackage(args[1]);
    process.stdout.write(`restored ${result.bundlePath}\n`);
    return;
  }
  if (args.length !== 1) throw new Error("usage: patch-openclaw-media-completion-relay.mjs <openclaw-package-root>");
  const result = await patchPackage(args[0]);
  process.stdout.write(`${result.changed ? "patched" : "already-patched"} ${result.bundlePath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
