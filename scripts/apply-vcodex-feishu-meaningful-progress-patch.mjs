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
  "const VCODEX_COMMENTARY_STREAM_V2 = true",
  "function resolveVcodexSessionRuntime(params)",
  "getSessionEntry({",
  "function formatVcodexCommentary(payload)",
  "resolveVcodexSessionRuntime({",
  "allowToolLifecycleWhenProgressHidden: vcodexMeaningfulProgressEnabled",
  "suppressToolErrorWarnings: vcodexMeaningfulProgressEnabled",
  "sourceReplyDeliveryMode: vcodexMeaningfulProgressEnabled ? \"automatic\"",
  "onItemEvent: vcodexMeaningfulProgressEnabled",
  "let vcodexDisplayPhase = \"commentary\"",
  "const vcodexCommentaryByItem = new Map()",
  "const appendVcodexCommentary =",
  "const beginVcodexFinalAnswer =",
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

const v1Helpers = `const VCODEX_COMMENTARY_STREAM_V1 = true;
function isVcodexMeaningfulProgressChat(chatId) {
\tconst configuredChatIds = process.env.V_FEISHU_VCODEX_STREAM_CHAT_IDS ?? process.env.VLAB_VCODEX_ACCEPTANCE_CHAT_ID ?? "";
\treturn configuredChatIds.split(",").map((value) => value.trim()).filter((value) => value.startsWith("oc_")).includes(chatId);
}
function sanitizeVcodexCommentaryText(text) {
\treturn String(text ?? "").replace(/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/gu, "").trim();
}
function formatVcodexCommentary(payload) {
\tif (payload?.kind !== "preamble" || !payload.progressText) return "";
\treturn sanitizeVcodexCommentaryText(payload.progressText);
}
`;

const helpers = `const VCODEX_COMMENTARY_STREAM_V2 = true;
function normalizeVcodexRuntimeId(value) {
\tconst normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
\treturn normalized || void 0;
}
function resolveVcodexConfiguredRuntime(cfg, agentId, provider, model) {
\tif (!provider || !model) return;
\tconst normalizedProvider = provider.trim().toLowerCase();
\tconst normalizedModel = model.trim();
\tconst normalizedAgentId = String(agentId ?? "").trim().toLowerCase();
\tconst agentEntry = (cfg?.agents?.list ?? []).find((entry) => String(entry?.id ?? "").trim().toLowerCase() === normalizedAgentId);
\tconst modelMaps = [agentEntry?.models, cfg?.agents?.defaults?.models];
\tconst readMapPolicy = (models, key) => {
\t\tif (!models || typeof models !== "object") return;
\t\tfor (const [candidateKey, entry] of Object.entries(models)) {
\t\t\tif (candidateKey.trim().toLowerCase() !== key.toLowerCase()) continue;
\t\t\tconst runtime = normalizeVcodexRuntimeId(entry?.agentRuntime?.id);
\t\t\tif (runtime) return runtime;
\t\t}
\t};
\tfor (const models of modelMaps) {
\t\tconst runtime = readMapPolicy(models, \`\${normalizedProvider}/\${normalizedModel}\`);
\t\tif (runtime) return runtime;
\t}
\tfor (const models of modelMaps) {
\t\tconst runtime = readMapPolicy(models, \`\${normalizedProvider}/*\`);
\t\tif (runtime) return runtime;
\t}
\treturn normalizedProvider === "openai" && cfg?.plugins?.entries?.codex?.enabled === true ? "codex" : "openclaw";
}
function resolveVcodexSessionRuntime(params) {
\tlet provider;
\tlet model;
\ttry {
\t\tconst entry = params.sessionKey ? getSessionEntry({
\t\t\tstorePath: params.storePath,
\t\t\tsessionKey: params.sessionKey,
\t\t\treadConsistency: "latest"
\t\t}) : void 0;
\t\tprovider = typeof entry?.providerOverride === "string" ? entry.providerOverride : void 0;
\t\tmodel = typeof entry?.modelOverride === "string" ? entry.modelOverride : void 0;
\t} catch {}
\tif (!provider || !model) {
\t\tconst normalizedAgentId = String(params.agentId ?? "").trim().toLowerCase();
\t\tconst agentEntry = (params.cfg?.agents?.list ?? []).find((entry) => String(entry?.id ?? "").trim().toLowerCase() === normalizedAgentId);
\t\tconst primary = agentEntry?.model?.primary ?? params.cfg?.agents?.defaults?.model?.primary;
\t\tif (typeof primary === "string" && primary.includes("/")) {
\t\t\tconst slashIndex = primary.indexOf("/");
\t\t\tprovider ||= primary.slice(0, slashIndex);
\t\t\tmodel ||= primary.slice(slashIndex + 1);
\t\t}
\t}
\treturn resolveVcodexConfiguredRuntime(params.cfg, params.agentId, provider, model);
}
function sanitizeVcodexCommentaryText(text) {
\treturn String(text ?? "").replace(/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/gu, "").trim();
}
function formatVcodexCommentary(payload) {
\tif (payload?.kind !== "preamble" || !payload.progressText) return "";
\treturn sanitizeVcodexCommentaryText(payload.progressText);
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
    label: "runtime-aware progress flag",
    before: `\tconst streamingEnabled = account.config?.streaming !== false && renderMode !== "raw";
\tconst coreBlockStreamingEnabled = account.config?.blockStreaming === true;`,
    after: `\tconst streamingEnabled = account.config?.streaming !== false && renderMode !== "raw";
\tconst vcodexMeaningfulProgressEnabled = streamingEnabled && resolveVcodexSessionRuntime({
\t\tcfg,
\t\tagentId,
\t\tsessionKey: params.sessionKey,
\t\tstorePath: core.channel.session.resolveStorePath(cfg.session?.store, { agentId })
\t}) === "codex";
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
    label: "commentary stream state",
    before: `\tlet reasoningText = "";
\tlet statusLine = "";
\tlet snapshotBaseText = "";`,
    after: `\tlet reasoningText = "";
\tlet statusLine = "";
\tlet vcodexDisplayPhase = "commentary";
\tconst vcodexCommentaryByItem = new Map();
\tconst vcodexCommentaryItemOrder = [];
\tlet snapshotBaseText = "";`,
  },
  {
    label: "reset commentary stream state",
    before: `\tconst resetStreamingState = () => {
\t\tstreaming = null;`,
    after: `\tconst resetStreamingState = () => {
\t\tvcodexDisplayPhase = "closed";
\t\tvcodexCommentaryByItem.clear();
\t\tvcodexCommentaryItemOrder.length = 0;
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
    label: "commentary stream updater",
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
\t\tflushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
\t};
\tconst appendVcodexCommentary = (itemId, nextText) => {
\t\tif (!vcodexMeaningfulProgressEnabled || vcodexDisplayPhase !== "commentary" || !nextText) return;
\t\tconst key = typeof itemId === "string" && itemId ? itemId : "unkeyed-commentary";
\t\tif (vcodexCommentaryByItem.get(key) === nextText) return;
\t\tif (!vcodexCommentaryByItem.has(key)) vcodexCommentaryItemOrder.push(key);
\t\tvcodexCommentaryByItem.set(key, nextText);
\t\tconst combined = vcodexCommentaryItemOrder.map((entry) => vcodexCommentaryByItem.get(entry)).filter(Boolean).join("\\n\\n");
\t\tif (!combined) return;
\t\tstartStreaming();
\t\tflushStreamingCardUpdate(combined, { replace: true });
\t};
\tconst beginVcodexFinalAnswer = () => {
\t\tif (!vcodexMeaningfulProgressEnabled || vcodexDisplayPhase === "closed") return;
\t\tvcodexDisplayPhase = "final";
\t\tvcodexCommentaryByItem.clear();
\t\tvcodexCommentaryItemOrder.length = 0;
\t\tstatusLine = "";
\t\treasoningText = "";
\t\tstreamText = "";
\t\tlastPartial = "";
\t\tsnapshotBaseText = "";
\t\tlastSnapshotTextLength = 0;
\t\thasStreamingFinalText = false;
\t};`,
  },
  {
    label: "defer scoped card until real text",
    before: `\t\t\tif (streamingEnabled && renderMode === "card") startStreaming();
\t\t\tawait Promise.resolve(typingCallbacks?.onReplyStart?.());`,
    after: `\t\t\tif (streamingEnabled && renderMode === "card" && !vcodexMeaningfulProgressEnabled) startStreaming();
\t\t\tawait Promise.resolve(typingCallbacks?.onReplyStart?.());`,
  },
  {
    label: "reply option lifecycle bridge",
    before: `\t\t\tdisableBlockStreaming: typeof account.config?.blockStreaming === "boolean" ? !account.config.blockStreaming : true,
\t\t\tonPartialReply: streamingEnabled ? (payload) => {`,
    after: `\t\t\tdisableBlockStreaming: typeof account.config?.blockStreaming === "boolean" ? !account.config.blockStreaming : true,
\t\t\tsourceReplyDeliveryMode: vcodexMeaningfulProgressEnabled ? "automatic" : replyOptions.sourceReplyDeliveryMode,
\t\t\tsuppressDefaultToolProgressMessages: vcodexMeaningfulProgressEnabled ? true : replyOptions.suppressDefaultToolProgressMessages,
\t\t\tallowToolLifecycleWhenProgressHidden: vcodexMeaningfulProgressEnabled ? true : replyOptions.allowToolLifecycleWhenProgressHidden,
\t\t\tsuppressToolErrorWarnings: vcodexMeaningfulProgressEnabled ? true : replyOptions.suppressToolErrorWarnings,
\t\t\tcommentaryProgressEnabled: vcodexMeaningfulProgressEnabled ? true : replyOptions.commentaryProgressEnabled,
\t\t\tonItemEvent: vcodexMeaningfulProgressEnabled ? (payload) => {
\t\t\t\tconst nextText = formatVcodexCommentary(payload);
\t\t\t\tif (nextText) appendVcodexCommentary(payload?.itemId, nextText);
\t\t\t} : replyOptions.onItemEvent,
\t\t\tonPartialReply: streamingEnabled ? (payload) => {`,
  },
  {
    label: "actual answer replaces progress",
    before: `\t\t\t\tif (!cleaned) return;
\t\t\t\tstartStreaming();
\t\t\t\tqueueStreamingUpdate(cleaned, {`,
    after: `\t\t\t\tif (!cleaned) return;
\t\t\t\tif (vcodexMeaningfulProgressEnabled) beginVcodexFinalAnswer();
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
    label: "suppress scoped tool lifecycle",
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
\t\t\t\tif (vcodexMeaningfulProgressEnabled) return;
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
    label: "suppress scoped assistant transition status",
    before: `\t\t\tonAssistantMessageStart: streamingEnabled ? () => {
\t\t\t\tupdateStreamingStatusLine("", { startIfNeeded: false });
\t\t\t} : void 0,`,
    after: `\t\t\tonAssistantMessageStart: streamingEnabled ? () => {
\t\t\t\tif (!vcodexMeaningfulProgressEnabled) updateStreamingStatusLine("", { startIfNeeded: false });
\t\t\t} : void 0,`,
  },
  {
    label: "suppress scoped reasoning stream",
    before: `\t\t\tonReasoningStream: reasoningPreviewEnabled ? (payload) => {
\t\t\t\tif (!payload.text) return;`,
    after: `\t\t\tonReasoningStream: reasoningPreviewEnabled ? (payload) => {
\t\t\t\tif (vcodexMeaningfulProgressEnabled) return;
\t\t\t\tif (!payload.text) return;`,
  },
  {
    label: "suppress scoped compaction status",
    before: `\t\t\tonCompactionStart: streamingEnabled ? () => {
\t\t\t\tupdateStreamingStatusLine("📦 **Compacting context...**");
\t\t\t} : void 0,
\t\t\tonCompactionEnd: streamingEnabled ? () => {
\t\t\t\tupdateStreamingStatusLine("");`,
    after: `\t\t\tonCompactionStart: streamingEnabled ? () => {
\t\t\t\tif (vcodexMeaningfulProgressEnabled) return;
\t\t\t\tupdateStreamingStatusLine("📦 **Compacting context...**");
\t\t\t} : void 0,
\t\t\tonCompactionEnd: streamingEnabled ? () => {
\t\t\t\tif (vcodexMeaningfulProgressEnabled) return;
\t\t\t\tupdateStreamingStatusLine("");`,
  },
  {
    label: "suppress scoped block replies",
    before: `\t\tdeliver: async (payload, info) => {
\t\t\tif (info?.kind === "final") skippedFinalReason = null;
\t\t\tconst payloadText =`,
    after: `\t\tdeliver: async (payload, info) => {
\t\t\tif (info?.kind === "final") skippedFinalReason = null;
\t\t\tif (vcodexMeaningfulProgressEnabled && info?.kind === "block") return;
\t\t\tconst payloadText =`,
  },
  {
    label: "authoritative scoped final reply",
    before: `\t\t\tconst text = info?.kind === "final" ? mergeStreamingFinalText(streamText, reply.text, payload.isError === true && hasStreamingFinalText) : reply.text;`,
    after: `\t\t\tconst text = info?.kind === "final" ? vcodexMeaningfulProgressEnabled ? reply.text : mergeStreamingFinalText(streamText, reply.text, payload.isError === true && hasStreamingFinalText) : reply.text;`,
  },
];

const v1Flag = `\tconst streamingEnabled = account.config?.streaming !== false && renderMode !== "raw";
\tconst vcodexMeaningfulProgressEnabled = streamingEnabled && isVcodexMeaningfulProgressChat(chatId);
\tconst coreBlockStreamingEnabled = account.config?.blockStreaming === true;`;
const v2Flag = `\tconst streamingEnabled = account.config?.streaming !== false && renderMode !== "raw";
\tconst vcodexMeaningfulProgressEnabled = streamingEnabled && resolveVcodexSessionRuntime({
\t\tcfg,
\t\tagentId,
\t\tsessionKey: params.sessionKey,
\t\tstorePath: core.channel.session.resolveStorePath(cfg.session?.store, { agentId })
\t}) === "codex";
\tconst coreBlockStreamingEnabled = account.config?.blockStreaming === true;`;

let updated;
if (source.includes("const VCODEX_COMMENTARY_STREAM_V1 = true")) {
  if (!source.includes(v1Helpers) || !source.includes(v1Flag)) {
    throw new Error(`V1 commentary signatures changed; refusing to upgrade ${file}`);
  }
  updated = source.replace(v1Helpers, helpers).replace(v1Flag, v2Flag);
} else {
  updated = source.replace(dispatcherSignature, `${helpers}${dispatcherSignature}`);
  for (const replacement of replacements) {
    const first = updated.indexOf(replacement.before);
    const last = updated.lastIndexOf(replacement.before);
    if (first < 0 || first !== last) {
      throw new Error(`${replacement.label} signature changed; refusing to patch ${file}`);
    }
    updated = updated.replace(replacement.before, replacement.after);
  }
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
