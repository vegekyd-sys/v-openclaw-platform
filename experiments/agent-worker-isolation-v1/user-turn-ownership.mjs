function messageText(message) {
  if (!message || message.role !== "user") {
    return undefined;
  }
  if (typeof message.content === "string") {
    return message.content.trim();
  }
  if (!Array.isArray(message.content)) {
    return undefined;
  }
  const text = message.content
    .filter(
      (block) =>
        block &&
        typeof block === "object" &&
        block.type === "text" &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || undefined;
}

export function shouldWorkerPersistUserTurn(recorder) {
  if (!recorder) {
    return true;
  }
  if (
    typeof recorder.hasPersisted === "function" &&
    recorder.hasPersisted()
  ) {
    return false;
  }
  if (typeof recorder.isBlocked === "function" && recorder.isBlocked()) {
    return false;
  }
  return true;
}

export function acknowledgeWorkerUserTurn({
  recorder,
  messages,
  expectedText,
}) {
  if (
    !recorder ||
    typeof recorder.hasPersisted !== "function" ||
    typeof recorder.isBlocked !== "function" ||
    typeof recorder.markRuntimePersisted !== "function"
  ) {
    return "unavailable";
  }
  if (recorder.hasPersisted()) {
    return "already-persisted";
  }
  if (recorder.isBlocked()) {
    return "blocked";
  }

  const expected =
    typeof expectedText === "string" ? expectedText.trim() : undefined;
  if (!expected || !Array.isArray(messages)) {
    return "not-found";
  }
  const persistedMessage = messages
    .toReversed()
    .find((message) => messageText(message) === expected);
  if (!persistedMessage) {
    return "not-found";
  }

  recorder.markRuntimePersisted(persistedMessage);
  if (!recorder.hasPersisted()) {
    throw new Error(
      "Agent Harness did not acknowledge the user turn persisted by the worker",
    );
  }
  return "acknowledged";
}
