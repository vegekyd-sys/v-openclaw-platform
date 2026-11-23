import { cloneWireData } from './native-harness-data.mjs';

// Transfer a durable message fact, not the Gateway recorder or writer lease.
export function snapshotPersistedUserTurn(recorder, identity) {
  if (recorder?.hasPersisted?.() !== true) return undefined;
  const message = recorder.getPersistedMessage?.();
  if (message?.role !== 'user' || typeof message.idempotencyKey !== 'string' || !message.idempotencyKey) return undefined;
  for (const key of ['runId', 'sessionId', 'sessionKey', 'agentId']) {
    if (typeof identity?.[key] !== 'string' || !identity[key]) throw new Error('Missing persisted user turn identity');
  }
  return cloneWireData({ ...identity, message }, 'persistedUserTurn');
}

export function acknowledgeGatewayPersistedUserTurn(input, request) {
  const snapshot = request.nativePersistedUserTurn;
  if (!snapshot || input.operation === 'settled-tool-finalization') return false;
  for (const key of ['runId', 'sessionId', 'sessionKey', 'agentId']) {
    if (snapshot[key] !== request[key] || snapshot[key] !== input[key]) throw new Error('Persisted user turn owner mismatch');
  }
  if (request.suppressPromptPersistence !== true) throw new Error('Persisted user turn requires Gateway persistence ownership');
  const message = cloneWireData(snapshot.message, 'persistedUserTurn.message');
  if (message?.role !== 'user' || typeof message.idempotencyKey !== 'string' || !message.idempotencyKey) throw new Error('Invalid persisted user turn message');
  const recorder = input.userTurnTranscriptRecorder;
  if (typeof recorder?.markRuntimePersisted !== 'function' || recorder.isBlocked?.() !== true) throw new Error('Missing suppressed native user turn recorder');
  const existing = recorder.getPersistedMessage?.();
  if (existing && existing.idempotencyKey !== message.idempotencyKey) throw new Error('Conflicting native user turn identity');
  if (!existing) recorder.markRuntimePersisted(message);
  return true;
}

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
