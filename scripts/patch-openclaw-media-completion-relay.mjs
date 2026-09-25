#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
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

const SUPPORTED_PACKAGE_VERSIONS = new Set(["2026.7.1", "2026.8.1", "2026.9.1", "2026.9.2"]);
export const PATCH_MARKER = "versa-worker-media-completion-relay-v0.2.1";
export const PATCH_MARKER_92 = "versa-worker-media-completion-relay-v0.3.0-92";
const BACKUP_SUFFIX = ".pre-worker-media-completion-relay-v0.2.1";
const BACKUP_SUFFIX_92 = `.pre-${PATCH_MARKER_92}`;
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

const SQLITE_SCHEDULE_START = `function scheduleMediaGenerationTaskCompletion(params) {
\tconst runBackgroundWork = async () => {
\t\tlet executed;`;

const PATCHED_SQLITE_SCHEDULE_START = `function scheduleMediaGenerationTaskCompletion(params) {
\tconst runBackgroundWork = async () => {
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

const SQLITE_SCHEDULE_END = `\n\t};
\tparams.scheduleBackgroundWork(() => runWithoutOwnedSessionTranscriptWrites(runBackgroundWork));
}`;

const PATCHED_SQLITE_SCHEDULE_END = `
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
\t};
\tparams.scheduleBackgroundWork(() => runWithoutOwnedSessionTranscriptWrites(runBackgroundWork));
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
  if (source.includes(PATCH_MARKER_92) || source.includes('async function wakeMediaGenerationTaskCompletionWithRetry(params)')) {
    return patchOpenClaw92MediaCompletionBundle(source);
  }
  const markerCount = source.split(PATCH_MARKER).length - 1;
  if (markerCount === 2) return { changed: false, source };
  if (markerCount !== 0) throw new Error("media completion bundle is partially patched");
  const usesSqliteSchedule = source.includes(SQLITE_SCHEDULE_START);
  const scheduleStart = usesSqliteSchedule ? SQLITE_SCHEDULE_START : SCHEDULE_START;
  const patchedScheduleStart = usesSqliteSchedule
    ? PATCHED_SQLITE_SCHEDULE_START
    : PATCHED_SCHEDULE_START;
  const scheduleEnd = usesSqliteSchedule ? SQLITE_SCHEDULE_END : SCHEDULE_END;
  const patchedScheduleEnd = usesSqliteSchedule
    ? PATCHED_SQLITE_SCHEDULE_END
    : PATCHED_SCHEDULE_END;
  let patched = replaceExactlyOnce(
    source,
    scheduleStart,
    patchedScheduleStart,
    "background schedule start",
  );
  const scheduleFunctionStart = patched.indexOf(
    "function scheduleMediaGenerationTaskCompletion(params)",
  );
  const scheduleFunctionEnd = patched.indexOf(
    "async function wakeMediaGenerationTaskCompletion(params)",
    scheduleFunctionStart,
  );
  if (scheduleFunctionStart < 0 || scheduleFunctionEnd < 0) {
    throw new Error("media completion schedule function was not found");
  }
  const scheduleSource = patched.slice(scheduleFunctionStart, scheduleFunctionEnd);
  const patchedScheduleSource = replaceExactlyOnce(
    scheduleSource,
    scheduleEnd,
    patchedScheduleEnd,
    "background schedule end",
  );
  patched = `${patched.slice(0, scheduleFunctionStart)}${patchedScheduleSource}${patched.slice(scheduleFunctionEnd)}`;
  const wakeStart = patched.indexOf("async function wakeMediaGenerationTaskCompletion(params)");
  const wakeEndCandidates = [
    patched.indexOf("async function tryDeliverMediaGenerationDirect(params)", wakeStart),
    patched.indexOf("function createMediaGenerationTaskLifecycle(params)", wakeStart),
  ].filter((candidate) => candidate >= 0);
  const wakeEnd = wakeEndCandidates.length > 0
    ? Math.min(...wakeEndCandidates)
    : -1;
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

const WAKE_FUNCTION = 'async function wakeMediaGenerationTaskCompletion(params)';
const SCHEDULE_FUNCTION = 'function scheduleMediaGenerationTaskCompletion(params)';
const LIFECYCLE_FUNCTION = 'function createMediaGenerationTaskLifecycle(params)';
const SHARED_REGION = '//#region src/agents/tools/media-generate-background-shared.ts';

function nextBoundary(source, from, candidates) {
  const found = candidates.map((candidate) => source.indexOf(candidate, from)).filter((index) => index > from);
  return found.length ? Math.min(...found) : -1;
}

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

// 9.1 keeps schedule before wake inside the shared region; 9.2 moved wake into
// its own module ahead of schedule. Both return delivered/pending/permanent_failure.
function locateMediaWakeAndSchedule(source) {
  if (occurrences(source, WAKE_FUNCTION) !== 1 || occurrences(source, SCHEDULE_FUNCTION) !== 1) {
    throw new Error('9.2 media wake/schedule module boundaries drifted');
  }
  const wakeStart = source.indexOf(WAKE_FUNCTION);
  const wakeEnd = nextBoundary(source, wakeStart, [SHARED_REGION, LIFECYCLE_FUNCTION]);
  const scheduleStart = source.indexOf(SCHEDULE_FUNCTION);
  const scheduleEnd = nextBoundary(source, scheduleStart, [WAKE_FUNCTION, LIFECYCLE_FUNCTION]);
  const disjoint = wakeEnd <= scheduleStart || scheduleEnd <= wakeStart;
  if (!(wakeEnd > wakeStart && scheduleEnd > scheduleStart && disjoint)) {
    throw new Error('9.2 media wake/schedule module boundaries drifted');
  }
  return { wakeStart, wakeEnd, scheduleStart, scheduleEnd };
}

// 9.1/9.2 changed the wake result from boolean to a
// delivered/pending/permanent_failure contract. Keep its payload and retry
// logic verbatim; only move the actual native delivery call to the Gateway,
// which owns the durable session delivery runtime that Workers lack.
export function patchOpenClaw92MediaCompletionBundle(source) {
  const markers=source.split(PATCH_MARKER_92).length-1;
  if(markers===2) {
    for(const anchor of ['async function deliverMediaThroughWorkerGateway(nativeDelivery)',
      'eventKind: "detached_task_started"','eventKind: "detached_task_settled"',
      'const delivery = await deliverMediaThroughWorkerGateway({']) {
      if(!source.includes(anchor))throw new Error('9.2 media completion patch is incomplete');
    }
    return {changed:false,source};
  }
  if(markers || source.includes(PATCH_MARKER))throw new Error('9.2 media completion bundle is partially or legacy patched');
  const {wakeStart,wakeEnd,scheduleStart,scheduleEnd}=locateMediaWakeAndSchedule(source);
  const wake=source.slice(wakeStart,wakeEnd);
  for(const anchor of ['requesterAgentId: params.handle.requesterAgentId',
    'if (delivery.delivered) return { status: "delivered" };',
    'delivery.disposition === "session_queued"',
    'return { status: "pending" };',
    'return { status: "permanent_failure" };']) {
    if(!wake.includes(anchor))throw new Error(`9.2 media outcome contract missing: ${anchor}`);
  }
  const bridge=`\t// ${PATCH_MARKER_92}: preserve native payload and nonterminal handoff outcomes.
\tasync function deliverMediaThroughWorkerGateway(nativeDelivery) {
\t\tconst bridge = globalThis[Symbol.for(${JSON.stringify(BRIDGE_SYMBOL)})];
\t\tif (typeof bridge !== "function") return await deliverSubagentAnnouncement(nativeDelivery);
\t\tconst bridged = await bridge({
\t\t\tcontractVersion: ${JSON.stringify(CONTRACT_VERSION)},
\t\t\teventKind: "media_generation_completion",
\t\t\teventId: \`\${announceId}:gateway\`,
\t\t\ttaskKey: \`media:\${params.handle.taskId}\`,
\t\t\ttaskId: params.handle.taskId,
\t\t\trunId: params.handle.runId,
\t\t\ttoolName: params.toolName,
\t\t\tstatus: params.status,
\t\t\tdelivery: nativeDelivery
\t\t});
\t\tif (bridged?.handled !== true) throw new Error("Worker media completion was not handled by Gateway");
\t\treturn bridged;
\t}
\tconst delivery = await deliverMediaThroughWorkerGateway({`;
  const patchedWake=replaceExactlyOnce(wake,DELIVERY_ANCHOR,bridge,'9.2 native delivery call');
  let schedule=source.slice(scheduleStart,scheduleEnd);
  schedule=replaceExactlyOnce(schedule,SQLITE_SCHEDULE_START,
    PATCHED_SQLITE_SCHEDULE_START.replaceAll(PATCH_MARKER,PATCH_MARKER_92),'9.2 detached schedule start');
  schedule=replaceExactlyOnce(schedule,SQLITE_SCHEDULE_END,PATCHED_SQLITE_SCHEDULE_END,'9.2 detached schedule end');
  const [first,second]=[[wakeStart,wakeEnd,patchedWake],[scheduleStart,scheduleEnd,schedule]].sort((a,b)=>a[0]-b[0]);
  return {changed:true,source:source.slice(0,first[0])+first[2]+source.slice(first[1],second[0])+second[2]+source.slice(second[1])};
}

async function resolveBundle(packageRoot) {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  if (
    packageJson.name !== "openclaw" ||
    !SUPPORTED_PACKAGE_VERSIONS.has(packageJson.version)
  ) {
    throw new Error(
      `unsupported OpenClaw package ${packageJson.name}@${packageJson.version}; expected one of ${Array.from(SUPPORTED_PACKAGE_VERSIONS).join(", ")}`,
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
      (
        source.includes(SCHEDULE_START) ||
        source.includes(SQLITE_SCHEDULE_START) ||
        source.includes(PATCH_MARKER) ||
        source.includes(PATCH_MARKER_92)
      )
    ) {
      matches.push(candidate);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`expected one OpenClaw media tools bundle, found ${matches.length}`);
  }
  return matches[0];
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function backupPathFor(bundlePath, source) {
  return `${bundlePath}${source.includes(PATCH_MARKER_92) ? BACKUP_SUFFIX_92 : BACKUP_SUFFIX}`;
}

async function writeAtomically(bundlePath, content, label) {
  const originalStat = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.worker-media-relay-${label}-${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { mode: originalStat.mode });
  await chmod(temporaryPath, originalStat.mode);
  await rename(temporaryPath, bundlePath);
}

async function patchPackage(packageRoot) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const source = await readFile(bundlePath, "utf8");
  const result = patchOpenClawMediaCompletionBundle(source);
  if (!result.changed) return { bundlePath, changed: false };
  const backupPath = backupPathFor(bundlePath, result.source);
  try {
    await copyFile(bundlePath, backupPath, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  // A stale backup from another runtime revision would make --restore a silent rollback.
  if (sha256(await readFile(backupPath, "utf8")) !== sha256(source)) {
    throw new Error(`existing backup ${backupPath} does not match the unpatched bundle; refusing to patch`);
  }
  await writeAtomically(bundlePath, result.source, "apply");
  return {
    bundlePath,
    backupPath,
    changed: true,
    beforeSha256: sha256(source),
    afterSha256: sha256(result.source),
  };
}

async function restorePackage(packageRoot) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const current = await readFile(bundlePath, "utf8");
  const backupPath = backupPathFor(bundlePath, current);
  const backup = await readFile(backupPath, "utf8");
  if (backup.includes(PATCH_MARKER) || backup.includes(PATCH_MARKER_92)) {
    throw new Error(`backup ${backupPath} is itself patched; refusing to restore`);
  }
  await writeAtomically(bundlePath, backup, "restore");
  return { bundlePath, backupPath, restoredSha256: sha256(backup) };
}

async function main(args) {
  if (args[0] === "--restore") {
    if (args.length !== 2) throw new Error("usage: patch-openclaw-media-completion-relay.mjs --restore <openclaw-package-root>");
    const result = await restorePackage(args[1]);
    process.stdout.write(`${JSON.stringify({ status: "restored", ...result })}\n`);
    return;
  }
  if (args.length !== 1) throw new Error("usage: patch-openclaw-media-completion-relay.mjs <openclaw-package-root>");
  const result = await patchPackage(args[0]);
  process.stdout.write(`${JSON.stringify({ status: result.changed ? "patched" : "already-patched", ...result })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
