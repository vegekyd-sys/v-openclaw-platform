const listeners = new Set();
let sequence = 0;

export function onInternalDiagnosticEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitFakeTrustedDiagnosticEvent(event) {
  sequence += 1;
  for (const listener of listeners) {
    listener(
      { ...event, seq: sequence, ts: Date.now() },
      { trusted: true },
    );
  }
}
