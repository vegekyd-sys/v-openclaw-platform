// Per-session queue of ledger-driven turns (design §4.3): ordered by class, FIFO within a class.
//   ask (0)  >  wake = collect (1)  >  request (2)
// An item is `ready` once its anchor is posted; pump only starts ready items, but positions
// count every item so a request accepted while another's anchor is still posting queues behind it.

export const CLASS_ORDER = Object.freeze({ ask: 0, wake: 1, collect: 1, request: 2 });

let seq = 0;

export class SessionQueue {
  constructor() { this.items = []; }

  get length() { return this.items.length; }

  has(kind, id) { return this.items.some((it) => it.kind === kind && it.id === id); }

  /** Insert (or keep) an item; returns it. */
  add(kind, id, { ready = true, at = Date.now() } = {}) {
    const existing = this.items.find((it) => it.kind === kind && it.id === id);
    if (existing) {
      if (ready) existing.ready = true;
      return existing;
    }
    const item = { kind, id, cls: CLASS_ORDER[kind] ?? 2, seq: (seq += 1), ready, enqueuedAt: at };
    this.items.push(item);
    this.items.sort((a, b) => a.cls - b.cls || a.seq - b.seq);
    return item;
  }

  markReady(kind, id) {
    const it = this.items.find((x) => x.kind === kind && x.id === id);
    if (it) it.ready = true;
    return Boolean(it);
  }

  remove(kind, id) {
    const before = this.items.length;
    this.items = this.items.filter((it) => !(it.kind === kind && it.id === id));
    return this.items.length !== before;
  }

  /** First item that may start now. */
  head() { return this.items.find((it) => it.ready) ?? null; }

  /** Items that would run before a new item of `kind` (all items of a higher or equal class). */
  aheadOf(kind) {
    const cls = CLASS_ORDER[kind] ?? 2;
    return this.items.filter((it) => it.cls <= cls).length;
  }

  /** Items ahead of an existing item. */
  positionOf(kind, id) {
    const idx = this.items.findIndex((it) => it.kind === kind && it.id === id);
    return idx < 0 ? -1 : idx;
  }

  countKind(kind) { return this.items.filter((it) => it.kind === kind).length; }
}
