export class CapacityGate {
  constructor(max = Number(process.env.VLAB_SANDBOX_MAX_CONCURRENT ?? 1)) {
    if (!Number.isInteger(max) || max < 1) throw new Error("capacity max must be a positive integer");
    this.max = max;
    this.active = new Set();
    this.waiters = [];
  }

  async acquire(key) {
    if (this.active.has(key)) return;
    if (this.active.size < this.max) {
      this.active.add(key);
      return;
    }
    await new Promise((resolve) => this.waiters.push({ key, resolve }));
  }

  reserve(key) {
    this.active.add(key);
  }

  release(key) {
    if (!this.active.delete(key)) return;
    while (this.waiters.length > 0 && this.active.size < this.max) {
      const waiter = this.waiters.shift();
      if (this.active.has(waiter.key)) {
        waiter.resolve();
        continue;
      }
      this.active.add(waiter.key);
      waiter.resolve();
    }
  }

  snapshot() {
    return { max: this.max, active: this.active.size, waiting: this.waiters.length };
  }
}
