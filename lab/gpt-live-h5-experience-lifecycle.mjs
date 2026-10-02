/** Keep an interactive candidate open until its TTL, cancellation, or Gateway exit. */
export function waitForExperience({durationMs, gateway, signal}) {
  if (!Number.isSafeInteger(durationMs) || durationMs < 1)
    throw new RangeError('Experience duration must be a positive safe integer');
  if (!gateway || typeof gateway.once !== 'function' || typeof gateway.removeListener !== 'function')
    throw new TypeError('Experience Gateway must be an event emitter');
  if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function'))
    throw new TypeError('Experience signal must be an AbortSignal');
  const exited = () => gateway.exitCode != null || gateway.signalCode != null;
  const exitError = (code = gateway.exitCode, exitSignal = gateway.signalCode) =>
    new Error(`Candidate Gateway exited while experience was open (code=${code ?? 'none'}, signal=${exitSignal ?? 'none'})`);
  if (exited()) return Promise.reject(exitError());
  if (signal?.aborted) return Promise.resolve('stopped');

  return new Promise((resolve, reject) => {
    let timer, settled = false;
    const startedAt = performance.now();
    const cleanup = () => {
      clearTimeout(timer);
      gateway.removeListener('exit', onExit);
      gateway.removeListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const onExit = (code, exitSignal) => finish(undefined, exitError(code, exitSignal));
    const onError = error => finish(undefined, error instanceof Error ? error : new Error('Candidate Gateway failed while experience was open'));
    const onAbort = () => finish('stopped');
    const armExpiry = () => {
      if (settled) return;
      const remaining = durationMs - (performance.now() - startedAt);
      if (remaining <= 0) finish('expired');
      else timer = setTimeout(armExpiry, Math.min(Math.ceil(remaining), 2147483647));
    };
    gateway.once('exit', onExit);
    gateway.once('error', onError);
    signal?.addEventListener('abort', onAbort, {once: true});
    armExpiry();
    // Covers sources that become terminal while their listeners are installed.
    if (exited()) onExit(gateway.exitCode, gateway.signalCode);
    else if (signal?.aborted) onAbort();
  });
}
