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

function readToolMetas(messages) {
  const metas = [];
  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const block of message.content) {
      if (
        isRecord(block) &&
        (block.type === "toolCall" || block.type === "tool_use")
      ) {
        metas.push({
          toolName:
            typeof block.name === "string" && block.name.trim()
              ? block.name
              : "unknown",
        });
      }
    }
  }
  return metas;
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
    systemPromptReport: agentResult?.meta?.systemPromptReport,
    finalPromptText: agentResult?.meta?.finalPromptText,
    messagesSnapshot,
    assistantTexts,
    lastAssistantTextMessageIndex,
    toolMetas,
    acceptedSessionSpawns: agentResult?.acceptedSessionSpawns ?? [],
    lastAssistant,
    currentAttemptAssistant: lastAssistant,
    didSendViaMessagingTool: agentResult?.didSendViaMessagingTool === true,
    didDeliverSourceReplyViaMessageTool:
      agentResult?.didDeliverSourceReplyViaMessageTool === true,
    didSendDeterministicApprovalPrompt:
      agentResult?.didSendDeterministicApprovalPrompt === true,
    messagingToolSentTexts: agentResult?.messagingToolSentTexts ?? [],
    messagingToolSentMediaUrls: agentResult?.messagingToolSentMediaUrls ?? [],
    messagingToolSentTargets: agentResult?.messagingToolSentTargets ?? [],
    messagingToolSourceReplyPayloads:
      agentResult?.messagingToolSourceReplyPayloads ?? [],
    heartbeatToolResponse: agentResult?.heartbeatToolResponse,
    attemptUsage: agentMeta.usage,
    compactionCount: agentMeta.compactionCount,
    compactionTokensAfter: agentMeta.compactionTokensAfter,
    replayMetadata: {
      hadPotentialSideEffects: toolMetas.length > 0,
      replaySafe: toolMetas.length === 0,
    },
    itemLifecycle: {
      startedCount: currentTurnMessages.length,
      completedCount: currentTurnMessages.length,
      activeCount: 0,
    },
  };
}
