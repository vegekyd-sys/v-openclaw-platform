import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveOpenClawAgentRuntimePath } from "./runtime-path.mjs";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTextBlocks(message) {
  if (!isRecord(message)) {
    return [];
  }
  if (typeof message.content === "string") {
    return message.content.trim() ? [message.content] : [];
  }
  if (!Array.isArray(message.content)) {
    return [];
  }
  return message.content
    .filter(
      (block) =>
        isRecord(block) &&
        block.type === "text" &&
        typeof block.text === "string" &&
        block.text.trim() !== "",
    )
    .map((block) => block.text);
}

function readVisiblePayloadTexts(payloads) {
  if (!Array.isArray(payloads)) {
    return [];
  }
  return payloads
    .filter(
      (payload) =>
        isRecord(payload) &&
        payload.isError !== true &&
        payload.isReasoning !== true &&
        typeof payload.text === "string" &&
        payload.text.trim() !== "",
    )
    .map((payload) => payload.text);
}

function readPayloadMedia(payloads) {
  if (!Array.isArray(payloads)) {
    return {
      urls: [],
      audioAsVoice: false,
      trustedLocalMedia: false,
    };
  }
  const urls = [];
  let audioAsVoice = false;
  let trustedLocalMedia = false;
  for (const payload of payloads) {
    if (
      !isRecord(payload) ||
      payload.isError === true ||
      payload.isReasoning === true
    ) {
      continue;
    }
    if (typeof payload.mediaUrl === "string" && payload.mediaUrl.trim()) {
      urls.push(payload.mediaUrl);
    }
    if (Array.isArray(payload.mediaUrls)) {
      urls.push(
        ...payload.mediaUrls.filter(
          (url) => typeof url === "string" && url.trim() !== "",
        ),
      );
    }
    audioAsVoice ||= payload.audioAsVoice === true;
    trustedLocalMedia ||= payload.trustedLocalMedia === true;
  }
  return {
    urls: [...new Set(urls)],
    audioAsVoice,
    trustedLocalMedia,
  };
}

function readAsyncTaskMeta(message) {
  const details = isRecord(message?.details) ? message.details : undefined;
  if (details?.async !== true || details.status !== "started") {
    return undefined;
  }
  const nestedTask = isRecord(details.task) ? details.task : undefined;
  const asyncTaskRunId =
    typeof details.runId === "string"
      ? details.runId
      : typeof nestedTask?.runId === "string"
        ? nestedTask.runId
        : undefined;
  const asyncTaskId =
    typeof details.taskId === "string"
      ? details.taskId
      : typeof nestedTask?.taskId === "string"
        ? nestedTask.taskId
        : undefined;
  return {
    asyncStarted: true,
    ...(asyncTaskRunId ? { asyncTaskRunId } : {}),
    ...(asyncTaskId ? { asyncTaskId } : {}),
  };
}

function readToolMetas(messages) {
  const metas = [];
  const metasByCallId = new Map();
  for (const message of messages) {
    if (message?.role === "toolResult" || message?.role === "tool_result") {
      const asyncMeta = readAsyncTaskMeta(message);
      if (asyncMeta && typeof message.toolCallId === "string") {
        const meta = metasByCallId.get(message.toolCallId);
        if (meta) {
          Object.assign(meta, asyncMeta);
        }
      }
      continue;
    }
    if (message?.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const block of message.content) {
      if (
        isRecord(block) &&
        (block.type === "toolCall" || block.type === "tool_use")
      ) {
        const meta = {
          toolName:
            typeof block.name === "string" && block.name.trim()
              ? block.name
              : "unknown",
        };
        metas.push(meta);
        if (typeof block.id === "string" && block.id.trim()) {
          metasByCallId.set(block.id, meta);
        }
      }
    }
  }
  return metas;
}

function readAcceptedSessionSpawns(messages) {
  const spawnArgsByCallId = new Map();
  const accepted = [];
  for (const message of messages) {
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (
          isRecord(block) &&
          (block.type === "toolCall" || block.type === "tool_use") &&
          block.name === "sessions_spawn" &&
          typeof block.id === "string"
        ) {
          spawnArgsByCallId.set(
            block.id,
            isRecord(block.arguments) ? block.arguments : {},
          );
        }
      }
      continue;
    }
    if (
      (message?.role !== "toolResult" &&
        message?.role !== "tool_result") ||
      message.toolName !== "sessions_spawn" ||
      message.isError === true
    ) {
      continue;
    }
    let result = isRecord(message.details) ? message.details : undefined;
    if (!result) {
      for (const text of readTextBlocks(message)) {
        try {
          const parsed = JSON.parse(text);
          if (isRecord(parsed)) {
            result = parsed;
            break;
          }
        } catch {
          // Native tools may return human-readable text.
        }
      }
    }
    if (
      result?.status !== "accepted" ||
      typeof result.runId !== "string" ||
      typeof result.childSessionKey !== "string"
    ) {
      continue;
    }
    const args = spawnArgsByCallId.get(message.toolCallId) ?? {};
    accepted.push({
      ...result,
      ...(typeof result.task !== "string" && typeof args.task === "string"
        ? { task: args.task }
        : {}),
      ...(typeof result.mode !== "string" && typeof args.mode === "string"
        ? { mode: args.mode }
        : {}),
      ...(typeof result.cleanup !== "string" &&
      typeof args.cleanup === "string"
        ? { cleanup: args.cleanup }
        : {}),
      ...(typeof result.label !== "string" && typeof args.label === "string"
        ? { label: args.label }
        : {}),
    });
  }
  return accepted;
}

function readClientToolCalls(meta) {
  if (!Array.isArray(meta?.pendingToolCalls)) {
    return undefined;
  }
  const calls = [];
  for (const call of meta.pendingToolCalls) {
    if (!isRecord(call) || typeof call.name !== "string" || !call.name.trim()) {
      continue;
    }
    let params;
    try {
      params =
        typeof call.arguments === "string"
          ? JSON.parse(call.arguments)
          : call.arguments;
    } catch {
      continue;
    }
    if (!isRecord(params)) {
      continue;
    }
    calls.push({ name: call.name, params });
  }
  return calls.length > 0 ? calls : undefined;
}

function readTerminalToolError(messages) {
  const terminal = messages.at(-1);
  if (
    !isRecord(terminal) ||
    (terminal.role !== "toolResult" && terminal.role !== "tool_result") ||
    terminal.isError !== true
  ) {
    return undefined;
  }
  const error = readTextBlocks(terminal).join("\n").trim();
  return {
    toolName:
      typeof terminal.toolName === "string" && terminal.toolName.trim()
        ? terminal.toolName
        : "unknown",
    ...(error ? { error } : {}),
  };
}

// A turn needs only the tail of its session: the messages this attempt appended
// (timestamp >= attemptStartedAt) or, without a start time, the last user turn.
// OpenClaw's full visible read loads and parses every event of the session
// (V 2026-10-08: 100-180 MB sessions, 2.4-8.6 s of synchronous main-thread work
// per turn in the Worker and again in the Gateway). The tail comes from the same
// public paged reader Control UI uses, started from a cursor a bounded window
// before the newest visible message. The window grows until it reaches past the
// start of the attempt; anything the paged reader refuses (rewritten
// generation, moved anchor, a single message over its byte cap) falls back to
// the full read.
const NATIVE_TAIL_INITIAL_MESSAGES = 128;
const NATIVE_TAIL_MAX_MESSAGES = 8192;
const NATIVE_TAIL_PAGE_MESSAGES = 1000;
const NATIVE_TAIL_PAGE_BYTES = 64 * 1024 * 1024; // OpenClaw's per-page maximum
const NATIVE_TAIL_EARLIER_MESSAGES = 8; // messages older than the attempt kept as margin
const VISIBLE_MESSAGE_CURSOR_VERSION = 1; // OpenClaw 9.1 visible-message cursor

function nativeMessageTime(entry) {
  const value = entry.message.timestamp ?? entry.createdAt;
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

function nativeTailCoversAttempt(entries, minTimestamp) {
  const messages = entries.filter(entry => isRecord(entry.message));
  if (minTimestamp === undefined) {
    return messages.some(entry => entry.message.role === "user");
  }
  let earlier = 0;
  for (const entry of messages) {
    const time = nativeMessageTime(entry);
    if (time === undefined || time >= minTimestamp) break;
    earlier += 1;
  }
  return earlier >= Math.min(NATIVE_TAIL_EARLIER_MESSAGES, messages.length);
}

async function loadNativeTailRuntime() {
  const sdk = dirname(resolveOpenClawAgentRuntimePath());
  const [transcript, sqlite] = await Promise.all([
    import(pathToFileURL(join(sdk, "session-transcript-runtime.js")).href),
    import(pathToFileURL(join(sdk, "sqlite-runtime.js")).href),
  ]);
  return {
    readPage: transcript.readSessionTranscriptVisibleMessageDelta,
    readAnchor: (target, window) => {
      const read = sqlite.withOpenClawAgentDatabaseReadOnly(({ db }) => {
        const generation = db.prepare(
          "SELECT generation FROM transcript_rewrite_watermarks WHERE session_id = ?",
        ).get(target.sessionId)?.generation;
        const row = db.prepare(
          `SELECT event_seq, message_position FROM session_transcript_active_events
            WHERE session_id = ? AND message_position IS NOT NULL
            ORDER BY message_position DESC LIMIT 1 OFFSET ?`,
        ).get(target.sessionId, window);
        return {
          generation,
          anchor: row ? { eventSeq: Number(row.event_seq), messagePosition: Number(row.message_position) } : null,
        };
      }, { agentId: target.agentId });
      return read?.found ? read.value : undefined;
    },
  };
}

/**
 * Reads the visible tail of a native transcript that covers the attempt.
 * Returns undefined when the paged reader cannot serve it; callers then use
 * the full visible read.
 */
export async function readNativeTailEntries(target, options = {}) {
  const runtime = options.readTailPage && options.readTailAnchor
    ? { readPage: options.readTailPage, readAnchor: options.readTailAnchor }
    : await loadNativeTailRuntime();
  if (typeof runtime.readPage !== "function" || typeof runtime.readAnchor !== "function") return undefined;
  const maxMessages = options.tailMaxMessages ?? NATIVE_TAIL_MAX_MESSAGES;
  for (let window = options.tailInitialMessages ?? NATIVE_TAIL_INITIAL_MESSAGES; ; window *= 4) {
    const start = runtime.readAnchor(target, window);
    if (typeof start?.generation !== "string") return undefined;
    let cursor = start.anchor
      ? Buffer.from(JSON.stringify({
        agentId: target.agentId,
        generation: start.generation,
        sessionId: target.sessionId,
        lastEventSeq: start.anchor.eventSeq,
        lastMessagePosition: start.anchor.messagePosition,
        version: VISIBLE_MESSAGE_CURSOR_VERSION,
      }), "utf8").toString("base64url")
      : undefined;
    const entries = [];
    for (;;) {
      const page = await runtime.readPage({
        ...target,
        ...(cursor !== undefined ? { cursor } : {}),
        maxMessages: NATIVE_TAIL_PAGE_MESSAGES,
        maxBytes: NATIVE_TAIL_PAGE_BYTES,
      });
      if (page?.kind !== "page" || !Array.isArray(page.entries)) return undefined;
      if (page.entries.length === 0 && page.hasMore) return undefined;
      entries.push(...page.entries);
      cursor = page.cursor;
      if (!page.hasMore) break;
      if (entries.length > maxMessages + NATIVE_TAIL_PAGE_MESSAGES) return undefined;
    }
    if (!start.anchor || nativeTailCoversAttempt(entries, options.minTimestamp)) return entries;
    if (window >= maxMessages) return undefined;
  }
}

function projectNativeMessages(entries) {
  return entries.filter(entry => isRecord(entry.message)).map(entry => ({
    ...entry.message,
    ...(entry.message.timestamp == null && entry.createdAt ? {timestamp:Date.parse(entry.createdAt)} : {}),
  }));
}

export async function readNativeSessionMessages(sessionFile, options = {}) {
  if (isRecord(sessionFile)) {
    const target = sessionFile;
    if (!target.agentId || !target.sessionId || !target.sessionKey) {
      throw new Error("Native transcript read requires explicit session identity");
    }
    if (!options.readVisibleEntries) {
      let tail;
      try {
        tail = await readNativeTailEntries(target, {
          ...options,
          minTimestamp: Number.isFinite(options.attemptStartedAt) ? options.attemptStartedAt : undefined,
        });
      } catch {
        tail = undefined;
      }
      if (tail) return projectNativeMessages(tail);
    }
    const reader = options.readVisibleEntries ?? (await import(pathToFileURL(join(
      dirname(resolveOpenClawAgentRuntimePath()), "session-transcript-runtime.js",
    )).href)).readVisibleSessionTranscriptMessageEntries;
    const entries = await reader(target);
    if (!Array.isArray(entries)) throw new Error("Invalid native transcript projection");
    return projectNativeMessages(entries);
  }
  if (typeof sessionFile !== "string" || sessionFile.trim() === "") {
    return [];
  }
  const raw = await readFile(sessionFile, "utf8");
  const messages = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line);
      if (entry?.type === "message" && isRecord(entry.message)) {
        messages.push(entry.message);
      }
    } catch {
      // Ignore an incomplete trailing line while another native session write
      // is being atomically finalized.
    }
  }
  return messages;
}

export async function buildHarnessAttemptResult(agentResult, options = {}) {
  const agentMeta = agentResult?.meta?.agentMeta ?? agentResult?.meta ?? {};
  let messagesSnapshot = [];
  if (options.transcriptTarget) {
    // 9.1 owns transcripts in SQLite. Use its branch-aware public reader;
    // never silently fall back to stale JSONL or hide a failed identity read.
    messagesSnapshot = await readNativeSessionMessages(options.transcriptTarget, options);
  } else try {
    messagesSnapshot = await readNativeSessionMessages(agentMeta.sessionFile);
  } catch {
    messagesSnapshot = [];
  }

  let currentTurnStart = -1;
  for (let index = messagesSnapshot.length - 1; index >= 0; index -= 1) {
    if (messagesSnapshot[index]?.role === "user") {
      currentTurnStart = index;
      break;
    }
  }
  const currentTurnMessages = Number.isFinite(options.attemptStartedAt)
    ? messagesSnapshot.filter(message => {
        const time = typeof message.timestamp === 'number' ? message.timestamp : Date.parse(message.timestamp);
        return time >= options.attemptStartedAt;
      })
    : currentTurnStart >= 0
      ? messagesSnapshot.slice(currentTurnStart + 1)
      : messagesSnapshot;
  const currentAssistants = currentTurnMessages.filter(
    (message) => message?.role === "assistant",
  );
  let lastAssistant = currentAssistants.at(-1);
  let assistantTexts = readVisiblePayloadTexts(agentResult?.payloads);
  if (assistantTexts.length === 0 && lastAssistant) {
    assistantTexts = readTextBlocks(lastAssistant);
  }
  if (!lastAssistant && assistantTexts.length > 0) {
    lastAssistant = {
      role: "assistant",
      content: assistantTexts.map((text) => ({ type: "text", text })),
      provider: agentMeta.provider,
      model: agentMeta.model,
      usage: agentMeta.usage,
      stopReason: "stop",
      timestamp: Date.now(),
    };
    messagesSnapshot = [...messagesSnapshot, lastAssistant];
  }
  const lastAssistantTextMessageIndex = lastAssistant
    ? messagesSnapshot.lastIndexOf(lastAssistant)
    : undefined;
  const toolMetas = readToolMetas(currentTurnMessages);
  const lastToolError = readTerminalToolError(currentTurnMessages);
  const payloadMedia = readPayloadMedia(agentResult?.payloads);
  const acceptedSessionSpawns = [];
  const acceptedRunIds = new Set();
  for (const spawn of [
    ...(Array.isArray(agentResult?.acceptedSessionSpawns)
      ? agentResult.acceptedSessionSpawns
      : []),
    // A child can finish while the parent is still inside a long foreground
    // tool call. OpenClaw then appends an internal completion user event to
    // this same attempt, so limiting the scan to the last user message would
    // discard the earlier sessions_spawn result.
    ...readAcceptedSessionSpawns(options.transcriptTarget ? currentTurnMessages : messagesSnapshot),
  ]) {
    const runId =
      typeof spawn?.runId === "string" ? spawn.runId.trim() : undefined;
    if (!runId || acceptedRunIds.has(runId)) {
      continue;
    }
    acceptedRunIds.add(runId);
    acceptedSessionSpawns.push(spawn);
  }
  const successfulCronAdds = Number.isFinite(agentResult?.successfulCronAdds)
    ? Math.max(0, Number(agentResult.successfulCronAdds))
    : 0;
  const messagingToolSentTexts = Array.isArray(
    agentResult?.messagingToolSentTexts,
  )
    ? agentResult.messagingToolSentTexts
    : [];
  const messagingToolSentMediaUrls = Array.isArray(
    agentResult?.messagingToolSentMediaUrls,
  )
    ? agentResult.messagingToolSentMediaUrls
    : [];
  const messagingToolSentTargets = Array.isArray(
    agentResult?.messagingToolSentTargets,
  )
    ? agentResult.messagingToolSentTargets
    : [];
  const messagingToolSourceReplyPayloads = Array.isArray(
    agentResult?.messagingToolSourceReplyPayloads,
  )
    ? agentResult.messagingToolSourceReplyPayloads
    : [];
  const hadPotentialSideEffects =
    toolMetas.length > 0 ||
    acceptedSessionSpawns.length > 0 ||
    successfulCronAdds > 0 ||
    messagingToolSentTexts.length > 0 ||
    messagingToolSentMediaUrls.length > 0 ||
    messagingToolSentTargets.length > 0 ||
    messagingToolSourceReplyPayloads.length > 0;

  return {
    aborted: agentResult?.meta?.aborted === true,
    assistantTranscriptOwned: true,
    externalAbort: false,
    timedOut: false,
    idleTimedOut: false,
    timedOutDuringCompaction: false,
    promptError: null,
    promptErrorSource: null,
    sessionIdUsed: agentMeta.sessionId,
    sessionFileUsed: agentMeta.sessionFile,
    diagnosticTrace: agentResult?.diagnosticTrace,
    agentHarnessResultClassification:
      agentResult?.meta?.agentHarnessResultClassification,
    systemPromptReport: agentResult?.meta?.systemPromptReport,
    finalPromptText: agentResult?.meta?.finalPromptText,
    messagesSnapshot,
    assistantTexts,
    lastAssistantTextMessageIndex,
    toolMetas,
    acceptedSessionSpawns,
    lastAssistant,
    currentAttemptAssistant: lastAssistant,
    lastToolError,
    didSendViaMessagingTool: agentResult?.didSendViaMessagingTool === true,
    didDeliverSourceReplyViaMessageTool:
      agentResult?.didDeliverSourceReplyViaMessageTool === true,
    didSendDeterministicApprovalPrompt:
      agentResult?.didSendDeterministicApprovalPrompt === true,
    messagingToolSentTexts,
    messagingToolSentMediaUrls,
    messagingToolSentTargets,
    messagingToolSourceReplyPayloads,
    heartbeatToolResponse: agentResult?.heartbeatToolResponse,
    toolMediaUrls:
      payloadMedia.urls.length > 0 ? payloadMedia.urls : undefined,
    toolAudioAsVoice: payloadMedia.audioAsVoice || undefined,
    toolTrustedLocalMedia: payloadMedia.trustedLocalMedia || undefined,
    successfulCronAdds,
    cloudCodeAssistFormatError: false,
    // agentCommand already translated the native sessions_yield tool into
    // meta.yielded. Preserve that terminal semantic when reconstructing the
    // AgentHarness attempt across the worker IPC boundary; otherwise the
    // Gateway sees an empty tool-use turn and surfaces it as an error.
    yieldDetected: agentResult?.meta?.yielded === true || undefined,
    clientToolCalls: readClientToolCalls(agentResult?.meta),
    attemptUsage: agentMeta.usage,
    compactionCount: agentMeta.compactionCount,
    compactionTokensAfter: agentMeta.compactionTokensAfter,
    replayMetadata: {
      hadPotentialSideEffects,
      replaySafe: !hadPotentialSideEffects,
    },
    itemLifecycle: {
      startedCount: currentTurnMessages.length,
      completedCount: currentTurnMessages.length,
      activeCount: 0,
    },
  };
}
