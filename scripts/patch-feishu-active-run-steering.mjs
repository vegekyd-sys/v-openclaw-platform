#!/usr/bin/env node

import {
  chmod,
  copyFile,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SUPPORTED_PACKAGE_VERSIONS = new Set(["2026.7.1", "2026.8.1", "2026.9.1"]);
const BACKUP_SUFFIX = ".v-worker-steer-v0.2.3.bak";

const ORIGINAL_QUEUE_RETURN = `\treturn (key, task) => {
\t\tconst previous = queues.get(key) ?? Promise.resolve();
\t\tconst wrapped = () => boundedRun(key, task, taskTimeoutMs, onTaskTimeout);
\t\tconst next = previous.then(wrapped, wrapped);
\t\tqueues.set(key, next);
\t\tconst cleanup = () => {
\t\t\tif (queues.get(key) === next) queues.delete(key);
\t\t};
\t\tnext.then(cleanup, cleanup);
\t\treturn next;
\t};`;

const PATCHED_QUEUE_RETURN = `\tconst enqueue = (key, task) => {
\t\tconst previous = queues.get(key) ?? Promise.resolve();
\t\tconst wrapped = () => boundedRun(key, task, taskTimeoutMs, onTaskTimeout);
\t\tconst next = previous.then(wrapped, wrapped);
\t\tqueues.set(key, next);
\t\tconst cleanup = () => {
\t\t\tif (queues.get(key) === next) queues.delete(key);
\t\t};
\t\tnext.then(cleanup, cleanup);
\t\treturn next;
\t};
\tenqueue.isBusy = (key) => queues.has(key);
\treturn enqueue;`;

const ORIGINAL_DISPATCH = `\t\tawait enqueue(sequentialKey, task);`;
const INTERMEDIATE_DISPATCH = `\t\tconst dispatchKey = enqueue.isBusy(sequentialKey) ? \`\${sequentialKey}:active-run\` : sequentialKey;
\t\tawait enqueue(dispatchKey, task);`;
const PATCHED_DISPATCH = `\t\tconst dispatchKey = activeRunDispatch ? \`\${sequentialKey}:active-run\` : sequentialKey;
\t\tawait enqueue(dispatchKey, task);`;

const ORIGINAL_TASK_DECLARATION = `\t\tconst task = () => handleMessage({`;
const PATCHED_TASK_DECLARATION = `\t\tconst workerSteerEnabled = process.env.VLAB_FEISHU_STEER_ENABLED === "1";
\t\tconst workerSteerChatIds = new Set((process.env.VLAB_FEISHU_STEER_CHAT_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
\t\tconst workerSteerChatId = event.message.chat_id?.trim() ?? "";
\t\tconst activeRunDispatch = workerSteerEnabled && (workerSteerChatIds.has("*") || workerSteerChatIds.has(workerSteerChatId)) && enqueue.isBusy(sequentialKey);
\t\tconst task = () => handleMessage({`;

const OPENCLAW81_TASK_DECLARATION = `\t\tconst task = async () => {`;
const PATCHED_OPENCLAW81_TASK_DECLARATION = `\t\tconst workerSteerEnabled = process.env.VLAB_FEISHU_STEER_ENABLED === "1";
\t\tconst workerSteerChatIds = new Set((process.env.VLAB_FEISHU_STEER_CHAT_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
\t\tconst workerSteerChatId = event.message.chat_id?.trim() ?? "";
\t\tconst activeRunDispatch = workerSteerEnabled && (workerSteerChatIds.has("*") || workerSteerChatIds.has(workerSteerChatId)) && enqueue.isBusy(sequentialKey);
\t\tconst task = async () => {`;

const ORIGINAL_TASK_TAIL = `\t\t\tprocessingClaimHeld: true,
\t\t\tmessageDedupeKey
\t\t});`;
const PATCHED_TASK_TAIL = `\t\t\tprocessingClaimHeld: true,
\t\t\tmessageDedupeKey,
\t\t\tactiveRunDispatch
\t\t});`;

const OPENCLAW81_TASK_TAIL = `\t\t\t\tprocessingClaim,
\t\t\t\tmessageDedupeKey,
\t\t\t\tturnAdoptionLifecycle
\t\t\t});`;
const PATCHED_OPENCLAW81_TASK_TAIL = `\t\t\t\tprocessingClaim,
\t\t\t\tmessageDedupeKey,
\t\t\t\tturnAdoptionLifecycle,
\t\t\t\tactiveRunDispatch
\t\t\t});`;

const ORIGINAL_REPLY_OPTIONS = `\t\treplyOptions: {
\t\t\t...replyOptions,
\t\t\tonModelSelected: prefixContext.onModelSelected,`;
const PATCHED_REPLY_OPTIONS = `\t\treplyOptions: {
\t\t\t...replyOptions,
\t\t\t// Required by OpenClaw's active Reply Operation admission. Without
\t\t\t// this lifecycle, a later Feishu turn waits before queue-mode Steer
\t\t\t// can inspect and inject into the active Agent run.
\t\t\tqueuedFollowupLifecycle: replyOptions.queuedFollowupLifecycle ?? {},
\t\t\tonModelSelected: prefixContext.onModelSelected,`;

const OPENCLAW81_REPLY_OPTIONS = `\t\t\t\t\t\treplyOptions: {
\t\t\t\t\t\t\t...replyOptions,
\t\t\t\t\t\t\t...turnAdoptionLifecycle ? bindIngressLifecycleToReplyOptions(turnAdoptionLifecycle) : {}
\t\t\t\t\t\t}`;
const PATCHED_OPENCLAW81_REPLY_OPTIONS = `\t\t\t\t\t\treplyOptions: {
\t\t\t\t\t\t\t...replyOptions,
\t\t\t\t\t\t\t// Keep active Reply Operation admission available for Steer.
\t\t\t\t\t\t\tqueuedFollowupLifecycle: replyOptions.queuedFollowupLifecycle ?? {},
\t\t\t\t\t\t\t...turnAdoptionLifecycle ? bindIngressLifecycleToReplyOptions(turnAdoptionLifecycle) : {}
\t\t\t\t\t\t}`;

const ORIGINAL_NO_VISIBLE_FALLBACK = `\t\t\tif (shouldSendNoVisibleReplyFallback({
\t\t\t\t...dispatchResult,
\t\t\t\tfailedCounts: dispatcher.getFailedCounts?.() ?? {
\t\t\t\t\ttool: 0,
\t\t\t\t\tblock: 0,
\t\t\t\t\tfinal: 0
\t\t\t\t}
\t\t\t})) await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply");`;
const PATCHED_NO_VISIBLE_FALLBACK = `\t\t\tif (!params.activeRunDispatch && shouldSendNoVisibleReplyFallback({
\t\t\t\t...dispatchResult,
\t\t\t\tfailedCounts: dispatcher.getFailedCounts?.() ?? {
\t\t\t\t\ttool: 0,
\t\t\t\t\tblock: 0,
\t\t\t\t\tfinal: 0
\t\t\t\t}
\t\t\t})) await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply");`;

const OPENCLAW81_NO_VISIBLE_FALLBACK = `\t\t\tif (shouldSendNoVisibleReplyFallback(dispatchResult)) await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply");`;
const PATCHED_OPENCLAW81_NO_VISIBLE_FALLBACK = `\t\t\tif (!params.activeRunDispatch && shouldSendNoVisibleReplyFallback(dispatchResult)) await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply");`;
// 9.1 exposes native admission evidence. Do not hide genuine empty/failed
// replies merely because they entered the active-run transport lane.
const PATCHED_OPENCLAW91_NO_VISIBLE_FALLBACK = `\t\t\tif (dispatchResult.deferredToActiveRun !== "steer" && shouldSendNoVisibleReplyFallback(dispatchResult)) await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply");`;

function replaceExactlyOnce(source, original, replacement, label) {
  const first = source.indexOf(original);
  if (first === -1) {
    throw new Error(`Feishu active-run steering patch could not find ${label}`);
  }
  if (source.indexOf(original, first + original.length) !== -1) {
    throw new Error(
      `Feishu active-run steering patch found multiple ${label} blocks`,
    );
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + original.length)}`;
}

export function patchFeishuActiveRunSteeringBundle(source) {
  const openClaw81Shape = source.includes(OPENCLAW81_TASK_DECLARATION);
  const nativeReceiptShape = source.includes('dispatchResult.settledReceipt?.anyVisibleDelivered');
  let patched = source;
  let changed = false;
  const applyStep = (originals, replacement, label) => {
    if (patched.includes(replacement)) return;
    const original = originals.find((candidate) => patched.includes(candidate));
    if (!original) {
      throw new Error(
        `Feishu active-run steering patch found neither original nor patched ${label}`,
      );
    }
    patched = replaceExactlyOnce(patched, original, replacement, label);
    changed = true;
  };
  applyStep(
    [ORIGINAL_QUEUE_RETURN],
    PATCHED_QUEUE_RETURN,
    "sequential queue return",
  );
  applyStep(
    [ORIGINAL_TASK_DECLARATION, OPENCLAW81_TASK_DECLARATION],
    openClaw81Shape
      ? PATCHED_OPENCLAW81_TASK_DECLARATION
      : PATCHED_TASK_DECLARATION,
    "active-run task declaration",
  );
  applyStep(
    [ORIGINAL_TASK_TAIL, OPENCLAW81_TASK_TAIL],
    openClaw81Shape
      ? PATCHED_OPENCLAW81_TASK_TAIL
      : PATCHED_TASK_TAIL,
    "active-run task flag",
  );
  applyStep(
    [INTERMEDIATE_DISPATCH, ORIGINAL_DISPATCH],
    PATCHED_DISPATCH,
    "message dispatch enqueue",
  );
  applyStep(
    [ORIGINAL_REPLY_OPTIONS, OPENCLAW81_REPLY_OPTIONS],
    openClaw81Shape
      ? PATCHED_OPENCLAW81_REPLY_OPTIONS
      : PATCHED_REPLY_OPTIONS,
    "queued follow-up lifecycle",
  );
  applyStep(
    [ORIGINAL_NO_VISIBLE_FALLBACK, OPENCLAW81_NO_VISIBLE_FALLBACK, PATCHED_OPENCLAW81_NO_VISIBLE_FALLBACK],
    nativeReceiptShape
      ? PATCHED_OPENCLAW91_NO_VISIBLE_FALLBACK
      : openClaw81Shape
      ? PATCHED_OPENCLAW81_NO_VISIBLE_FALLBACK
      : PATCHED_NO_VISIBLE_FALLBACK,
    "adopted Steer empty-reply fallback",
  );
  return { changed, source: patched };
}

// Exported as an executable specification for the ordering regression test.
export function createActiveRunAwareQueue() {
  const queues = new Map();
  const enqueue = (key, task) => {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    queues.set(key, next);
    const cleanup = () => {
      if (queues.get(key) === next) queues.delete(key);
    };
    next.then(cleanup, cleanup);
    return next;
  };
  enqueue.isBusy = (key) => queues.has(key);
  enqueue.dispatch = (key, task) =>
    enqueue(enqueue.isBusy(key) ? `${key}:active-run` : key, task);
  return enqueue;
}

async function resolveBundle(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (!["openclaw", "@openclaw/feishu"].includes(packageJson.name)) {
    throw new Error(
      `unexpected package at ${packageRoot}: ${packageJson.name ?? "unknown"}`,
    );
  }
  if (!SUPPORTED_PACKAGE_VERSIONS.has(packageJson.version)) {
    throw new Error(
      `unsupported @openclaw/feishu version ${packageJson.version}; expected one of ${Array.from(SUPPORTED_PACKAGE_VERSIONS).join(", ")}`,
    );
  }
  const distDir = path.join(packageRoot, "dist");
  const candidates = (await readdir(distDir))
    .filter((name) => /^monitor\.account-[A-Za-z0-9_-]+\.js$/.test(name))
    .sort();
  if (candidates.length !== 1) {
    throw new Error(
      `expected one Feishu monitor.account bundle in ${distDir}, found ${candidates.length}`,
    );
  }
  return path.join(distDir, candidates[0]);
}

export async function patchPackage(packageRoot) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const original = await readFile(bundlePath, "utf8");
  const result = patchFeishuActiveRunSteeringBundle(original);
  if (!result.changed) return { bundlePath, changed: false };
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  try {
    await stat(backupPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await copyFile(bundlePath, backupPath);
  }
  const originalStat = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.active-run-steering-${process.pid}.tmp`;
  await writeFile(temporaryPath, result.source, { mode: originalStat.mode });
  await chmod(temporaryPath, originalStat.mode);
  await rename(temporaryPath, bundlePath);
  return { bundlePath, changed: true };
}

export async function restorePackage(packageRoot) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  let backupStat;
  try {
    backupStat = await stat(backupPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { bundlePath, changed: false };
    }
    throw error;
  }
  const temporaryPath = `${bundlePath}.active-run-steering-restore-${process.pid}.tmp`;
  await copyFile(backupPath, temporaryPath);
  await chmod(temporaryPath, backupStat.mode);
  await rename(temporaryPath, bundlePath);
  await unlink(backupPath);
  return { bundlePath, changed: true };
}

async function main(args) {
  const restore = args[0] === "--restore";
  const packageRoots = restore ? args.slice(1) : args;
  if (packageRoots.length === 0) {
    throw new Error(
      "usage: patch-feishu-active-run-steering.mjs [--restore] <package-root> [...]",
    );
  }
  for (const packageRoot of packageRoots) {
    const result = restore
      ? await restorePackage(packageRoot)
      : await patchPackage(packageRoot);
    process.stdout.write(
      `${result.changed ? (restore ? "restored" : "patched") : (restore ? "not-patched" : "already-patched")} ${result.bundlePath}\n`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
