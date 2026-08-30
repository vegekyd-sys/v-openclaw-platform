#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));

const distDir = args.get("--dist") ? resolve(args.get("--dist")) : null;
const rootDir = args.get("--root") ? resolve(args.get("--root")) : null;
const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
const dryRun = args.has("--dry-run");
const allowMissing = args.has("--allow-missing");

if (Boolean(distDir) === Boolean(rootDir)) {
  throw new Error("Specify exactly one of --dist=/path/to/dist or --root=/path/to/npm/projects");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function findBundles() {
  const distDirs = [];
  if (distDir) {
    distDirs.push(distDir);
  } else if (existsSync(rootDir)) {
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(rootDir, entry.name, "node_modules", "@openclaw", "feishu", "dist");
      if (existsSync(candidate)) distDirs.push(candidate);
    }
  }

  return distDirs.flatMap((candidateDist) => readdirSync(candidateDist)
    .filter((name) => /^monitor\.account-.*\.js$/.test(name))
    .map((name) => join(candidateDist, name)));
}

const bundles = findBundles();
if (bundles.length === 0 && allowMissing) {
  process.stdout.write(JSON.stringify({ changed: false, status: "plugin-not-installed" }) + "\n");
  process.exit(0);
}
if (bundles.length !== 1) {
  throw new Error(`Expected exactly one Feishu monitor bundle, found ${bundles.length}`);
}

const file = bundles[0];
const source = readFileSync(file, "utf8");
const patchedMarkers = [
  "function isVcodexMeaningfulProgressChat(chatId)",
  "function formatVcodexMeaningfulProgress(payload)",
  "const vcodexMeaningfulProgressEnabled =",
  "allowToolLifecycleWhenProgressHidden: vcodexMeaningfulProgressEnabled",
  "onItemEvent: vcodexMeaningfulProgressEnabled",
  "VCODEX_MEANINGFUL_PROGRESS_HEARTBEAT_MS",
  "async replace(text)",
  "replace: vcodexMeaningfulProgressEnabled",
];

if (patchedMarkers.every((marker) => source.includes(marker))) {
  process.stdout.write(JSON.stringify({
    changed: false,
    file,
    sha256: sha256(source),
    status: "already-patched",
  }) + "\n");
  process.exit(0);
}

const dispatcherSignature = "function createFeishuReplyDispatcher(params) {";
const dispatcherOffset = source.indexOf(dispatcherSignature);
if (dispatcherOffset < 0 || dispatcherOffset !== source.lastIndexOf(dispatcherSignature)) {
  throw new Error(`Dispatcher signature changed; refusing to patch ${file}`);
}

const helpers = `const VCODEX_MEANINGFUL_PROGRESS_HEARTBEAT_MS = 3e4;
function isVcodexMeaningfulProgressChat(chatId) {
\tconst configuredChatIds = process.env.V_FEISHU_VCODEX_STREAM_CHAT_IDS ?? process.env.VLAB_VCODEX_ACCEPTANCE_CHAT_ID ?? "";
\treturn configuredChatIds.split(",").map((value) => value.trim()).filter((value) => value.startsWith("oc_")).includes(chatId);
}
function sanitizeVcodexProgressText(text) {
\tconst normalized = String(text ?? "").replace(/\x60/g, "").replace(/(?:\\\\|\\/)[^\\s，。；：！？]+/gu, "相关文件").replace(/\\s+/g, " ").trim();
\tif (!normalized) return "";
\treturn normalized.length > 220 ? \`\${normalized.slice(0, 217)}…\` : normalized;
}
function formatVcodexMeaningfulProgress(payload) {
\tif (payload?.kind === "preamble" && payload.progressText) return sanitizeVcodexProgressText(payload.progressText);
\tconst finished = payload?.phase === "result" || payload?.status === "completed";
\tconst failed = payload?.status === "failed" || payload?.status === "error";
\tif (failed) return "刚才的执行步骤遇到问题，正在检查并调整。";
\tswitch (payload?.kind) {
\t\tcase "command": return finished ? "已完成一轮项目检查，正在继续处理。" : "正在执行项目检查与代码验证。";
\t\tcase "patch": return finished ? "代码修改已写入，正在继续验证。" : "正在修改代码并整理实现。";
\t\tcase "search": return finished ? "资料检索已完成，正在整理结论。" : "正在检索相关资料与依据。";
\t\tcase "analysis": return finished ? "分析阶段已完成，正在进入下一步。" : "正在分析上下文与实现方案。";
\t\tcase "tool": return finished ? "工具步骤已完成，正在继续处理。" : "正在调用所需工具处理任务。";
\t\tdefault: return "";
\t}
}
`;

const replacements = [
  {
    label: "replace-capable streaming session",
    before: `\tasync update(text) {
\t\tif (!this.state || this.closed) return;`,
    after: `\tasync replace(text) {
\t\tif (!this.state || this.closed) return;
\t\tconst nextText = typeof text === "string" ? text : "";
\t\tthis.pendingText = null;
\t\tthis.clearFlushTimer();
\t\tthis.queue = this.queue.then(async () => {
\t\t\tif (!this.state || this.closed || nextText === this.state.sentText) return;
\t\t\tthis.state.currentText = nextText;
\t\t\tif (await this.replaceCardContent(nextText, (e) => this.log?.(\`Replace failed: \${String(e)}\`)) && this.state) this.state.sentText = nextText;
\t\t});
\t\tawait this.queue;
\t}
\tasync update(text) {
\t\tif (!this.state || this.closed) return;`,
  },
  {
    label: "scoped progress flag",
    before: `\tconst streamingEnabled = account.config?.streaming !== false && renderMode !== "raw";
\tconst coreBlockStreamingEnabled = account.config?.blockStreaming === true;`,
    after: `\tconst streamingEnabled = account.config?.streaming !== false && renderMode !== "raw";
\tconst vcodexMeaningfulProgressEnabled = streamingEnabled && isVcodexMeaningfulProgressChat(chatId);
\tconst coreBlockStreamingEnabled = account.config?.blockStreaming === true;`,
  },
  {
    label: "replace update state",
    before: `\tlet streamingFlushScheduled = false;
\tlet latestStreamingCombined = null;
\tlet streamingStartPromise = null;`,
    after: `\tlet streamingFlushScheduled = false;
\tlet latestStreamingCombined = null;
\tlet latestStreamingReplace = false;
\tlet streamingStartPromise = null;`,
  },
  {
    label: "replace-aware update pump",
    before: `\tconst flushStreamingCardUpdate = (combined) => {
\t\tlatestStreamingCombined = combined;
\t\tif (streamingFlushScheduled) return;
\t\tstreamingFlushScheduled = true;
\t\tpartialUpdateQueue = partialUpdateQueue.then(async () => {
\t\t\ttry {
\t\t\t\twhile (latestStreamingCombined !== null) {
\t\t\t\t\tconst nextCombined = latestStreamingCombined;
\t\t\t\t\tlatestStreamingCombined = null;
\t\t\t\t\tif (streamingStartPromise) await streamingStartPromise;
\t\t\t\t\tif (streaming?.isActive()) await streaming.update(nextCombined);
\t\t\t\t}
\t\t\t} finally {
\t\t\t\tstreamingFlushScheduled = false;
\t\t\t}
\t\t});
\t};`,
    after: `\tconst flushStreamingCardUpdate = (combined, options) => {
\t\tlatestStreamingCombined = combined;
\t\tif (options?.replace === true) latestStreamingReplace = true;
\t\tif (streamingFlushScheduled) return;
\t\tstreamingFlushScheduled = true;
\t\tpartialUpdateQueue = partialUpdateQueue.then(async () => {
\t\t\ttry {
\t\t\t\twhile (latestStreamingCombined !== null) {
\t\t\t\t\tconst nextCombined = latestStreamingCombined;
\t\t\t\t\tconst shouldReplace = latestStreamingReplace;
\t\t\t\t\tlatestStreamingCombined = null;
\t\t\t\t\tlatestStreamingReplace = false;
\t\t\t\t\tif (streamingStartPromise) await streamingStartPromise;
\t\t\t\t\tif (streaming?.isActive()) {
\t\t\t\t\t\tif (shouldReplace) await streaming.replace(nextCombined);
\t\t\t\t\t\telse await streaming.update(nextCombined);
\t\t\t\t\t}
\t\t\t\t}
\t\t\t} finally {
\t\t\t\tstreamingFlushScheduled = false;
\t\t\t}
\t\t});
\t};`,
  },
  {
    label: "replace snapshot update",
    before: `\t\tflushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
\t};
\tconst queueReasoningUpdate`,
    after: `\t\tflushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText), { replace: options?.replace === true });
\t};
\tconst queueReasoningUpdate`,
  },
  {
    label: "progress state",
    before: `\tlet reasoningText = "";
\tlet statusLine = "";
\tlet snapshotBaseText = "";`,
    after: `\tlet reasoningText = "";
\tlet statusLine = "";
\tlet vcodexProgressText = "";
\tlet vcodexProgressStartedAtMs = 0;
\tlet vcodexProgressHeartbeat = null;
\tlet snapshotBaseText = "";`,
  },
  {
    label: "reset progress timer",
    before: `\tconst resetStreamingState = () => {
\t\tstreaming = null;`,
    after: `\tconst resetStreamingState = () => {
\t\tif (vcodexProgressHeartbeat) clearInterval(vcodexProgressHeartbeat);
\t\tvcodexProgressHeartbeat = null;
\t\tvcodexProgressText = "";
\t\tvcodexProgressStartedAtMs = 0;
\t\tstreaming = null;`,
  },
  {
    label: "reset replace update state",
    before: `\t\tstreamingFlushScheduled = false;
\t\tlatestStreamingCombined = null;
\t\tstreamText = "";`,
    after: `\t\tstreamingFlushScheduled = false;
\t\tlatestStreamingCombined = null;
\t\tlatestStreamingReplace = false;
\t\tstreamText = "";`,
  },
  {
    label: "close timer before final",
    before: `\tconst closeStreaming = async (options) => {
\t\ttry {`,
    after: `\tconst closeStreaming = async (options) => {
\t\tif (vcodexProgressHeartbeat) clearInterval(vcodexProgressHeartbeat);
\t\tvcodexProgressHeartbeat = null;
\t\ttry {`,
  },
  {
    label: "discard timer",
    before: `\tconst discardStreamingPreview = async () => {
\t\ttry {`,
    after: `\tconst discardStreamingPreview = async () => {
\t\tif (vcodexProgressHeartbeat) clearInterval(vcodexProgressHeartbeat);
\t\tvcodexProgressHeartbeat = null;
\t\ttry {`,
  },
  {
    label: "meaningful progress updater",
    before: `\tconst updateStreamingStatusLine = (nextStatusLine, options) => {
\t\tstatusLine = nextStatusLine;
\t\tif (!Boolean(streaming?.isActive() || streamingStartPromise) && (options?.startIfNeeded === false || renderMode !== "card")) return;
\t\tstartStreaming();
\t\tflushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
\t};`,
    after: `\tconst updateStreamingStatusLine = (nextStatusLine, options) => {
\t\tstatusLine = nextStatusLine;
\t\tif (!Boolean(streaming?.isActive() || streamingStartPromise) && (options?.startIfNeeded === false || renderMode !== "card")) return;
\t\tstartStreaming();
\t\tflushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText), { replace: vcodexMeaningfulProgressEnabled });
\t};
\tconst renderVcodexMeaningfulProgress = () => {
\t\tif (!vcodexMeaningfulProgressEnabled || !vcodexProgressText) return;
\t\tconst elapsedSeconds = vcodexProgressStartedAtMs > 0 ? Math.max(0, Math.floor((Date.now() - vcodexProgressStartedAtMs) / 1e3)) : 0;
\t\tconst elapsedText = elapsedSeconds >= 45 ? \`（已持续 \${Math.floor(elapsedSeconds / 60)} 分 \${elapsedSeconds % 60} 秒）\` : "";
\t\tupdateStreamingStatusLine(\`🔄 **\${vcodexProgressText}**\${elapsedText}\`);
\t};
\tconst updateVcodexMeaningfulProgress = (nextText) => {
\t\tif (!vcodexMeaningfulProgressEnabled || !nextText) return;
\t\tvcodexProgressText = nextText;
\t\tif (!vcodexProgressStartedAtMs) vcodexProgressStartedAtMs = Date.now();
\t\trenderVcodexMeaningfulProgress();
\t\tif (!vcodexProgressHeartbeat) vcodexProgressHeartbeat = setInterval(renderVcodexMeaningfulProgress, VCODEX_MEANINGFUL_PROGRESS_HEARTBEAT_MS);
\t};
\tconst stopVcodexMeaningfulProgress = () => {
\t\tif (vcodexProgressHeartbeat) clearInterval(vcodexProgressHeartbeat);
\t\tvcodexProgressHeartbeat = null;
\t\tstatusLine = "";
\t};`,
  },
  {
    label: "initial meaningful text",
    before: `\t\t\tif (streamingEnabled && renderMode === "card") startStreaming();
\t\t\tawait Promise.resolve(typingCallbacks?.onReplyStart?.());`,
    after: `\t\t\tif (streamingEnabled && renderMode === "card") {
\t\t\t\tstartStreaming();
\t\t\t\tif (vcodexMeaningfulProgressEnabled && !vcodexProgressStartedAtMs) updateVcodexMeaningfulProgress("已收到任务，正在分析并准备执行。");
\t\t\t}
\t\t\tawait Promise.resolve(typingCallbacks?.onReplyStart?.());`,
  },
  {
    label: "reply option lifecycle bridge",
    before: `\t\t\tdisableBlockStreaming: typeof account.config?.blockStreaming === "boolean" ? !account.config.blockStreaming : true,
\t\t\tonPartialReply: streamingEnabled ? (payload) => {`,
    after: `\t\t\tdisableBlockStreaming: typeof account.config?.blockStreaming === "boolean" ? !account.config.blockStreaming : true,
\t\t\tsuppressDefaultToolProgressMessages: vcodexMeaningfulProgressEnabled ? true : replyOptions.suppressDefaultToolProgressMessages,
\t\t\tallowToolLifecycleWhenProgressHidden: vcodexMeaningfulProgressEnabled ? true : replyOptions.allowToolLifecycleWhenProgressHidden,
\t\t\tcommentaryProgressEnabled: vcodexMeaningfulProgressEnabled ? true : replyOptions.commentaryProgressEnabled,
\t\t\tonItemEvent: vcodexMeaningfulProgressEnabled ? (payload) => {
\t\t\t\tconst nextText = formatVcodexMeaningfulProgress(payload);
\t\t\t\tif (nextText) updateVcodexMeaningfulProgress(nextText);
\t\t\t} : replyOptions.onItemEvent,
\t\t\tonPartialReply: streamingEnabled ? (payload) => {`,
  },
  {
    label: "actual answer replaces progress",
    before: `\t\t\t\tif (!cleaned) return;
\t\t\t\tstartStreaming();
\t\t\t\tqueueStreamingUpdate(cleaned, {`,
    after: `\t\t\t\tif (!cleaned) return;
\t\t\t\tif (vcodexMeaningfulProgressEnabled) stopVcodexMeaningfulProgress();
\t\t\t\tstartStreaming();
\t\t\t\tqueueStreamingUpdate(cleaned, {`,
  },
  {
    label: "replace actual answer snapshots",
    before: `\t\t\t\t\tdedupeWithLastPartial: true,
\t\t\t\t\tmode: "snapshot"
\t\t\t\t});`,
    after: `\t\t\t\t\tdedupeWithLastPartial: true,
\t\t\t\t\tmode: "snapshot",
\t\t\t\t\treplace: vcodexMeaningfulProgressEnabled
\t\t\t\t});`,
  },
  {
    label: "sanitized tool lifecycle",
    before: `\t\t\tonToolStart: streamingEnabled ? (payload) => {
\t\t\t\tif (!isChannelProgressDraftWorkToolName(payload.name)) return;
\t\t\t\tconst statusLineLocal = formatChannelProgressDraftLineForEntry(account.config, {
\t\t\t\t\tevent: "tool",
\t\t\t\t\tname: payload.name,
\t\t\t\t\tphase: payload.phase,
\t\t\t\t\targs: payload.args
\t\t\t\t}, { detailMode: payload.detailMode });
\t\t\t\tif (statusLineLocal) updateStreamingStatusLine(statusLineLocal);
\t\t\t} : void 0,`,
    after: `\t\t\tonToolStart: streamingEnabled ? (payload) => {
\t\t\t\tif (vcodexMeaningfulProgressEnabled) {
\t\t\t\t\tconst kind = payload.name === "bash" ? "command" : payload.name === "apply_patch" ? "patch" : payload.name === "web_search" ? "search" : "tool";
\t\t\t\t\tconst nextText = formatVcodexMeaningfulProgress({ kind, phase: payload.phase });
\t\t\t\t\tif (nextText) updateVcodexMeaningfulProgress(nextText);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tif (!isChannelProgressDraftWorkToolName(payload.name)) return;
\t\t\t\tconst statusLineLocal = formatChannelProgressDraftLineForEntry(account.config, {
\t\t\t\t\tevent: "tool",
\t\t\t\t\tname: payload.name,
\t\t\t\t\tphase: payload.phase,
\t\t\t\t\targs: payload.args
\t\t\t\t}, { detailMode: payload.detailMode });
\t\t\t\tif (statusLineLocal) updateStreamingStatusLine(statusLineLocal);
\t\t\t} : void 0,`,
  },
  {
    label: "answer transition status",
    before: `\t\t\tonAssistantMessageStart: streamingEnabled ? () => {
\t\t\t\tupdateStreamingStatusLine("", { startIfNeeded: false });
\t\t\t} : void 0,`,
    after: `\t\t\tonAssistantMessageStart: streamingEnabled ? () => {
\t\t\t\tif (vcodexMeaningfulProgressEnabled) updateVcodexMeaningfulProgress("正在整理并交付结果。");
\t\t\t\telse updateStreamingStatusLine("", { startIfNeeded: false });
\t\t\t} : void 0,`,
  },
];

let updated = source.replace(dispatcherSignature, `${helpers}${dispatcherSignature}`);
for (const replacement of replacements) {
  const first = updated.indexOf(replacement.before);
  const last = updated.lastIndexOf(replacement.before);
  if (first < 0 || first !== last) {
    throw new Error(`${replacement.label} signature changed; refusing to patch ${file}`);
  }
  updated = updated.replace(replacement.before, replacement.after);
}

if (updated === source || !patchedMarkers.every((marker) => updated.includes(marker))) {
  throw new Error(`Patch verification failed for ${file}`);
}

const result = {
  changed: !dryRun,
  dryRun,
  file,
  beforeSha256: sha256(source),
  afterSha256: sha256(updated),
  status: dryRun ? "would-patch" : "patched",
};

if (!dryRun) {
  if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupFile = join(backupDir, `${basename(file)}.${result.beforeSha256}.before`);
  if (!existsSync(backupFile)) copyFileSync(file, backupFile);
  writeFileSync(file, updated);
  result.backupFile = backupFile;
}

process.stdout.write(JSON.stringify(result) + "\n");
