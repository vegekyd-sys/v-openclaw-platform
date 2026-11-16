function messageForEvent(event) {
  return event?.type === "message" &&
    event.message &&
    typeof event.message === "object"
    ? event.message
    : undefined;
}

function activeBranch(events) {
  const entries = events.filter(
    (event) =>
      event &&
      typeof event === "object" &&
      typeof event.id === "string" &&
      event.appendMode !== "side",
  );
  if (entries.length === 0) {
    return [];
  }
  const byId = new Map(entries.map((event) => [event.id, event]));
  const referenced = new Set(
    entries
      .map((event) => event.parentId)
      .filter((parentId) => typeof parentId === "string"),
  );
  const leaf =
    [...entries].reverse().find((event) => !referenced.has(event.id)) ??
    entries.at(-1);
  const branch = [];
  const visited = new Set();
  let cursor = leaf;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    branch.push(cursor);
    cursor =
      typeof cursor.parentId === "string"
        ? byId.get(cursor.parentId)
        : undefined;
  }
  return branch.reverse();
}

export function findInterruptedToolCalls(events) {
  const branch = activeBranch(events);
  const completedToolCallIds = new Set();
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const message = messageForEvent(branch[index]);
    if (!message) {
      continue;
    }
    if (
      message.role === "toolResult" &&
      typeof message.toolCallId === "string"
    ) {
      completedToolCallIds.add(message.toolCallId);
      continue;
    }
    if (message.role === "user") {
      return [];
    }
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      return [];
    }
    const toolCalls = message.content
      .filter(
        (part) =>
          part &&
          typeof part === "object" &&
          part.type === "toolCall" &&
          typeof part.id === "string" &&
          typeof part.name === "string",
      )
      .filter((part) => !completedToolCallIds.has(part.id))
      .map((part) => ({
        toolCallId: part.id,
        toolName: part.name,
      }));
    return toolCalls;
  }
  return [];
}

export async function closeInterruptedToolCalls({
  withSessionTranscriptWriteLock,
  target,
  config,
  error,
}) {
  let appended = 0;
  await withSessionTranscriptWriteLock(
    {
      ...target,
      config,
    },
    async ({ readEvents, appendMessage, publishUpdate }) => {
      const toolCalls = findInterruptedToolCalls(await readEvents());
      for (const toolCall of toolCalls) {
        const result = await appendMessage({
          config,
          message: {
            role: "toolResult",
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            content: [
              {
                type: "text",
                text:
                  "Tool execution was interrupted because the isolated worker " +
                  `terminated before reporting completion: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
              },
            ],
            isError: true,
            timestamp: Date.now(),
          },
        });
        if (result?.appended === true) {
          appended += 1;
        }
      }
      if (appended > 0) {
        await publishUpdate();
      }
    },
  );
  return appended;
}
