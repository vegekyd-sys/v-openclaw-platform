export class NativeLaneProgressBridge {
  constructor() {
    this.handlers = new Map();
    this.relayed = 0;
    this.missing = 0;
    this.failed = 0;
  }

  register(requestId, handler) {
    if (typeof requestId !== "string" || requestId.trim() === "") {
      throw new Error("requestId is required");
    }
    if (typeof handler !== "function") {
      throw new Error("native lane progress handler is required");
    }
    this.handlers.set(requestId, handler);
    return () => {
      if (this.handlers.get(requestId) === handler) {
        this.handlers.delete(requestId);
      }
    };
  }

  async relay(progress) {
    const handler = this.handlers.get(progress?.requestId);
    if (!handler) {
      this.missing += 1;
      return false;
    }
    try {
      await handler(progress);
      this.relayed += 1;
      return true;
    } catch (error) {
      this.failed += 1;
      throw error;
    }
  }

  status() {
    return {
      activeRequests: this.handlers.size,
      relayed: this.relayed,
      missing: this.missing,
      failed: this.failed,
    };
  }
}
