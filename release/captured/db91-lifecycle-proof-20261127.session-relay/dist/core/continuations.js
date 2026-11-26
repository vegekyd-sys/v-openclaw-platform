// In-process consumers follow durable requester batches. They never start a
// second run or infer completion from a request receipt / target ACK.
export class RequesterContinuations {
  constructor(engine) { this.engine = engine; this.byBatch = new Map(); this.consumers = new Set(); }
  watch(runId, options = {}) {
    const batches = this.engine.ledger.batchesWhere(b => b.requester.runId === runId);
    if (!batches.length) return null;
    if (batches.some(b => b.requester.sessionKey !== options.sessionKey)) throw Error('Requester continuation session mismatch');
    const assertIdentity = () => {
      if (options.sessionId && this.engine.routes.entryOf(options.sessionKey, options.sessionKey.split(':')[1], { fresh: true })?.sessionId !== options.sessionId) throw Error('Requester continuation session identity changed');
    };
    assertIdentity();
    let resolve, reject;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    promise.catch(() => {});
    const c = { options, assertIdentity, pending: new Set(), seen: new Set(), started: new Set(), finals: [], done: false };
    const cleanup = () => {
      options.signal?.removeEventListener('abort', abort);
      this.consumers.delete(c);
      for (const id of c.seen) { const set = this.byBatch.get(id); set?.delete(c); if (!set?.size) this.byBatch.delete(id); }
    };
    c.fail = error => { if (c.done) return; c.done = true; cleanup(); reject(error instanceof Error ? error : Error(String(error))); };
    const abort = () => c.fail(options.signal.reason ?? Error('Requester continuation cancelled'));
    c.add = batch => {
      if (c.seen.has(batch.batchId)) return;
      if (batch.requester.sessionKey !== options.sessionKey) throw Error('Requester continuation crossed session ownership');
      c.seen.add(batch.batchId); c.pending.add(batch.batchId);
      let set = this.byBatch.get(batch.batchId); if (!set) this.byBatch.set(batch.batchId, set = new Set()); set.add(c);
    };
    c.update = batch => {
      if (c.done || !c.pending.has(batch.batchId)) return;
      try {
        assertIdentity();
        if (batch.phase === 'skipped') throw Error(`Requester continuation skipped: ${batch.skipReason}`);
        if (batch.wake.startedAt && !c.started.has(batch.wake.runId)) {
          c.started.add(batch.wake.runId);
          options.onRunStarted?.({ runId: batch.wake.runId, sessionKey: batch.requester.sessionKey });
        }
        if (!batch.wake.endedAt) return;
        if (batch.wake.status !== 'ok') throw Error(`Requester continuation ${batch.wake.status}: ${batch.wake.result?.error ?? ''}`);
        const descendants = this.engine.ledger.batchesWhere(b => b.requester.runId === batch.wake.runId);
        c.pending.delete(batch.batchId);
        if (descendants.length) {
          for (const child of descendants) c.add(child);
          for (const child of descendants) c.update(child);
        } else {
          const payloads = batch.wake.result?.finals;
          if (!payloads?.some(p => typeof p.text === 'string' && p.text.trim())) throw Error('Requester continuation produced no visible final');
          c.finals.push({ runId: batch.wake.runId, payloads });
        }
        if (!c.pending.size && !c.done) {
          c.done = true; cleanup();
          resolve({ runId: c.finals.at(-1)?.runId, payloads: c.finals.flatMap(r => r.payloads), meta: {} });
        }
      } catch (error) { c.fail(error); }
    };
    this.consumers.add(c);
    for (const batch of batches) c.add(batch);
    options.signal?.addEventListener('abort', abort, { once: true });
    // Consumers can install their ownership / pending flag before a cached
    // terminal result is replayed. No polling, transcript heuristics or model call.
    queueMicrotask(() => {
      if (options.signal?.aborted) abort();
      else for (const batch of batches) c.update(this.engine.ledger.getBatch(batch.batchId));
    });
    return { promise, close: () => c.fail(Error('Requester continuation closed')) };
  }
  prepare(batch, req) {
    let next = req;
    for (const c of this.byBatch.get(batch.batchId) ?? []) {
      try { c.assertIdentity(); next = c.options.prepareInput?.(next) ?? next; }
      catch (error) { c.fail(error); }
    }
    return next;
  }
  changed(batch) { for (const c of [...(this.byBatch.get(batch.batchId) ?? [])]) c.update(batch); }
  started(batch) {
    this.changed(batch);
    for (const c of [...(this.byBatch.get(batch.batchId) ?? [])]) {
      try { c.options.onExecutionStarted?.({ runId: batch.wake.runId }); } catch (error) { c.fail(error); }
    }
  }
  stop() { for (const c of [...this.consumers]) c.fail(Error('Requester continuation gateway stopped')); }
}
