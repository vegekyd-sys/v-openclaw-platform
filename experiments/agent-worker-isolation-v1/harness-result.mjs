import { readFile } from "node:fs/promises";

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

export async function readNativeSessionMessages(sessionFile) {
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

export async function buildHarnessAttemptResult(agentResult) {
  const agentMeta = agentResult?.meta?.agentMeta ?? agentResult?.meta ?? {};
  let messagesSnapshot = [];
  try {
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
  const currentTurnMessages =
    currentTurnStart >= 0
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
    ...readAcceptedSessionSpawns(currentTurnMessages),
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
